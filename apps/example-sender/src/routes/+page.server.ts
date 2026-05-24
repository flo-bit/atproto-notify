import { loadHandle } from '@svelte-atproto/oauth/helper';
import { memory } from '@svelte-atproto/oauth/server/stores/memory';

import { DEMO_CATEGORIES } from '$lib/config';
import {
	getRoutingForUser,
	listNotificationsForUser,
	setCategoriesForUser
} from '$lib/server/relay';
import { listSubscribers } from '$lib/server/subscribers';
import type { NotificationView, RoutingView } from '$lib/types';

import type { PageServerLoad } from './$types';

// Tiny in-memory cache for handle lookups (fine for a demo).
const handleCache = memory();

/**
 * On open, figure out whether this user has connected the app: `getRouting` is a
 * self-scoped call that only succeeds once a grant exists, so a success means
 * "connected" and hands us the routing + targets in one shot. We also declare the
 * app's demo categories (once) so the per-category UI has something to show.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const handle = locals.did ? await loadHandle(locals.did, { cache: handleCache }) : null;
	const base = {
		did: locals.did,
		handle,
		subscribers: listSubscribers(),
		categoriesError: null as string | null
	};
	const disconnected = {
		...base,
		connected: false,
		routing: null as RoutingView | null,
		notifications: [] as NotificationView[]
	};

	if (!locals.client) return disconnected;

	try {
		let routing = await getRoutingForUser(locals.client);

		// Declare our categories the first time (idempotent; preserves any route the
		// user already chose). Isolated so a failure here can't flip us to
		// "not connected"; we surface the reason instead of hiding it.
		let categoriesError: string | null = null;
		const have = new Set(routing.categories.map((c) => c.id));
		if (!DEMO_CATEGORIES.every((c) => have.has(c.id))) {
			try {
				await setCategoriesForUser(
					locals.client,
					DEMO_CATEGORIES.map((c) => ({ id: c.id, title: c.title, description: c.description }))
				);
				routing = await getRoutingForUser(locals.client);
			} catch (err) {
				categoriesError = err instanceof Error ? err.message : 'Could not declare categories';
				console.warn('[example] could not declare categories', err);
			}
		}

		const { notifications } = await listNotificationsForUser(locals.client, { limit: 10 });
		return { ...base, connected: true, routing, notifications, categoriesError };
	} catch {
		// No grant yet (or a token couldn't be minted) → not connected.
		return disconnected;
	}
};
