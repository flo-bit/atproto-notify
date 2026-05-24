// Bluesky DM delivery. The relay sends DMs from a configured bot account (app
// password) through the chat service, proxied via the bot's PDS:
//   createSession → chat.bsky.convo.getConvoForMembers → chat.bsky.convo.sendMessage
//
// `createSession` is heavily rate-limited (a few per day), so the session is
// cached in KV and routine access-token expiry is handled with `refreshSession`
// (not rate-limited). createSession is only hit on the first send or when the
// refresh token itself is dead.
import type { Env } from '../env';

const CHAT_PROXY = 'did:web:api.bsky.chat#bsky_chat';
const SESSION_KEY = 'bsky-dm:session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // refresh token lives ~months

/** Thrown on a non-2xx from createSession/refreshSession or a chat call. */
export class BlueskyDMError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, detail: string) {
    super(`bluesky DM failed: ${statusCode} ${detail}`);
    this.name = 'BlueskyDMError';
    this.statusCode = statusCode;
  }
}

interface Session {
  accessJwt: string;
  refreshJwt: string;
}

function service(env: Env): string {
  return env.BLUESKY_DM_SERVICE && env.BLUESKY_DM_SERVICE.length > 0
    ? env.BLUESKY_DM_SERVICE
    : 'https://bsky.social';
}

function loadSession(env: Env): Promise<Session | null> {
  return env.CACHE.get<Session>(SESSION_KEY, 'json');
}

async function saveSession(env: Env, s: Session): Promise<Session> {
  await env.CACHE.put(SESSION_KEY, JSON.stringify(s), { expirationTtl: SESSION_TTL_SECONDS });
  return s;
}

/** App-password login. Rate-limited — only on first send or a dead refresh token. */
async function createSession(env: Env): Promise<Session> {
  const res = await fetch(`${service(env)}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: env.BLUESKY_DM_IDENTIFIER,
      password: env.BLUESKY_DM_APP_PASSWORD,
    }),
  });
  if (!res.ok) throw new BlueskyDMError(res.status, 'createSession');
  const { accessJwt, refreshJwt } = (await res.json()) as Session;
  return saveSession(env, { accessJwt, refreshJwt });
}

/** Exchange the refresh token for a fresh session. Not createSession-limited. */
async function refreshSession(env: Env, refreshJwt: string): Promise<Session> {
  const res = await fetch(`${service(env)}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { authorization: `Bearer ${refreshJwt}` },
  });
  if (!res.ok) throw new BlueskyDMError(res.status, 'refreshSession');
  const { accessJwt, refreshJwt: rotated } = (await res.json()) as Session;
  return saveSession(env, { accessJwt, refreshJwt: rotated });
}

async function chatCall<T>(
  env: Env,
  jwt: string,
  method: string,
  init: { query?: Record<string, string>; body?: unknown },
): Promise<T> {
  const url = new URL(`${service(env)}/xrpc/${method}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.body !== undefined ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${jwt}`,
      'atproto-proxy': CHAT_PROXY,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new BlueskyDMError(res.status, method);
  return (await res.json()) as T;
}

async function deliver(env: Env, jwt: string, recipientDid: string, text: string): Promise<void> {
  const { convo } = await chatCall<{ convo: { id: string } }>(
    env,
    jwt,
    'chat.bsky.convo.getConvoForMembers',
    { query: { members: recipientDid } },
  );
  await chatCall(env, jwt, 'chat.bsky.convo.sendMessage', {
    body: { convoId: convo.id, message: { text } },
  });
}

/**
 * Send a DM from the bot account to `recipientDid`. Throws {@link BlueskyDMError}.
 * On a 401 (expired access token) the session is refreshed (or, if the refresh
 * token is dead, re-created) and the send retried once.
 */
export async function sendBlueskyDM(env: Env, recipientDid: string, text: string): Promise<void> {
  let session = (await loadSession(env)) ?? (await createSession(env));
  try {
    await deliver(env, session.accessJwt, recipientDid, text);
  } catch (err) {
    if (!(err instanceof BlueskyDMError) || err.statusCode !== 401) throw err;
    try {
      session = await refreshSession(env, session.refreshJwt);
    } catch {
      session = await createSession(env);
    }
    await deliver(env, session.accessJwt, recipientDid, text);
  }
}
