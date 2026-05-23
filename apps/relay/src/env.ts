import type { ServiceJwtVerifier } from '@atcute/xrpc-server/auth';

/** Platforms a notification can be delivered to. */
export type ChannelPlatform = 'telegram' | 'ios' | 'android';

/** A delivery channel on a third-party platform (telegram chat / mobile device). */
export interface DeliveryChannel {
  platform: ChannelPlatform;
  /** Telegram chat id, or the native APNs/FCM push token (`channels.platform_user_id`). */
  platformUserId: string;
}

/**
 * Work item placed on `DISPATCH_QUEUE` and handled by the `queue` consumer.
 * Discriminated on `kind`.
 */
export type DispatchJob =
  | {
      kind: 'notification';
      channel: DeliveryChannel;
      /** The `delivery_log` id — used as the push `notifId` for grouping + deep links. */
      notifId: string;
      title: string;
      body: string;
      uri?: string;
      senderDid: string;
      senderHandle?: string;
    }
  | {
      kind: 'pendingRequest';
      // Pending-request pushes are interactive (approve/deny) → Telegram only.
      channel: DeliveryChannel;
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

  // --- Apple Push Notification service (APNs), for iOS devices ---
  /** APNs auth key id (the `.p8` key's Key ID) (var). */
  APNS_KEY_ID: string;
  /** Apple Developer Team ID (var). */
  APNS_TEAM_ID: string;
  /** iOS bundle identifier; also the APNs topic (var). */
  APNS_BUNDLE_ID: string;
  /** Contents of the `.p8` APNs auth key, PKCS#8 PEM (secret). */
  APNS_PRIVATE_KEY: string;

  // --- Firebase Cloud Messaging (FCM), for Android devices ---
  /** Firebase project id (var; also present in the service-account JSON). */
  FCM_PROJECT_ID: string;
  /** Full Firebase service-account credentials JSON (secret). */
  FCM_SERVICE_ACCOUNT_JSON: string;
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
