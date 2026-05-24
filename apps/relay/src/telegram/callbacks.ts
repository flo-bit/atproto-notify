import type { Did } from '@atcute/lexicons';

import * as q from '../db/queries';
import type { Env } from '../env';
import { answerCallbackQuery, editMessageText } from '../delivery/telegram';
import { now } from '../lib/time';

import type { TelegramCallbackQuery } from './webhook';

const PLATFORM = 'telegram';

/** Handle an inline-button tap. Always answers the callback to dismiss the spinner. */
export async function handleCallback(env: Env, query: TelegramCallbackQuery): Promise<void> {
  const chatId = query.from.id;
  const channel = await q.getDeliveryTargetByRef(env.DB, PLATFORM, String(chatId));
  if (channel === null) {
    await answerCallbackQuery(env, {
      callback_query_id: query.id,
      text: 'Account not linked. Visit the website.',
      show_alert: true,
    });
    return;
  }

  const data = query.data ?? '';
  const messageId = query.message?.message_id;

  if (data.startsWith('approve:')) {
    await handleApprove(env, query, channel.did, data.slice('approve:'.length), messageId);
    return;
  }
  if (data.startsWith('deny:')) {
    await handleDeny(env, query, channel.did, data.slice('deny:'.length), messageId);
    return;
  }

  await answerCallbackQuery(env, { callback_query_id: query.id });
}

async function handleApprove(
  env: Env,
  query: TelegramCallbackQuery,
  recipientDid: Did,
  requestId: string,
  messageId: number | undefined,
): Promise<void> {
  const pending = await q.getPendingById(env.DB, requestId);
  if (pending === null || pending.recipient_did !== recipientDid) {
    await answerCallbackQuery(env, {
      callback_query_id: query.id,
      text: 'This request is no longer available.',
    });
    return;
  }

  await q.upsertGrant(env.DB, {
    recipientDid: pending.recipient_did,
    senderDid: pending.sender_did,
    grantedAt: now(),
    title: pending.title,
    description: pending.description,
    iconUrl: pending.icon_url,
  });
  await q.deletePendingById(env.DB, requestId, recipientDid);
  if (messageId !== undefined) {
    await editMessageText(env, {
      chat_id: query.from.id,
      message_id: messageId,
      text: `✅ Approved ${await senderLabel(env, pending.sender_did)}`,
    });
  }
  await answerCallbackQuery(env, { callback_query_id: query.id, text: 'Approved' });
}

async function handleDeny(
  env: Env,
  query: TelegramCallbackQuery,
  recipientDid: Did,
  requestId: string,
  messageId: number | undefined,
): Promise<void> {
  const pending = await q.getPendingById(env.DB, requestId);
  if (pending !== null && pending.recipient_did === recipientDid) {
    await q.deletePendingById(env.DB, requestId, recipientDid);
    if (messageId !== undefined) {
      await editMessageText(env, {
        chat_id: query.from.id,
        message_id: messageId,
        text: `❌ Denied ${await senderLabel(env, pending.sender_did)}`,
      });
    }
  }
  await answerCallbackQuery(env, { callback_query_id: query.id, text: 'Denied' });
}

/** A human-friendly label for a sender (cached handle, falling back to DID). */
async function senderLabel(env: Env, did: Did): Promise<string> {
  const sender = await q.getSender(env.DB, did);
  return sender?.handle !== null && sender?.handle !== undefined ? `@${sender.handle}` : did;
}
