import type { Did } from '@atcute/lexicons';

import * as q from '../db/queries';
import type { Env } from '../env';
import {
  escapeMd,
  type InlineKeyboardMarkup,
  sendMessage,
} from '../delivery/telegram';
import { resolveHandle } from '../identity/resolve';
import { now } from '../lib/time';

import type { TelegramMessage } from './webhook';

const DASHBOARD_URL = 'https://notifs.atmo.tools/dashboard';
const PLATFORM = 'telegram';

/** Dispatch a `/command` message to its handler. */
export async function handleCommand(env: Env, message: TelegramMessage): Promise<void> {
  const text = (message.text ?? '').trim();
  const [rawCommand, ...rest] = text.split(/\s+/);
  // Strip a possible `@botname` suffix (Telegram appends it in group chats).
  const command = (rawCommand ?? '').split('@')[0];
  const arg = rest.join(' ').trim();

  switch (command) {
    case '/start':
      await handleStart(env, message, arg);
      return;
    case '/list':
      await handleList(env, message.chat.id);
      return;
    case '/revoke':
      await handleRevoke(env, message.chat.id, arg);
      return;
    case '/settings':
      await handleSettings(env, message.chat.id);
      return;
    default:
      await handleHelp(env, message.chat.id);
  }
}

async function handleStart(env: Env, message: TelegramMessage, token: string): Promise<void> {
  const chatId = message.chat.id;

  if (token === '') {
    await replyText(
      env,
      chatId,
      `👋 Welcome to the atmo notifications bot!\n\nLink your account from the dashboard to start receiving notifications:\n${DASHBOARD_URL}`,
    );
    return;
  }

  const row = await q.getLinkToken(env.DB, token);
  if (row === null || row.expires_at < now()) {
    await replyText(env, chatId, `This link expired. Generate a new one at ${DASHBOARD_URL}`);
    return;
  }

  const did = row.did;
  const username = message.from?.username ?? null;
  await q.ensureUser(env.DB, did, now());
  await q.upsertChannel(env.DB, {
    did,
    platform: PLATFORM,
    platformUserId: String(chatId),
    displayName: username, // the Telegram account label (for the channels list)
    linkedAt: now(),
  });
  await q.deleteLinkToken(env.DB, token);

  // Confirm with the atproto identity being linked (their handle), not the
  // Telegram username. Falls back to the DID if the handle can't be resolved.
  // Rendered as a code span so Telegram doesn't linkify it as an @username.
  const handle = await resolveHandle(env.CACHE, did);
  const label = handle !== null ? `@${handle}` : did;
  await replyMarkdown(env, chatId, `✅ Linked to \`${label}\``);
}

async function handleList(env: Env, chatId: number): Promise<void> {
  const channel = await q.getChannelByPlatformUser(env.DB, PLATFORM, String(chatId));
  if (channel === null) {
    await replyText(env, chatId, NOT_LINKED);
    return;
  }

  const grants = await q.listGrantsForRecipient(env.DB, channel.did);
  if (grants.length === 0) {
    await replyText(env, chatId, "You haven't authorized any apps yet.");
    return;
  }

  const lines = grants.map((grant) => {
    // Prefer the app's display title; identifier goes in a code span so Telegram
    // doesn't linkify it as an @username/URL.
    const name = grant.title ?? grant.handle ?? grant.sender_did;
    const muted = grant.muted === 1 ? ' \\(muted\\)' : '';
    return `• *${escapeMd(name)}*${muted}\n  \`${grant.sender_did}\``;
  });
  await replyMarkdown(env, chatId, `*Authorized apps*\n${lines.join('\n')}`);
}

async function handleRevoke(env: Env, chatId: number, arg: string): Promise<void> {
  const channel = await q.getChannelByPlatformUser(env.DB, PLATFORM, String(chatId));
  if (channel === null) {
    await replyText(env, chatId, NOT_LINKED);
    return;
  }
  if (arg === '') {
    await replyText(env, chatId, 'Usage: /revoke <handle-or-did>');
    return;
  }

  const senderDid = await resolveToDid(env, arg);
  if (senderDid === null) {
    await replyText(env, chatId, `No matching grant for ${arg}.`);
    return;
  }

  const removed = await q.deleteGrant(env.DB, channel.did, senderDid);
  await q.deletePendingByPair(env.DB, channel.did, senderDid);
  await replyText(
    env,
    chatId,
    removed ? `✅ Revoked ${arg}.` : `No matching grant for ${arg}.`,
  );
}

async function handleSettings(env: Env, chatId: number): Promise<void> {
  const channel = await q.getChannelByPlatformUser(env.DB, PLATFORM, String(chatId));
  if (channel === null) {
    await replyText(env, chatId, NOT_LINKED);
    return;
  }

  await q.ensureUser(env.DB, channel.did, now());
  const user = await q.getUser(env.DB, channel.did);
  const enabled = (user?.notify_pending_via_telegram ?? 0) === 1;
  await sendMessage(env, {
    chat_id: chatId,
    text: settingsText(enabled),
    parse_mode: 'MarkdownV2',
    reply_markup: settingsKeyboard(enabled),
  });
}

async function handleHelp(env: Env, chatId: number): Promise<void> {
  await replyText(
    env,
    chatId,
    [
      'Commands:',
      '/start — link your account',
      '/list — list authorized apps',
      '/revoke <handle-or-did> — revoke an app',
      '/settings — notification settings',
    ].join('\n'),
  );
}

/** Resolve a `/revoke` argument (handle or DID) to a sender DID, best-effort. */
async function resolveToDid(env: Env, input: string): Promise<Did | null> {
  if (input.startsWith('did:')) {
    return input as Did;
  }
  const handle = input.replace(/^@/, '');
  const sender = await q.getSenderByHandle(env.DB, handle);
  return sender?.did ?? null;
}

// --- shared settings rendering (also used by callbacks.ts) ------------------

export function settingsText(enabled: boolean): string {
  return `*Settings*\n\nNotify me on Telegram about new permission requests: *${enabled ? 'ON' : 'OFF'}*`;
}

export function settingsKeyboard(enabled: boolean): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: enabled ? '🔔 Pending alerts: ON' : '🔕 Pending alerts: OFF',
          callback_data: 'toggle:notifyPending',
        },
      ],
    ],
  };
}

const NOT_LINKED =
  'This Telegram account is not linked yet. Link it from https://notifs.atmo.tools/dashboard';

function replyText(env: Env, chatId: number, text: string): Promise<{ message_id: number }> {
  return sendMessage(env, { chat_id: chatId, text });
}

function replyMarkdown(env: Env, chatId: number, text: string): Promise<{ message_id: number }> {
  return sendMessage(env, { chat_id: chatId, text, parse_mode: 'MarkdownV2' });
}
