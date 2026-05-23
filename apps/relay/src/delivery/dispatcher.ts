import { deleteChannelByPlatformUser } from '../db/queries';
import type { DeliveryChannel, DispatchJob, Env } from '../env';

import { type ApnsPayload, sendApns } from './apns';
import { type FcmPayload, sendFcm } from './fcm';
import {
  escapeMd,
  type InlineKeyboardMarkup,
  sendMessage,
  TelegramApiError,
} from './telegram';

/** Thrown by `dispatch` when a channel is permanently undeliverable. */
class DeadChannelError extends Error {
  constructor(
    readonly channel: DeliveryChannel,
    message: string,
  ) {
    super(message);
    this.name = 'DeadChannelError';
  }
}

/**
 * Queue consumer. Each message is an independent delivery; we ack on success and
 * on permanent failure (dead channel), and retry on transient failure so Queues'
 * built-in retry/backoff handles it.
 */
export async function handleQueue(batch: MessageBatch<DispatchJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      await dispatch(env, message.body);
      message.ack();
    } catch (err) {
      if (err instanceof DeadChannelError) {
        // Token revoked / chat gone: reap the channel and stop retrying.
        await deleteChannelByPlatformUser(env.DB, err.channel.platform, err.channel.platformUserId);
        console.error(`dispatch: dropping dead ${err.channel.platform} channel: ${err.message}`);
        message.ack();
      } else {
        console.error('dispatch: transient failure, retrying', err);
        message.retry();
      }
    }
  }
}

async function dispatch(env: Env, job: DispatchJob): Promise<void> {
  if (job.kind === 'notification') {
    switch (job.channel.platform) {
      case 'telegram':
        return dispatchTelegramNotification(env, job);
      case 'ios':
        return dispatchPush(job.channel, await sendApns(env, job.channel.platformUserId, buildApnsPayload(job)));
      case 'android':
        return dispatchPush(job.channel, await sendFcm(env, job.channel.platformUserId, buildFcmPayload(job)));
    }
  }

  // pendingRequest pushes are interactive (approve/deny) → Telegram only.
  return dispatchTelegramPendingRequest(env, job);
}

/** Turn an APNs/FCM result into the dispatcher's ack/dead/retry contract. */
function dispatchPush(channel: DeliveryChannel, result: { ok: true } | { ok: false; reason: 'dead' | 'transient' }): void {
  if (result.ok) {
    return;
  }
  if (result.reason === 'dead') {
    throw new DeadChannelError(channel, 'push provider reported the token as unregistered');
  }
  throw new Error(`push transient failure for ${channel.platform}`);
}

// ---------------------------------------------------------------------------
// Push payload builders
// ---------------------------------------------------------------------------

/** thread-id / tag = sender DID, so the OS groups notifications per app. */
function buildApnsPayload(job: Extract<DispatchJob, { kind: 'notification' }>): ApnsPayload {
  return {
    aps: {
      alert: { title: job.title, body: job.body },
      sound: 'default',
      'mutable-content': 1,
      'thread-id': job.senderDid,
    },
    senderDid: job.senderDid,
    ...(job.senderHandle !== undefined ? { senderHandle: job.senderHandle } : {}),
    notifId: job.notifId,
    ...(job.uri !== undefined ? { uri: job.uri } : {}),
  };
}

function buildFcmPayload(job: Extract<DispatchJob, { kind: 'notification' }>): FcmPayload {
  // FCM `data` values must all be strings.
  const data: Record<string, string> = {
    senderDid: job.senderDid,
    notifId: job.notifId,
  };
  if (job.senderHandle !== undefined) {
    data.senderHandle = job.senderHandle;
  }
  if (job.uri !== undefined) {
    data.uri = job.uri;
  }
  return {
    notification: { title: job.title, body: job.body },
    android: { priority: 'high', notification: { channel_id: 'default', tag: job.senderDid } },
    data,
  };
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

async function dispatchTelegramNotification(
  env: Env,
  job: Extract<DispatchJob, { kind: 'notification' }>,
): Promise<void> {
  const text = `*${escapeMd(job.title)}*\n${escapeMd(job.body)}`;
  const replyMarkup: InlineKeyboardMarkup | undefined =
    job.uri !== undefined ? { inline_keyboard: [[{ text: 'Open', url: job.uri }]] } : undefined;
  await sendTelegram(env, job.channel, {
    chat_id: job.channel.platformUserId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: replyMarkup,
  });
}

async function dispatchTelegramPendingRequest(
  env: Env,
  job: Extract<DispatchJob, { kind: 'pendingRequest' }>,
): Promise<void> {
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
  await sendTelegram(env, job.channel, {
    chat_id: job.channel.platformUserId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: replyMarkup,
  });
}

/** Send a Telegram message, translating its dead-channel errors. */
async function sendTelegram(
  env: Env,
  channel: DeliveryChannel,
  message: Parameters<typeof sendMessage>[1],
): Promise<void> {
  try {
    await sendMessage(env, message);
  } catch (err) {
    if (err instanceof TelegramApiError && isDeadTelegramChannel(err)) {
      throw new DeadChannelError(channel, err.description);
    }
    throw err;
  }
}

/** Telegram errors that mean the channel is permanently undeliverable. */
function isDeadTelegramChannel(err: TelegramApiError): boolean {
  if (err.errorCode === 403) {
    // "Forbidden: bot was blocked by the user" (and similar 403s).
    return true;
  }
  if (err.errorCode === 400 && /chat not found/i.test(err.description)) {
    return true;
  }
  return false;
}
