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

/** An email delivery channel (a verified address). */
export interface EmailChannel {
  platform: 'email';
  address: string;
}

/** A Bluesky DM delivery channel (the recipient's own DID). */
export interface DMChannel {
  platform: 'dm';
  recipientDid: string;
}

/** A webhook delivery channel: an https URL the relay POSTs notification JSON to. */
export interface WebhookChannel {
  platform: 'webhook';
  url: string;
}

/** Where a notification can be delivered. */
export type DeliveryChannel =
  | TelegramChannel
  | WebPushChannel
  | EmailChannel
  | DMChannel
  | WebhookChannel;

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

  /** Self-management admission policy for *undesignated* granted apps (var).
   *  'off'|'relay-allowlist'|'user-allowlist'|'open'. See MANAGEMENT-AUTH.md.
   *  Defaults in code: reads → 'open', writes → 'user-allowlist'. */
  MANAGEMENT_SELF_READ_POLICY?: string;
  MANAGEMENT_SELF_WRITE_POLICY?: string;

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

  // Email delivery via comail (https://comail.at) — POST https://smtp.atmos.email/v1/send.
  /** comail API key `atmos_…` (secret). */
  COMAIL_API_KEY: string;
  /** Account DID for the `X-Atmos-DID` header (var). */
  COMAIL_DID: string;
  /** Enrolled sender address for the `from` field, e.g. "atmo.pub <notify@atmo.pub>" (var). */
  COMAIL_FROM: string;
  /** Max emails delivered to ONE recipient per rolling day (var; default 10). See delivery/limits.ts. */
  EMAIL_DAILY_PER_RECIPIENT?: string;
  /** Max emails the relay delivers in total per rolling day (var; default 100). Keep ≤ the comail plan. */
  EMAIL_DAILY_GLOBAL?: string;

  // Bluesky DM delivery — the relay sends DMs from a configured bot account.
  /** Bot handle or DID used for createSession (var). */
  BLUESKY_DM_IDENTIFIER: string;
  /** Bot app password (secret). */
  BLUESKY_DM_APP_PASSWORD: string;
  /** Bot PDS service URL; defaults to https://bsky.social (var). */
  BLUESKY_DM_SERVICE?: string;
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
