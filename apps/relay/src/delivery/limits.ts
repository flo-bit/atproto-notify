// Per-channel delivery caps, enforced at send-time fan-out (see xrpc/send.ts).
//
// Two scopes per capped channel, both rolling-daily:
//   * per-recipient — how many of this channel ONE user receives per day, across
//     all apps (anti-spam / cost control for them).
//   * relay-global  — how many of this channel the whole relay sends per day
//     (stay under the provider's quota, e.g. comail's email plan).
//
// Counting happens when we COMMIT to a delivery (before enqueue). That's
// conservative for the global cap — a send that later fails still consumed its
// slot — which is the safe direction for a provider quota (under-send, never
// over-send). Retries of a queued job are not separately counted.
import type { DeliveryChannelKind } from '../db/queries';
import type { Env } from '../env';
import { checkAndIncrementAll, type RateCheck } from '../ratelimit';

const DAY_SECONDS = 24 * 60 * 60;

export interface ChannelLimit {
  /** Max deliveries of this channel to one recipient per rolling day. */
  perRecipientPerDay?: number;
  /** Max deliveries of this channel across the whole relay per rolling day. */
  globalPerDay?: number;
}

/** Parse a non-negative integer env var, falling back to `fallback`. */
function intEnv(value: string | undefined, fallback: number): number {
  const n = value !== undefined ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * The daily caps for a channel, or `undefined` if the channel is uncapped. Only
 * email is capped today (it costs money and the provider has a quota); push /
 * telegram / dm / webhook are free fan-out, so they're unlimited. Add a channel
 * here to cap it.
 */
export function channelLimit(env: Env, channel: DeliveryChannelKind): ChannelLimit | undefined {
  if (channel === 'email') {
    return {
      perRecipientPerDay: intEnv(env.EMAIL_DAILY_PER_RECIPIENT, 10),
      globalPerDay: intEnv(env.EMAIL_DAILY_GLOBAL, 100),
    };
  }
  return undefined;
}

/**
 * Whether a delivery of `channel` to `recipient` is within the channel's daily
 * caps, consuming one slot from each configured cap when allowed (and nothing
 * when denied — see {@link checkAndIncrementAll}). Uncapped channels always pass
 * and never touch KV.
 */
export async function withinChannelLimits(
  env: Env,
  channel: DeliveryChannelKind,
  recipient: string,
): Promise<boolean> {
  const limit = channelLimit(env, channel);
  if (limit === undefined) return true;

  const checks: RateCheck[] = [];
  if (limit.perRecipientPerDay !== undefined) {
    checks.push({
      key: `rl:chan:${channel}:rcpt:${recipient}`,
      limit: limit.perRecipientPerDay,
      windowSeconds: DAY_SECONDS,
    });
  }
  if (limit.globalPerDay !== undefined) {
    checks.push({ key: `rl:chan:${channel}:all`, limit: limit.globalPerDay, windowSeconds: DAY_SECONDS });
  }
  if (checks.length === 0) return true;

  const { allowed } = await checkAndIncrementAll(env.CACHE, checks);
  return allowed;
}
