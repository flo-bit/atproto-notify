import { simpleFetchHandler } from '@atcute/client';
import type { Did } from '@atcute/lexicons';

import { getSender, upsertSender } from '../db/queries';
import type { Env } from '../env';
import { DAY_MS, now } from '../lib/time';

const APPVIEW_URL = 'https://public.api.bsky.app';
const PROFILE_TTL_MS = DAY_MS; // 24h (see README "Configuration")
const ACTOR_AVATAR_TTL_SECONDS = 24 * 60 * 60; // KV cache for resolved actor avatars

interface NormalizedProfile {
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
}

/**
 * Ensure the `senders` cache has a reasonably fresh Bluesky profile for a sender
 * DID. Refetches only when missing or older than 24h. The outcome — including a
 * failed/empty fetch — is always written, so a missing profile isn't re-fetched
 * on every request (`profile_fetched_at` gates the next retry).
 *
 * Intended to be called fire-and-forget via `ctx.waitUntil`.
 */
export async function ensureSenderProfile(env: Env, senderDid: Did): Promise<void> {
  const existing = await getSender(env.DB, senderDid);
  const fresh =
    existing !== null &&
    existing.profile_fetched_at !== null &&
    now() - existing.profile_fetched_at < PROFILE_TTL_MS;
  if (fresh) {
    return;
  }

  const profile = await fetchBskyProfile(senderDid);
  await upsertSender(env.DB, {
    did: senderDid,
    handle: profile?.handle ?? null,
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatar ?? null,
    profileFetchedAt: now(),
  });
}

async function fetchBskyProfile(actor: string): Promise<NormalizedProfile | null> {
  try {
    // Unauthenticated AppView query via @atcute/client's fetch handler.
    // `actor` accepts a handle or a DID.
    const handler = simpleFetchHandler({ service: APPVIEW_URL });
    const res = await handler(
      `/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
      { method: 'GET' },
    );
    if (!res.ok) {
      return null;
    }
    // Boundary: validate the few fields we read rather than trust the shape.
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) {
      return null;
    }
    const record = data as Record<string, unknown>;
    return {
      handle: typeof record.handle === 'string' ? record.handle : null,
      displayName: typeof record.displayName === 'string' ? record.displayName : null,
      avatar: typeof record.avatar === 'string' ? record.avatar : null,
    };
  } catch {
    return null;
  }
}

/** The avatar + handle resolved for a notification actor's DID. */
export interface ResolvedActor {
  avatar?: string;
  handle?: string;
}

/**
 * Resolve one actor DID to its Bluesky avatar + handle, cached in KV (24h,
 * including misses) so a busy inbox doesn't refetch on every load. Senders that
 * supply their own `avatarImage`/`handle` never reach here.
 */
async function resolveActorProfile(env: Env, did: string): Promise<ResolvedActor> {
  const key = `actorprofile:${did}`;
  const cached = await env.CACHE.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as ResolvedActor;
  }
  const profile = await fetchBskyProfile(did);
  const resolved: ResolvedActor = {
    avatar: profile?.avatar ?? undefined,
    handle: profile?.handle ?? undefined,
  };
  await env.CACHE.put(key, JSON.stringify(resolved), { expirationTtl: ACTOR_AVATAR_TTL_SECONDS });
  return resolved;
}

/**
 * Resolve a batch of distinct actor DIDs to their avatar + handle, in parallel.
 * Returns a map from DID → resolved profile.
 */
export async function resolveActorProfiles(
  env: Env,
  dids: string[],
): Promise<Map<string, ResolvedActor>> {
  const out = new Map<string, ResolvedActor>();
  await Promise.all(
    [...new Set(dids)].map(async (did) => {
      out.set(did, await resolveActorProfile(env, did));
    }),
  );
  return out;
}
