// Server-only helper for calling the notification relay on behalf of the
// signed-in user. Mints a short-lived service-auth JWT via the user's PDS, then
// calls the relay's XRPC endpoint with it. The JWT never leaves the server.
import '@atcute/atproto'; // side-effect: registers com.atproto.* lexicon types
import type { Did, Nsid } from '@atcute/lexicons';
import type {
	ToolsAtmoNotifsDenyPending,
	ToolsAtmoNotifsGetSettings,
	ToolsAtmoNotifsGrant,
	ToolsAtmoNotifsLinkChannel,
	ToolsAtmoNotifsListChannels,
	ToolsAtmoNotifsListGrants,
	ToolsAtmoNotifsListPending,
	ToolsAtmoNotifsMuteGrant,
	ToolsAtmoNotifsRevoke,
	ToolsAtmoNotifsUnlinkChannel,
	ToolsAtmoNotifsUpdateSettings
} from '@atmo/notifs-lexicons';

import { RELAY_DID, RELAY_ORIGIN } from '$lib/config';

type AppClient = App.Locals['client'];

interface RelayErrorBody {
	error?: string;
	message?: string;
}

/**
 * Call a relay XRPC method as the signed-in user.
 *
 * 1. Ask the user's PDS for a service-auth token (`com.atproto.server.getServiceAuth`)
 *    scoped to `aud = <relay DID>` and `lxm = <method>`.
 * 2. Call `https://<relay>/xrpc/<lxm>` with `Authorization: Bearer <token>`.
 * 3. Throw on non-2xx with the relay's `error: message`; otherwise return the body.
 */
export async function callRelay<T = unknown>(
	client: AppClient,
	lxm: string,
	body: object | null,
	method: 'GET' | 'POST'
): Promise<T> {
	if (!client) {
		throw new Error('Not signed in');
	}

	const authRes = await client.get('com.atproto.server.getServiceAuth', {
		params: { aud: RELAY_DID as Did, lxm: lxm as Nsid }
	});
	if (!authRes.ok) {
		throw new Error('Failed to obtain a service-auth token from your PDS');
	}

	const res = await fetch(`${RELAY_ORIGIN}/xrpc/${lxm}`, {
		method,
		headers: {
			authorization: `Bearer ${authRes.data.token}`,
			'content-type': 'application/json'
		},
		body: method === 'POST' && body !== null ? JSON.stringify(body) : undefined
	});

	const text = await res.text();
	const parsed: unknown = text ? JSON.parse(text) : {};

	if (!res.ok) {
		const err = parsed as RelayErrorBody;
		const name = err.error ?? `RelayError(${res.status})`;
		throw new Error(err.message ? `${name}: ${err.message}` : name);
	}

	return parsed as T;
}

/** Narrow, typed wrappers around {@link callRelay}, using the generated lexicon types. */
export const relay = {
	listGrants: (client: AppClient) =>
		callRelay<ToolsAtmoNotifsListGrants.$output>(
			client,
			'tools.atmo.notifs.listGrants',
			null,
			'GET'
		),
	listPending: (client: AppClient) =>
		callRelay<ToolsAtmoNotifsListPending.$output>(
			client,
			'tools.atmo.notifs.listPending',
			null,
			'GET'
		),
	listChannels: (client: AppClient) =>
		callRelay<ToolsAtmoNotifsListChannels.$output>(
			client,
			'tools.atmo.notifs.listChannels',
			null,
			'GET'
		),
	getSettings: (client: AppClient) =>
		callRelay<ToolsAtmoNotifsGetSettings.$output>(
			client,
			'tools.atmo.notifs.getSettings',
			null,
			'GET'
		),
	grant: (client: AppClient, input: ToolsAtmoNotifsGrant.$input) =>
		callRelay<ToolsAtmoNotifsGrant.$output>(client, 'tools.atmo.notifs.grant', input, 'POST'),
	revoke: (client: AppClient, input: ToolsAtmoNotifsRevoke.$input) =>
		callRelay<ToolsAtmoNotifsRevoke.$output>(client, 'tools.atmo.notifs.revoke', input, 'POST'),
	denyPending: (client: AppClient, input: ToolsAtmoNotifsDenyPending.$input) =>
		callRelay<ToolsAtmoNotifsDenyPending.$output>(
			client,
			'tools.atmo.notifs.denyPending',
			input,
			'POST'
		),
	muteGrant: (client: AppClient, input: ToolsAtmoNotifsMuteGrant.$input) =>
		callRelay<ToolsAtmoNotifsMuteGrant.$output>(
			client,
			'tools.atmo.notifs.muteGrant',
			input,
			'POST'
		),
	linkChannel: (client: AppClient, input: ToolsAtmoNotifsLinkChannel.$input) =>
		callRelay<ToolsAtmoNotifsLinkChannel.$output>(
			client,
			'tools.atmo.notifs.linkChannel',
			input,
			'POST'
		),
	unlinkChannel: (client: AppClient, input: ToolsAtmoNotifsUnlinkChannel.$input) =>
		callRelay<ToolsAtmoNotifsUnlinkChannel.$output>(
			client,
			'tools.atmo.notifs.unlinkChannel',
			input,
			'POST'
		),
	updateSettings: (client: AppClient, input: ToolsAtmoNotifsUpdateSettings.$input) =>
		callRelay<ToolsAtmoNotifsUpdateSettings.$output>(
			client,
			'tools.atmo.notifs.updateSettings',
			input,
			'POST'
		)
};
