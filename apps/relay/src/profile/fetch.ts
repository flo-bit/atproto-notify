import { simpleFetchHandler } from '@atcute/client';
import type { Did } from '@atcute/lexicons';

import { getSender, upsertSender } from '../db/queries';
import type { Env } from '../env';
import { DAY_MS, now } from '../lib/time';

const APPVIEW_URL = 'https://public.api.bsky.app';
const PROFILE_TTL_MS = DAY_MS; // 24h (see README "Configuration")

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

async function fetchBskyProfile(did: Did): Promise<NormalizedProfile | null> {
  try {
    // Unauthenticated AppView query via @atcute/client's fetch handler.
    const handler = simpleFetchHandler({ service: APPVIEW_URL });
    const res = await handler(
      `/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
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
