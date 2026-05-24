// Email delivery via comail (https://comail.at). Plain REST send API:
//   POST https://smtp.atmos.email/v1/send
//   headers: Authorization: Bearer atmos_…, X-Atmos-DID: <account did>
//   body:    { from, to, subject, text, html?, replyTo?, category? }
// See https://comail.at/docs/send-api.
import type { Env } from '../env';

const COMAIL_SEND_API = 'https://smtp.atmos.email/v1/send';

/** Thrown when comail rejects the send (non-2xx, or the recipient is rejected). */
export class EmailError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number, code: string, detail: string) {
    super(`email send failed: ${statusCode} ${code}${detail ? ` ${detail}` : ''}`);
    this.name = 'EmailError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface EmailMessage {
  /** A single plain email address (the relay sends per-channel). */
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** comail category hint: 'login-link'|'password-reset'|'mfa-otp'|'verification'|'bulk'|'broadcast'. */
  category?: string;
}

interface ComailResponse {
  accepted?: { recipient: string; messageId: number }[];
  rejected?: { recipient: string; reason?: string }[];
  error?: string;
  code?: string;
}

/** comail requires a bare `from` address (no "Name <addr>"); unwrap it if present. */
export function bareAddress(from: string): string {
  return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
}

/**
 * Send one email via comail. Resolves with the comail message id, or throws
 * {@link EmailError} on a non-2xx response or a rejected recipient.
 */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<{ messageId: number }> {
  const res = await fetch(COMAIL_SEND_API, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.COMAIL_API_KEY}`,
      'x-atmos-did': env.COMAIL_DID,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: bareAddress(env.COMAIL_FROM),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html !== undefined && { html: msg.html }),
      ...(msg.replyTo !== undefined && { replyTo: msg.replyTo }),
      ...(msg.category !== undefined && { category: msg.category }),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as ComailResponse;
  if (!res.ok) {
    throw new EmailError(res.status, data.code ?? 'UNKNOWN', data.error ?? '');
  }
  const accepted = data.accepted?.[0];
  if (accepted === undefined) {
    // 2xx but the address was rejected (suppressed/bounced) — treat as a failure.
    throw new EmailError(res.status, 'REJECTED', data.rejected?.[0]?.reason ?? 'recipient rejected');
  }
  return { messageId: accepted.messageId };
}
