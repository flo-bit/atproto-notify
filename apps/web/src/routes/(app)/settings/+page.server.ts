import { emptyRouteInstances } from '@atmo/notifs-lexicons';

import { relayFor } from '$lib/server/relay';

import type { PageServerLoad } from './$types';

// Settings screen: linked delivery channels + notification preferences.
// The (app) layout guard guarantees `locals.did` is present by the time we run.
export const load: PageServerLoad = async ({ locals, platform }) => {
	const relay = relayFor(platform, locals.did);

	const [settings, routing, targets] = await Promise.all([
		relay.getSettings(),
		relay.getRouting(),
		relay.listTargets()
	]);

	// Partition the unified delivery targets by channel for the Channels tab.
	const all = targets ?? [];
	return {
		devices: all.filter((t) => t.channel === 'push'),
		telegrams: all.filter((t) => t.channel === 'telegram'),
		emails: all.filter((t) => t.channel === 'email'),
		dms: all.filter((t) => t.channel === 'dm'),
		webhooks: all.filter((t) => t.channel === 'webhook'),
		notifyPendingViaTelegram: settings?.notifyPendingViaTelegram ?? false,
		autoAllow: settings?.autoAllow ?? 'trusted',
		defaultRoute: routing?.defaultRoute ?? 'push',
		// Catalog of routable instances per channel, for the routing picker.
		channels: routing?.channels ?? emptyRouteInstances()
	};
};
