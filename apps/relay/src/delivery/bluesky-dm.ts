// Bluesky DM delivery. The relay sends DMs from a configured bot account (app
// password) through the chat service, proxied via the bot's PDS:
//   createSession → chat.bsky.convo.getConvoForMembers → chat.bsky.convo.sendMessage
//
// The bot's PDS is resolved at runtime from its identity (handle or DID) and used
// for BOTH login and the proxied chat calls — the bsky.social entryway returns
// 501 for proxied chat, so calls must hit the account's real PDS host. Resolution
// reuses the KV-cached DID-document resolver, and the resolved PDS is cached in
// the session, so there's no hardcoded service endpoint to configure.
//
// `createSession` is heavily rate-limited (a few per day), so the session (tokens
// + resolved PDS) is cached in KV, and routine access-token expiry is handled with
// `refreshSession` (not rate-limited). createSession is only hit on the first send
// or when the refresh token itself is dead.
import type { ActorIdentifier } from '@atcute/lexicons/syntax';

import type { Env } from '../env';
import { makeActorResolver } from '../identity/resolve';

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
  /** The bot's resolved PDS endpoint — login + chat calls go here. */
  pds: string;
}

/** Resolve the bot's PDS from BLUESKY_DM_IDENTIFIER (handle or DID). The resolver
 *  returns `new URL(pds).href`, which has a trailing slash — strip it so
 *  `${pds}/xrpc/...` doesn't produce a `//xrpc` (404) path. */
async function resolveBotPds(env: Env): Promise<string> {
  const { pds } = await makeActorResolver(env.CACHE).resolve(
    env.BLUESKY_DM_IDENTIFIER as ActorIdentifier,
  );
  return pds.replace(/\/+$/, '');
}

function loadSession(env: Env): Promise<Session | null> {
  return env.CACHE.get<Session>(SESSION_KEY, 'json');
}

async function saveSession(env: Env, s: Session): Promise<Session> {
  await env.CACHE.put(SESSION_KEY, JSON.stringify(s), { expirationTtl: SESSION_TTL_SECONDS });
  return s;
}

/** App-password login at the bot's resolved PDS. Rate-limited — only on first
 *  send or a dead refresh token. */
async function createSession(env: Env): Promise<Session> {
  const pds = await resolveBotPds(env);
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: env.BLUESKY_DM_IDENTIFIER,
      password: env.BLUESKY_DM_APP_PASSWORD,
    }),
  });
  if (!res.ok) throw new BlueskyDMError(res.status, 'createSession');
  const { accessJwt, refreshJwt } = (await res.json()) as Pick<Session, 'accessJwt' | 'refreshJwt'>;
  return saveSession(env, { accessJwt, refreshJwt, pds });
}

/** Exchange the refresh token for a fresh session (at the cached PDS). Not
 *  createSession-rate-limited. */
async function refreshSession(env: Env, session: Session): Promise<Session> {
  const res = await fetch(`${session.pds}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.refreshJwt}` },
  });
  if (!res.ok) throw new BlueskyDMError(res.status, 'refreshSession');
  const { accessJwt, refreshJwt } = (await res.json()) as Pick<Session, 'accessJwt' | 'refreshJwt'>;
  return saveSession(env, { accessJwt, refreshJwt, pds: session.pds });
}

async function chatCall<T>(
  pds: string,
  jwt: string,
  method: string,
  init: { query?: Record<string, string>; body?: unknown },
): Promise<T> {
  const url = new URL(`${pds}/xrpc/${method}`);
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
  if (!res.ok) {
    // Include the chat service's error body (e.g. `{error,message}`) — the status
    // alone doesn't say why (recipient settings, token scope, …).
    const body = await res.text().catch(() => '');
    throw new BlueskyDMError(res.status, `${method}${body ? ` ${body}` : ''}`);
  }
  return (await res.json()) as T;
}

async function deliver(session: Session, recipientDid: string, text: string): Promise<void> {
  const { convo } = await chatCall<{ convo: { id: string } }>(
    session.pds,
    session.accessJwt,
    'chat.bsky.convo.getConvoForMembers',
    { query: { members: recipientDid } },
  );
  await chatCall(session.pds, session.accessJwt, 'chat.bsky.convo.sendMessage', {
    body: { convoId: convo.id, message: { text } },
  });
}

/**
 * Send a DM from the bot account to `recipientDid`. Throws {@link BlueskyDMError}.
 * On a 401 (expired access token) the session is refreshed (or, if the refresh
 * token is dead, re-created) and the send retried once. A cached session missing
 * the resolved PDS (pre-upgrade) forces a re-login.
 */
export async function sendBlueskyDM(env: Env, recipientDid: string, text: string): Promise<void> {
  let session = await loadSession(env);
  // Migrate a pre-upgrade cached session (valid tokens, no resolved PDS) WITHOUT
  // spending a rate-limited createSession — just attach the PDS and reuse the
  // tokens. An expired access token then refreshes (not rate-limited) below.
  if (session && !session.pds) {
    session = await saveSession(env, { ...session, pds: await resolveBotPds(env) });
  }
  if (!session) session = await createSession(env);
  try {
    await deliver(session, recipientDid, text);
  } catch (err) {
    if (!(err instanceof BlueskyDMError) || err.statusCode !== 401) throw err;
    try {
      session = await refreshSession(env, session);
    } catch {
      session = await createSession(env);
    }
    await deliver(session, recipientDid, text);
  }
}
