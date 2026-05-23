import type { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';

/** A delivery channel on a third-party platform. v1 supports Telegram only. */
export interface TelegramChannel {
  platform: 'telegram';
  /** Telegram chat id (stored as `channels.platform_user_id`). */
  platformUserId: string;
}

/**
 * Work item placed on `DISPATCH_QUEUE` and handled by the `queue` consumer.
 * Discriminated on `kind`.
 */
export type DispatchJob =
  | {
      kind: 'notification';
      channel: TelegramChannel;
      title: string;
      body: string;
      uri?: string;
      senderDid: string;
    }
  | {
      kind: 'pendingRequest';
      channel: TelegramChannel;
      requestId: string;
      senderTitle: string;
      senderDescription?: string;
      senderIconUrl?: string;
      senderDid: string;
    };

/** Cloudflare bindings + vars + secrets, as declared in `wrangler.toml`. */
export interface Env {
  /** D1 database holding all persistent state. */
  DB: D1Database;
  /** KV namespace used for DID-doc caching and rate-limit counters. */
  CACHE: KVNamespace;
  /** Queue producer for async delivery. */
  DISPATCH_QUEUE: Queue<DispatchJob>;

  /** `did:web:notifs.atmo.tools` — this relay's DID (var). */
  RELAY_DID: string;
  /** Telegram bot username, used to build deep links (var). */
  BOT_USERNAME: string;

  /** Telegram bot token (secret). */
  TELEGRAM_BOT_TOKEN: string;
  /** Shared secret embedded in the Telegram webhook path (secret). */
  TELEGRAM_WEBHOOK_SECRET: string;
}

/**
 * Per-request application context threaded through XRPC handlers. The verifier
 * is memoized per `Env` (see `auth/verifier.ts`); `ctx` is request-scoped and
 * used for `waitUntil` fire-and-forget work.
 */
export interface AppContext {
  env: Env;
  ctx: ExecutionContext;
  verifier: ServiceJwtVerifier;
}
