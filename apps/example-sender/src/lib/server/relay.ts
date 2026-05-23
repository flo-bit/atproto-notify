// The actual relay calls. Each endpoint uses a different auth path:
//   requestPermission → user-OAuth (a JWT minted by the user's PDS)
//   send              → sender-DID (a JWT signed by this app's own key)
import '@atcute/atproto'; // ambient com.atproto.* types (getServiceAuth)
import type { Did, Nsid } from '@atcute/lexicons';

import { APP_DESCRIPTION, APP_TITLE, RELAY_DID, RELAY_ORIGIN, SENDER_DID } from '$lib/config';

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
		const err = new Error(d.message ?? d.error ?? 'Relay call failed') as RelayError;
		err.error = d.error;
		err.status = res.status;
		throw err;
	}
	return data;
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
	const auth = await client.get('com.atproto.server.getServiceAuth', {
		params: { aud: RELAY_DID as Did, lxm: lxm as Nsid }
	});
	if (!auth.ok) {
		throw new Error('Failed to mint a service-auth token from your PDS');
	}
	return postRelay(auth.data.token, lxm, {
		senderDid: SENDER_DID,
		title: APP_TITLE,
		description: APP_DESCRIPTION
	}) as Promise<{ id: string; status: 'pending' | 'alreadyGranted' }>;
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
}): Promise<{ id: string; delivered: number }> {
	const lxm = 'pub.atmo.notify.send';
	const jwt = await mintSenderJwt(lxm);
	return postRelay(jwt, lxm, input) as Promise<{ id: string; delivered: number }>;
}
