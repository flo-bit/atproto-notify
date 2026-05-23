import { deleteChannelByPlatformUser } from '../db/queries';
import type { DispatchJob, Env } from '../env';

import {
  escapeMd,
  type InlineKeyboardMarkup,
  sendMessage,
  TelegramApiError,
} from './telegram';

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
      if (err instanceof TelegramApiError && isDeadChannel(err)) {
        // The user blocked the bot or the chat is gone: reap the channel and
        // stop retrying this message.
        const { channel } = message.body;
        await deleteChannelByPlatformUser(env.DB, channel.platform, channel.platformUserId);
        console.error(`dispatch: dropping dead channel ${channel.platformUserId}: ${err.description}`);
        message.ack();
      } else {
        console.error('dispatch: transient failure, retrying', err);
        message.retry();
      }
    }
  }
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

async function dispatch(env: Env, job: DispatchJob): Promise<void> {
  if (job.kind === 'notification') {
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
