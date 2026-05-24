import {
  deleteExpiredLinkTokens,
  deleteExpiredPending,
  deleteOldDeliveryLog,
  deleteOldNotifications,
} from './db/queries';
import { handleQueue } from './delivery/dispatcher';
import type { DispatchJob, Env } from './env';
import { DAY_MS } from './lib/time';
import { buildRouter } from './router';
import { handleTelegramWebhook } from './telegram/webhook';
import { handleLexicon, handleWellKnownDid } from './well-known';

// First-party management API, exposed only over a service binding (never as
// public XRPC). The web app's server is the sole caller. See ./rpc/entrypoint.ts.
export { RelayRpc } from './rpc/entrypoint';

const TELEGRAM_WEBHOOK_RE = /^\/telegram\/webhook\/(.+)$/;
const DELIVERY_LOG_RETENTION_MS = 30 * DAY_MS;
// Inbox backstop so `notifications` can't grow without bound. Generous; the inbox
// is the canonical history, but very old entries are dropped.
const NOTIFICATION_RETENTION_MS = 90 * DAY_MS;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/.well-known/did.json') {
      return handleWellKnownDid(env);
    }

    if (url.pathname.startsWith('/lexicons/')) {
      const nsid = decodeURIComponent(url.pathname.slice('/lexicons/'.length));
      return handleLexicon(nsid);
    }

    const telegramMatch = TELEGRAM_WEBHOOK_RE.exec(url.pathname);
    if (telegramMatch !== null) {
      return handleTelegramWebhook(request, env, telegramMatch[1]!);
    }

    // Everything else (/xrpc/*, /xrpc/_health) is handled by the XRPC router.
    return buildRouter(env, ctx).fetch(request);
  },

  async queue(batch: MessageBatch<DispatchJob>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // Daily housekeeping (cron "0 3 * * *").
    const ts = Date.now();
    await deleteExpiredPending(env.DB, ts);
    await deleteExpiredLinkTokens(env.DB, ts);
    await deleteOldDeliveryLog(env.DB, ts - DELIVERY_LOG_RETENTION_MS);
    await deleteOldNotifications(env.DB, ts - NOTIFICATION_RETENTION_MS);
  },
} satisfies ExportedHandler<Env, DispatchJob>;
