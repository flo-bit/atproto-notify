// Remote command functions the page calls. requestNotifications goes through the
// user's OAuth session; sendTest signs with this app's own key; the routing/inbox
// commands carry both tokens (dual-auth).
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

import { APP_DOMAIN } from '$lib/config';
import {
	getRoutingForUser,
	listNotificationsForUser,
	markAllReadForUser,
	mintAppLoginUrl,
	requestPermissionForUser,
	sendAsSender,
	setRoutingForUser
} from '$lib/server/relay';
import type { AppRoute, NotificationView, RoutingView } from '$lib/types';

/** The user's OAuth client, or a 401 if they're not signed in. */
function requireClient() {
	const { locals } = getRequestEvent();
	if (!locals.client) {
		error(401, 'Not signed in');
	}
	return locals.client;
}

export const requestNotifications = command(() => requestPermissionForUser(requireClient()));

/** Build a one-time link that signs the user into atmo.pub (cross-app login). */
export const openInAtmo = command(async (): Promise<{ url: string }> => {
	return { url: await mintAppLoginUrl(requireClient()) };
});

export type SendResult =
	| { ok: true; id: string; delivered: number }
	| { ok: false; reason: 'notApproved' };

export const sendTest = command(
	v.object({ title: v.optional(v.string()), body: v.optional(v.string()) }),
	async ({ title, body }): Promise<SendResult> => {
		const { locals } = getRequestEvent();
		if (!locals.did) {
			error(401, 'Not signed in');
		}
		try {
			const result = await sendAsSender({
				recipient: locals.did,
				title: title?.trim() || 'Hello from the example sender',
				body: body?.trim() || 'If you can read this, the integration works end to end.',
				uri: `https://${APP_DOMAIN}`
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

export const getRouting = command((): Promise<RoutingView> => getRoutingForUser(requireClient()));

export const setRouting = command(
	v.object({ route: v.picklist(['push', 'telegram', 'push+telegram', 'off', 'default']) }),
	({ route }): Promise<{ ok: boolean }> =>
		setRoutingForUser(requireClient(), { route: route as AppRoute })
);

export const listNotifications = command(
	(): Promise<{ notifications: NotificationView[]; cursor?: string }> =>
		listNotificationsForUser(requireClient(), { limit: 25 })
);

export const markAllRead = command((): Promise<{ marked: number }> =>
	markAllReadForUser(requireClient())
);
