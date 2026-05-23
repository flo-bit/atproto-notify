import type { Env } from '../env';

import { handleCallback } from './callbacks';
import { handleCommand } from './commands';

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const OK = (): Response => new Response('ok', { status: 200 });

/**
 * Telegram webhook entrypoint, mounted at `POST /telegram/webhook/:secret`.
 *
 * The path secret must match `TELEGRAM_WEBHOOK_SECRET`. We always reply 200 to
 * Telegram (even on internal errors) so it doesn't aggressively retry; internal
 * errors are logged and, where relevant, surfaced to the user via a follow-up
 * message inside the command/callback handlers.
 */
export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  secret: string,
): Promise<Response> {
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json<TelegramUpdate>();
  } catch {
    return OK();
  }

  try {
    if (update.message?.text !== undefined && update.message.text.startsWith('/')) {
      await handleCommand(env, update.message);
    } else if (update.callback_query !== undefined) {
      await handleCallback(env, update.callback_query);
    }
    // Anything else: ignore.
  } catch (err) {
    console.error('telegram webhook handler error', err);
  }

  return OK();
}
