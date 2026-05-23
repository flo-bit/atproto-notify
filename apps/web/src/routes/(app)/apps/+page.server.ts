import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

// Apps screen: pending permission requests + the apps the user has granted.
// The (app) layout guard guarantees `locals.did` is present by the time we run.
export const load: PageServerLoad = async ({ locals, platform }) => {
	const relay = relayFor(platform, locals.did);

	const [pending, grants] = await Promise.all([relay.listPending(), relay.listGrants()]);

	// Be defensive about relay responses — render fallbacks rather than crash.
	return {
		pending: pending?.pending ?? [],
		grants: grants?.grants ?? []
	};
};
