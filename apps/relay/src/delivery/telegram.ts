import type { Env } from '../env';

const TELEGRAM_API = 'https://api.telegram.org';

/** Thrown when the Telegram Bot API returns `{ ok: false }`. */
export class TelegramApiError extends Error {
  readonly errorCode: number;
  readonly description: string;

  constructor(errorCode: number, description: string) {
    super(`Telegram API error ${errorCode}: ${description}`);
    this.name = 'TelegramApiError';
    this.errorCode = errorCode;
    this.description = description;
  }
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageParams {
  chat_id: string | number;
  text: string;
  parse_mode?: 'MarkdownV2';
  reply_markup?: InlineKeyboardMarkup;
  link_preview_options?: { is_disabled: boolean };
}

export interface EditMessageTextParams {
  chat_id: string | number;
  message_id: number;
  text: string;
  parse_mode?: 'MarkdownV2';
  reply_markup?: InlineKeyboardMarkup;
}

export interface AnswerCallbackQueryParams {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

async function callTelegram<T>(env: Env, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as TelegramApiResponse<T>;
  if (!data.ok) {
    throw new TelegramApiError(data.error_code ?? res.status, data.description ?? 'unknown error');
  }
  return data.result as T;
}

export function sendMessage(env: Env, params: SendMessageParams): Promise<{ message_id: number }> {
  return callTelegram(env, 'sendMessage', params);
}

export function editMessageText(env: Env, params: EditMessageTextParams): Promise<unknown> {
  return callTelegram(env, 'editMessageText', params);
}

export function answerCallbackQuery(env: Env, params: AnswerCallbackQueryParams): Promise<unknown> {
  return callTelegram(env, 'answerCallbackQuery', params);
}

// Telegram MarkdownV2 reserves these characters; they must be backslash-escaped
// anywhere they appear in user-supplied content.
const MARKDOWN_V2_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g;

/** Escape a string for safe interpolation into a Telegram MarkdownV2 message. */
export function escapeMd(text: string): string {
  return text.replace(MARKDOWN_V2_SPECIAL, (char) => `\\${char}`);
}
