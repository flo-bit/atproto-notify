import type { Did, Nsid } from '@atcute/lexicons';

import { mintRelayJwt } from '../auth/relay-signer';
import { deleteChannelByPlatformUser, deletePushSubscription } from '../db/queries';
import type { DispatchJob, Env } from '../env';
import { callbackAppFor } from '../lib/apps';

import {
  escapeMd,
  type InlineKeyboardMarkup,
  sendMessage,
  TelegramApiError,
} from './telegram';
import { sendWebPush, WebPushError } from './webpush';

const SUBSCRIBER_CHANGED_LXM = 'pub.atmo.notify.subscriberChanged' as Nsid;

/**
 * Queue consumer. Each message is an independent delivery; we ack on success and
 * on permanent failure (dead channel/subscription), and retry on transient
 * failure so Queues' built-in retry/backoff handles it.
 */
export async function handleQueue(batch: MessageBatch<DispatchJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      await dispatch(env, message.body);
      message.ack();
    } catch (err) {
      if (await reapIfDead(env, message.body, err)) {
        message.ack();
      } else {
        console.error('dispatch: transient failure, retrying', err);
        message.retry();
      }
    }
  }
}

/** If `err` means the target is permanently undeliverable, reap it and return true. */
async function reapIfDead(env: Env, job: DispatchJob, err: unknown): Promise<boolean> {
  // Relay→app callback has no `channel`. A 4xx means the app rejected the call
  // (bad/forged token, unknown method) — retrying won't help, so drop it; 5xx /
  // network errors fall through to retry.
  if (job.kind === 'subscriberChanged') {
    return err instanceof SubscriberCallbackError && err.statusCode >= 400 && err.statusCode < 500;
  }

  const { channel } = job;
  if (channel.platform === 'telegram' && err instanceof TelegramApiError && isDeadChannel(err)) {
    // The user blocked the bot or the chat is gone.
    await deleteChannelByPlatformUser(env.DB, channel.platform, channel.platformUserId);
    console.error(`dispatch: dropping dead telegram channel ${channel.platformUserId}: ${err.description}`);
    return true;
  }
  if (
    channel.platform === 'webpush' &&
    err instanceof WebPushError &&
    (err.statusCode === 404 || err.statusCode === 410)
  ) {
    // The push subscription expired or was unsubscribed.
    await deletePushSubscription(env.DB, channel.endpoint);
    console.error(`dispatch: dropping dead push subscription (${err.statusCode})`);
    return true;
  }
  return false;
}

/** Telegram errors that mean the channel is permanently undeliverable. */
function isDeadChannel(err: TelegramApiError): boolean {
  if (err.errorCode === 403) {
    // "Forbidden: bot was blocked by the user" (and similar 403s).
    return true;
  }
  if (err.errorCode === 400 && /chat not found/i.test(err.description)) {
    return true;
  }
  return false;
}

/** Non-2xx response from an app's subscriberChanged endpoint. */
class SubscriberCallbackError extends Error {
  constructor(readonly statusCode: number) {
    super(`subscriberChanged callback failed: ${statusCode}`);
    this.name = 'SubscriberCallbackError';
  }
}

/**
 * Relay → app callback: tell `job.sender` that `job.recipient` enabled/disabled
 * notifications. Signed with the relay's own key (the app verifies `iss` is the
 * relay). Idempotent state, so retries are safe.
 */
async function sendSubscriberCallback(
  env: Env,
  job: Extract<DispatchJob, { kind: 'subscriberChanged' }>,
): Promise<void> {
  const app = callbackAppFor(job.sender);
  if (app?.callbackUrl === undefined) {
    // Deregistered between enqueue and delivery — nothing to do.
    return;
  }
  const jwt = await mintRelayJwt(env, job.sender as Did, SUBSCRIBER_CHANGED_LXM);
  const res = await fetch(`${app.callbackUrl}/xrpc/${SUBSCRIBER_CHANGED_LXM}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      recipient: job.recipient,
      enabled: job.enabled,
      changedAt: job.changedAt,
    }),
  });
  if (!res.ok) {
    throw new SubscriberCallbackError(res.status);
  }
}

async function dispatch(env: Env, job: DispatchJob): Promise<void> {
  if (job.kind === 'subscriberChanged') {
    await sendSubscriberCallback(env, job);
    return;
  }

  if (job.kind === 'notification') {
    if (job.channel.platform === 'webpush') {
      await sendWebPush(env, job.channel, {
        title: job.title,
        body: job.body,
        uri: job.uri,
        senderDid: job.senderDid,
      });
      return;
    }

    const text = `*${escapeMd(job.title)}*\n${escapeMd(job.body)}`;
    const replyMarkup: InlineKeyboardMarkup | undefined =
      job.uri !== undefined ? { inline_keyboard: [[{ text: 'Open', url: job.uri }]] } : undefined;
    await sendMessage(env, {
      chat_id: job.channel.platformUserId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: replyMarkup,
    });
    return;
  }

  // pendingRequest: title is the bold header, description the body line, and the
  // sender DID is shown in small/monospace so the user can verify it.
  const descriptionLine =
    job.senderDescription !== undefined ? `\n\n_${escapeMd(job.senderDescription)}_` : '';
  const text =
    `🔔 *${escapeMd(job.senderTitle)}* wants to send you notifications${descriptionLine}` +
    `\n\n\`${escapeMd(job.senderDid)}\``;
  const replyMarkup: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Allow', callback_data: `approve:${job.requestId}` },
        { text: '❌ Deny', callback_data: `deny:${job.requestId}` },
      ],
    ],
  };
  await sendMessage(env, {
    chat_id: job.channel.platformUserId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: replyMarkup,
  });
}
