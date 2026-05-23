import { redirect } from '@sveltejs/kit';

import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.did) {
		redirect(303, '/');
	}
	const relay = relayFor(platform, locals.did);

	const [pending, grants, channels, settings] = await Promise.all([
		relay.listPending(),
		relay.listGrants(),
		relay.listChannels(),
		relay.getSettings()
	]);

	// Treat relay responses defensively — render fallbacks rather than crash.
	return {
		pending: pending?.pending ?? [],
		grants: grants?.grants ?? [],
		channels: channels?.channels ?? [],
		notifyPendingViaTelegram: settings?.notifyPendingViaTelegram ?? false
	};
};
