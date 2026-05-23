import { redirect } from '@sveltejs/kit';

import { relay } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.did || !locals.client) {
		redirect(303, '/');
	}
	const res = await relay.listPending(locals.client);
	const request = (res?.pending ?? []).find((p) => p.id === params.id) ?? null;
	return { request };
};
