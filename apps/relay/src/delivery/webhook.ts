// Webhook delivery. The relay POSTs a small JSON envelope to a user-supplied
// https URL. Unlike push/telegram/email there is no provider — the user owns the
// endpoint — so a failure is the user's to fix: we never reap a webhook target,
// we just stop retrying permanent (4xx) failures (see dispatcher reapIfDead).
import type { WebhookChannel } from '../env';

/** How long we wait for the receiver before treating the POST as a transient failure. */
const WEBHOOK_TIMEOUT_MS = 10_000;

/** Thrown on a non-2xx response from the webhook endpoint. */
export class WebhookError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number) {
    super(`webhook delivery failed: ${statusCode}`);
    this.name = 'WebhookError';
    this.statusCode = statusCode;
  }
}

/** The JSON body POSTed to a webhook target. Stable, additive shape. */
export interface WebhookPayload {
  title: string;
  body: string;
  uri?: string;
  /** DID of the app that sent the notification. */
  sender: string;
}

/**
 * Deliver one notification to a webhook target. Resolves on a 2xx; throws
 * {@link WebhookError} on any other status, and lets fetch/timeout errors
 * propagate (the dispatcher retries those). The request times out so a slow or
 * hanging receiver can't stall the queue consumer.
 */
export async function sendWebhook(channel: WebhookChannel, payload: WebhookPayload): Promise<void> {
  const res = await fetch(channel.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'atmo.pub-webhook/1',
    },
    // JSON.stringify drops an undefined `uri`, so the key is simply absent then.
    body: JSON.stringify({ ...payload, sentAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new WebhookError(res.status);
  }
}
