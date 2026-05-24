// The actual relay calls. Each endpoint uses a different auth path:
//   requestPermission                 → user-OAuth (JWT minted by the user's PDS)
//   send                              → sender-DID (JWT signed by this app's key)
//   setRouting/getRouting/list…/mark… → dual-auth (BOTH of the above per call)
import '@atcute/atproto'; // ambient com.atproto.* types (getServiceAuth)
import type { Did, Nsid } from '@atcute/lexicons';

import {
	APP_DESCRIPTION,
	APP_ICON_URL,
	APP_TITLE,
	APPLOGIN_LXM,
	DASHBOARD_ORIGIN,
	RELAY_DID,
	RELAY_ORIGIN,
	SENDER_DID
} from '$lib/config';
import type { AppRoute, CategoryRoute, NotificationView, RoutingView } from '$lib/types';

import { mintSenderJwt } from './sender-auth';

type AppClient = App.Locals['client'];

interface RelayError extends Error {
	error?: string;
	status?: number;
}

async function postRelay(jwt: string, lxm: string, body: object): Promise<unknown> {
	const res = await fetch(`${RELAY_ORIGIN}/xrpc/${lxm}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const text = await res.text();
	const data: unknown = text ? JSON.parse(text) : {};
	if (!res.ok) {
		const d = data as { error?: string; message?: string };
		// Surface the relay's exact reason in the example's dev terminal — handy
		// when debugging auth (401) vs authorization (403) failures.
		console.error(`[relay] ${lxm} → ${res.status}`, d.error, d.message);
		const err = new Error(d.message ?? d.error ?? 'Relay call failed') as RelayError;
		err.error = d.error;
		err.status = res.status;
		throw err;
	}
	return data;
}

/**
 * Mint a *user* service-auth JWT on the user's PDS, scoped to `lxm` and
 * addressed to the relay. This is the user's proof-of-consent token — used on
 * its own by `requestPermission`, and in the body alongside our app JWT by the
 * dual-auth methods.
 */
async function mintUserToken(client: NonNullable<AppClient>, lxm: string): Promise<string> {
	const auth = await client.get('com.atproto.server.getServiceAuth', {
		params: { aud: RELAY_DID as Did, lxm: lxm as Nsid }
	});
	if (!auth.ok) {
		throw new Error('Failed to mint a service-auth token from your PDS');
	}
	return auth.data.token;
}

/**
 * User-OAuth path. Mint a service-auth JWT on the user's PDS (proves the user
 * authorized this request), then call `requestPermission` naming this app as the
 * sender.
 */
export async function requestPermissionForUser(
	client: NonNullable<AppClient>
): Promise<{ id: string; status: 'pending' | 'alreadyGranted' }> {
	const lxm = 'pub.atmo.notify.requestPermission';
	const token = await mintUserToken(client, lxm);
	return postRelay(token, lxm, {
		senderDid: SENDER_DID,
		title: APP_TITLE,
		description: APP_DESCRIPTION,
		iconUrl: APP_ICON_URL
	}) as Promise<{ id: string; status: 'pending' | 'alreadyGranted' }>;
}

/**
 * Cross-app login. Mint a one-time `pub.atmo.auth` service-auth token on the
 * user's PDS and build a link that drops them into atmo.pub already signed in,
 * deep-linked to THIS app's settings page. No login form, no PDS round-trip on
 * atmo.pub's side. See CROSS-APP-AUTH.md.
 */
export async function mintAppLoginUrl(
	client: NonNullable<AppClient>,
	redirect = `/apps/${SENDER_DID}`
): Promise<string> {
	const token = encodeURIComponent(await mintUserToken(client, APPLOGIN_LXM));
	return `${DASHBOARD_ORIGIN}/applogin?token=${token}&redirect=${encodeURIComponent(redirect)}`;
}

/**
 * Sender-DID path. Sign with this app's own key (no user OAuth) and send a
 * notification to `recipient`.
 */
export async function sendAsSender(input: {
	recipient: string;
	title: string;
	body: string;
	uri?: string;
	/** Optional routing category (one of the app's declared categories). */
	category?: string;
}): Promise<{ id: string; delivered: number }> {
	const lxm = 'pub.atmo.notify.send';
	const jwt = await mintSenderJwt(lxm);
	return postRelay(jwt, lxm, input) as Promise<{ id: string; delivered: number }>;
}

/**
 * Dual-auth path (setRouting / getRouting / listNotifications / markRead).
 * Carries TWO service-auth tokens: this app's own in the Authorization header
 * (proves which app), and a fresh user-issued one as `userToken` in the body
 * (proves the user consented to this exact call). The relay verifies both and
 * scopes the effect to (user, this app) — it can't touch the account default,
 * other apps, or channels.
 */
async function dualAuthCall(
	client: NonNullable<AppClient>,
	lxm: string,
	body: object = {}
): Promise<unknown> {
	const [userToken, appJwt] = await Promise.all([mintUserToken(client, lxm), mintSenderJwt(lxm)]);
	return postRelay(appJwt, lxm, { userToken, ...body });
}

/** Read how this app's notifications are currently routed for the user. */
export function getRoutingForUser(client: NonNullable<AppClient>): Promise<RoutingView> {
	return dualAuthCall(client, 'pub.atmo.notify.getRouting') as Promise<RoutingView>;
}

/** Change how this app's notifications are routed for the user. */
export function setRoutingForUser(
	client: NonNullable<AppClient>,
	input: { route?: AppRoute; categories?: { id: string; route: CategoryRoute }[] }
): Promise<{ ok: boolean }> {
	return dualAuthCall(client, 'pub.atmo.notify.setRouting', input) as Promise<{ ok: boolean }>;
}

/**
 * Declare this app's category catalog for the user (full sync). A real app calls
 * this once it knows which kinds of notifications it sends, so the user gets a
 * per-category routing UI. Omitting `route` just declares the category (it keeps
 * any route the user already chose).
 */
export function setCategoriesForUser(
	client: NonNullable<AppClient>,
	categories: { id: string; title?: string; description?: string; route?: CategoryRoute }[]
): Promise<{ ok: boolean }> {
	return dualAuthCall(client, 'pub.atmo.notify.setCategories', { categories }) as Promise<{
		ok: boolean;
	}>;
}

/** List the notifications this app has sent the user (read state + delivery). */
export function listNotificationsForUser(
	client: NonNullable<AppClient>,
	input: { limit?: number; cursor?: string } = {}
): Promise<{ notifications: NotificationView[]; cursor?: string }> {
	return dualAuthCall(client, 'pub.atmo.notify.listNotifications', input) as Promise<{
		notifications: NotificationView[];
		cursor?: string;
	}>;
}

/** Mark all of this app's notifications to the user as read. */
export function markAllReadForUser(client: NonNullable<AppClient>): Promise<{ marked: number }> {
	return dualAuthCall(client, 'pub.atmo.notify.markRead') as Promise<{ marked: number }>;
}
