import { redirect } from '@sveltejs/kit';

import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	if (!locals.did) {
		redirect(303, '/');
	}
	const res = await relayFor(platform, locals.did).listPending();
	const request = (res?.pending ?? []).find((p) => p.id === params.id) ?? null;
	return { request };
};
