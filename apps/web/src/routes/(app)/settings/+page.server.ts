import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

// Settings screen: linked delivery channels + notification preferences.
// The (app) layout guard guarantees `locals.did` is present by the time we run.
export const load: PageServerLoad = async ({ locals, platform }) => {
	const relay = relayFor(platform, locals.did);

	const [channels, settings, routing] = await Promise.all([
		relay.listChannels(),
		relay.getSettings(),
		relay.getRouting()
	]);

	// Be defensive about relay responses — render fallbacks rather than crash.
	return {
		channels: channels?.channels ?? [],
		notifyPendingViaTelegram: settings?.notifyPendingViaTelegram ?? false,
		defaultRoute: routing?.defaultRoute ?? 'push'
	};
};
