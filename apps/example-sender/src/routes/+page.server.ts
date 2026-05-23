import { loadHandle } from '@svelte-atproto/oauth/helper';
import { memory } from '@svelte-atproto/oauth/server/stores/memory';

import type { PageServerLoad } from './$types';

// Tiny in-memory cache for handle lookups (fine for a demo).
const handleCache = memory();

export const load: PageServerLoad = async ({ locals }) => {
	const handle = locals.did ? await loadHandle(locals.did, { cache: handleCache }) : null;
	return { did: locals.did, handle };
};
