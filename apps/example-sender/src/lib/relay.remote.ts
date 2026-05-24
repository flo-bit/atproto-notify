// Remote command functions the page calls. `connect` (requestPermission) goes
// through the user's OAuth session; `sendTest` signs with this app's own key; the
// routing commands carry both tokens (dual-auth). After a mutation the page calls
// invalidateAll() so the server `load` re-reads the live state.
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

import {
	listNotificationsForUser,
	markAllReadForUser,
	mintAppLoginUrl,
	requestPermissionForUser,
	sendAsSender,
	setRoutingForUser
} from '$lib/server/relay';
import type { NotificationView } from '$lib/types';

/** The user's OAuth client, or a 401 if they're not signed in. */
function requireClient() {
	const { locals } = getRequestEvent();
	if (!locals.client) {
		error(401, 'Not signed in');
	}
	return locals.client;
}

/** Ask the user (via their PDS-minted token) to grant this app notify permission. */
export const connect = command(
	(): Promise<{ id: string; status: 'pending' | 'alreadyGranted' }> =>
		requestPermissionForUser(requireClient())
);

/** Build a one-time link that signs the user into atmo.pub, deep-linked to `redirect`. */
export const openInAtmo = command(
	v.object({ redirect: v.optional(v.string()) }),
	async ({ redirect }): Promise<{ url: string }> => {
		return { url: await mintAppLoginUrl(requireClient(), redirect) };
	}
);

export type SendResult =
	| { ok: true; id: string; delivered: number }
	| { ok: false; reason: 'notApproved' };

export const sendTest = command(
	v.object({
		title: v.optional(v.string()),
		body: v.optional(v.string()),
		category: v.optional(v.string())
	}),
	async ({ title, body, category }): Promise<SendResult> => {
		const { locals } = getRequestEvent();
		if (!locals.did) {
			error(401, 'Not signed in');
		}
		try {
			const result = await sendAsSender({
				recipient: locals.did,
				title: title?.trim() || 'Hello from the example sender',
				body: body?.trim() || 'If you can read this, the integration works end to end.',
				// A cross-site URL so PWA inbox links open in the default browser (an
				// atmo.pub subdomain would be treated as same-site and stay in-app on iOS).
				uri: 'https://bsky.app',
				category: category?.trim() || undefined
			});
			return { ok: true, ...result };
		} catch (e) {
			// 403 = the user hasn't approved this sender yet.
			if ((e as { status?: number }).status === 403) {
				return { ok: false, reason: 'notApproved' };
			}
			throw e;
		}
	}
);

// --- Dual-auth: manage this app's own routing + inbox for the signed-in user ---

/** Set the app-wide route ('default' inherits the account default). */
export const setAppRoute = command(
	v.object({ route: v.string() }),
	({ route }): Promise<{ ok: boolean }> => setRoutingForUser(requireClient(), { route })
);

/** Set one category's route ('app' inherits the app-wide route). */
export const setCategoryRoute = command(
	v.object({ id: v.string(), route: v.string() }),
	({ id, route }): Promise<{ ok: boolean }> =>
		setRoutingForUser(requireClient(), { categories: [{ id, route }] })
);

export const listNotifications = command(
	(): Promise<{ notifications: NotificationView[]; cursor?: string }> =>
		listNotificationsForUser(requireClient(), { limit: 10 })
);

export const markAllRead = command((): Promise<{ marked: number }> =>
	markAllReadForUser(requireClient())
);
