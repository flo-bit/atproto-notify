import { emptyRouteInstances } from '@atmo/notifs-lexicons';

import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

// App detail: per-category routing for one granted sender. `params.sender` is the
// (decoded) sender DID. `getRouting` includes every granted app, so a missing
// `app` means the sender isn't granted.
export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const relay = relayFor(platform, locals.did);
	const routing = await relay.getRouting();
	const app = routing?.apps.find((a) => a.sender === params.sender) ?? null;

	return {
		app,
		defaultRoute: routing?.defaultRoute ?? 'push',
		channels: routing?.channels ?? emptyRouteInstances()
	};
};
