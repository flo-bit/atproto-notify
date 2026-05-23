import { loadHandle } from '@svelte-atproto/oauth/helper';
import { memory } from '@svelte-atproto/oauth/server/stores/memory';
import { redirect } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';

// Per-isolate cache for DID → handle lookups (loadHandle is cache-aware).
const handleCache = memory();

// Everything under (app) requires a signed-in user. Send anonymous visitors to
// the login page.
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.did) {
		redirect(303, '/');
	}
	let handle: string | undefined;
	try {
		handle = await loadHandle(locals.did, { cache: handleCache });
	} catch {
		handle = undefined; // fall back to the DID in the UI
	}
	return { did: locals.did, handle: handle ?? null };
};
