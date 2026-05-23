import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

// Apps screen: pending permission requests + the apps the user has granted.
// The (app) layout guard guarantees `locals.did` is present by the time we run.
export const load: PageServerLoad = async ({ locals, platform }) => {
	const relay = relayFor(platform, locals.did);

	const [pending, grants, apps] = await Promise.all([
		relay.listPending(),
		relay.listGrants(),
		relay.listApps()
	]);

	// "Apps you can enable": the hardcoded catalog minus anything already granted
	// or pending (those show in the sections below).
	const grantedOrPending = new Set([
		...(grants?.grants ?? []).map((g) => g.sender),
		...(pending?.pending ?? []).map((p) => p.sender)
	]);
	const discover = (apps ?? []).filter((a) => !grantedOrPending.has(a.did));

	// Be defensive about relay responses — render fallbacks rather than crash.
	return {
		pending: pending?.pending ?? [],
		grants: grants?.grants ?? [],
		discover
	};
};
