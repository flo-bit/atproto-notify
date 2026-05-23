import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

// Inbox: the recipient's notification history. The (app) layout guard guarantees
// `locals.did` is present.
export const load: PageServerLoad = async ({ locals, platform }) => {
	const relay = relayFor(platform, locals.did);
	const res = await relay.listNotifications();

	return {
		notifications: res?.notifications ?? [],
		unread: res?.unread ?? 0
	};
};
