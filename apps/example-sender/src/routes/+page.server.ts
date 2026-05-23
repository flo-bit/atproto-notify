import { loadHandle } from '@svelte-atproto/oauth/helper';
import { memory } from '@svelte-atproto/oauth/server/stores/memory';

import { listSubscribers } from '$lib/server/subscribers';

import type { PageServerLoad } from './$types';

// Tiny in-memory cache for handle lookups (fine for a demo).
const handleCache = memory();

export const load: PageServerLoad = async ({ locals }) => {
	const handle = locals.did ? await loadHandle(locals.did, { cache: handleCache }) : null;
	// Users the relay told us enabled us via atmo.pub's "enable apps" flow.
	return { did: locals.did, handle, subscribers: listSubscribers() };
};
