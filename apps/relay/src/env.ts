import type { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';

/** A Telegram delivery channel. */
export interface TelegramChannel {
  platform: 'telegram';
  /** Telegram chat id (stored as `channels.platform_user_id`). */
  platformUserId: string;
}

/** A web push delivery channel (a browser PushSubscription). */
export interface WebPushChannel {
  platform: 'webpush';
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Where a notification can be delivered. */
export type DeliveryChannel = TelegramChannel | WebPushChannel;

/**
 * Work item placed on `DISPATCH_QUEUE` and handled by the `queue` consumer.
 * Discriminated on `kind`. Notifications fan out to any channel; pending-request
 * prompts are Telegram-only (they use inline approve/deny buttons).
 */
export type DispatchJob =
  | {
      kind: 'notification';
      channel: DeliveryChannel;
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
    }
  | {
      // Relay → app callback: a user's notification subscription to `sender`
      // changed. Has NO `channel` (unlike the others) — guard on `kind` first.
      kind: 'subscriberChanged';
      sender: string;
      recipient: string;
      enabled: boolean;
      changedAt: string;
    };

/** Cloudflare bindings + vars + secrets, as declared in `wrangler.toml`. */
export interface Env {
  /** D1 database holding all persistent state. */
  DB: D1Database;
  /** KV namespace used for DID-doc caching and rate-limit counters. */
  CACHE: KVNamespace;
  /** Queue producer for async delivery. */
  DISPATCH_QUEUE: Queue<DispatchJob>;

  /** `did:web:relay.atmo.pub` — this relay's DID (var). */
  RELAY_DID: string;
  /** Telegram bot username, used to build deep links (var). */
  BOT_USERNAME: string;

  /** Relay's P-256 signing key as a private multikey (secret) — for outbound
   *  service-auth JWTs (e.g. the subscriberChanged callback). `relay:keygen`. */
  RELAY_PRIVATE_KEY: string;

  /** Telegram bot token (secret). */
  TELEGRAM_BOT_TOKEN: string;
  /** Shared secret embedded in the Telegram webhook path (secret). */
  TELEGRAM_WEBHOOK_SECRET: string;

  /** VAPID public key — base64url uncompressed point; also the browser's applicationServerKey (var). */
  VAPID_PUBLIC_KEY: string;
  /** VAPID contact subject, e.g. "mailto:you@example.com" (var). */
  VAPID_SUBJECT: string;
  /** VAPID private signing key as JWK JSON (secret). */
  VAPID_PRIVATE_JWK: string;
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
