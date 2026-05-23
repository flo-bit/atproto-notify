import { redirect } from '@sveltejs/kit';

import { relay } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did || !locals.client) {
		redirect(303, '/');
	}
	const client = locals.client;

	const [pending, grants, channels, settings] = await Promise.all([
		relay.listPending(client),
		relay.listGrants(client),
		relay.listChannels(client),
		relay.getSettings(client)
	]);

	// Treat relay responses defensively — render fallbacks rather than crash.
	return {
		pending: pending?.pending ?? [],
		grants: grants?.grants ?? [],
		channels: channels?.channels ?? [],
		notifyPendingViaTelegram: settings?.notifyPendingViaTelegram ?? false
	};
};
