import type { Did } from '@atcute/lexicons';
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

import { channelLimit, withinChannelLimits } from '../src/delivery/limits';

it('email is capped; push/telegram/dm/webhook are not', () => {
  const email = channelLimit(env, 'email');
  expect(email?.perRecipientPerDay).toBeGreaterThan(0);
  expect(email?.globalPerDay).toBeGreaterThan(0);
  for (const c of ['push', 'telegram', 'dm', 'webhook'] as const) {
    expect(channelLimit(env, c)).toBeUndefined();
  }
});

it('uncapped channels always pass and never limit', async () => {
  const did: Did = 'did:plc:limits-push';
  for (let i = 0; i < 50; i++) {
    expect(await withinChannelLimits(env, 'push', did)).toBe(true);
  }
});

it('email caps per recipient per day, independently per recipient', async () => {
  const a: Did = 'did:plc:limits-emailA';
  const b: Did = 'did:plc:limits-emailB';
  const perRecipient = channelLimit(env, 'email')!.perRecipientPerDay!;
  // Isolate the per-recipient cap from the relay-global cap: raise the global so
  // A exhausting its own budget can't also drain the shared global budget (which
  // would block B for the wrong reason). Tests the per-recipient dimension only.
  env.EMAIL_DAILY_GLOBAL = String(perRecipient * 100);

  // A can receive up to the per-recipient cap…
  for (let i = 0; i < perRecipient; i++) {
    expect(await withinChannelLimits(env, 'email', a)).toBe(true);
  }
  // …the next email to A is blocked.
  expect(await withinChannelLimits(env, 'email', a)).toBe(false);

  // B has its own budget — unaffected by A hitting the cap.
  expect(await withinChannelLimits(env, 'email', b)).toBe(true);
});
