import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	loadHandle,
	recentRecords,
	loadHandles,
	listRecords,
	parseUri
} from '@svelte-atproto/oauth/helper';
import { memory } from '@svelte-atproto/oauth/server/stores/memory';

// In-memory cache for handle lookups — fine for dev. For prod, swap in
// cloudflareKV or upstashRedis (any `Store` works).
const profileCache = memory();
const COLLECTION = 'xyz.statusphere.status';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.did) {
		const returnTo = encodeURIComponent(url.pathname + url.search);
		redirect(302, `/demo/atproto/login?returnTo=${returnTo}`);
	}

	// Lightweight: just resolve the handle from the user's PDS.
	// For richer Bluesky profile data (display name, avatar) swap to:
	//   import { loadBskyProfile } from '@svelte-atproto/oauth/bsky';
	//   const profile = await loadBskyProfile(locals.did, { cache: profileCache });
	const handle = await loadHandle(locals.did, { cache: profileCache });

	// Recent statuses globally, from the firehose via UFO. UFO is slightly
	// behind the firehose, so we also pull the user's own records and merge
	// them in front so just-published statuses show up immediately.
	const [globalRecent, own] = await Promise.all([
		recentRecords(COLLECTION),
		locals.client
			? listRecords({ did: locals.did, collection: COLLECTION, client: locals.client, limit: 10 })
			: Promise.resolve([])
	]);

	const ownAsItems = own.map((r) => {
		const parts = parseUri(r.uri);
		const record = r.value as { $type: string; createdAt?: string; [k: string]: unknown };
		const parsed =
			typeof record.createdAt === 'string' ? new Date(record.createdAt).getTime() : NaN;
		const time_us = (Number.isFinite(parsed) ? parsed : Date.now()) * 1000;
		return {
			did: parts?.repo ?? locals.did,
			collection: parts?.collection ?? COLLECTION,
			rkey: parts?.rkey ?? '',
			record,
			time_us
		};
	});

	// Own records first so they win the dedupe (UFO can be stale on a record
	// the user just published). Then sort by time_us so the merged list is
	// in true reverse-chronological order regardless of source.
	const seen = new Set<string>();
	const merged = [];
	for (const item of [...ownAsItems, ...globalRecent]) {
		const key = `${item.did}/${item.rkey}`;
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(item);
	}
	const recent = merged.sort((a, b) => b.time_us - a.time_us);

	// Resolve the author handles in parallel (cached).
	// For richer profile data, swap `loadHandles` for:
	//   import { loadBskyProfiles } from '@svelte-atproto/oauth/bsky';
	const authorDids = [...new Set(recent.map((r) => r.did))];
	const authors = await loadHandles(authorDids, { cache: profileCache });
	return { did: locals.did, handle, recent, authors };
};
