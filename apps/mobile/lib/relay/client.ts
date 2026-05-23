import { Agent } from '@atproto/api';

import type { OAuthSession } from '../auth/client';
import { RELAY_BASE_URL, RELAY_DID } from '../config';

type Method = 'GET' | 'POST';

interface RelayErrorBody {
  error?: string;
  message?: string;
}

function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Call a relay XRPC method as the signed-in user. Mirrors the website's
 * `lib/server/relay.ts`: mint a service-auth JWT on the user's PDS, then call the
 * relay with it as a Bearer token. For GET (queries) `body` is the query params;
 * for POST (procedures) it's the JSON input.
 */
export async function callRelay<T = unknown>(
  session: OAuthSession,
  lxm: string,
  body: Record<string, unknown> | null,
  method: Method = 'POST',
): Promise<T> {
  const agent = new Agent(session);
  const auth = await agent.com.atproto.server.getServiceAuth({ aud: RELAY_DID, lxm });
  const token = auth.data.token;

  const query = method === 'GET' && body !== null ? toQuery(body) : '';
  const res = await fetch(`${RELAY_BASE_URL}/xrpc/${lxm}${query}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    body: method === 'POST' && body !== null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err = parsed as RelayErrorBody;
    const name = err.error ?? `RelayError(${res.status})`;
    throw new Error(err.message ? `${name}: ${err.message}` : name);
  }
  return parsed as T;
}
