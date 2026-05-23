// Server-only helper for calling the notification relay over a Cloudflare
// service binding (apps/web/wrangler.jsonc → services[].binding = "RELAY",
// entrypoint "RelayRpc"). The relay's management methods are NOT public XRPC:
// only bound Workers (this app's server) can reach them, so the binding itself
// is the security boundary and we pass the signed-in user's DID directly — no
// service-auth JWT, and the web app needs no `rpc` OAuth scope.
//
// In local `vite dev` the binding is provided by the cloudflare adapter's
// platform proxy, which needs the relay running via `wrangler dev`; if it isn't,
// `relayFor` throws a clear error rather than failing cryptically.
import type { Did } from '@atcute/lexicons';
import type {
	AlertRoute,
	CategoryRoute,
	MarkReadInput,
	PushSubscriptionInput,
	ToolsAtmoNotifsDenyPending,
	ToolsAtmoNotifsGrant,
	ToolsAtmoNotifsLinkChannel,
	ToolsAtmoNotifsMuteGrant,
	ToolsAtmoNotifsRevoke,
	ToolsAtmoNotifsUnlinkChannel,
	ToolsAtmoNotifsUpdateSettings
} from '@atmo/notifs-lexicons';

/**
 * Bind the relay service to the signed-in user. The `RELAY` binding is declared
 * on `App.Platform` (app.d.ts) as the shared `NotifsRpc` contract, which the
 * relay's `RelayRpc` entrypoint implements — so every method below is
 * type-checked end-to-end off one source. Throws if the binding is missing
 * (e.g. local `vite dev` without a running relay) or the user is not signed in.
 */
export function relayFor(platform: App.Platform | undefined, did: Did | null) {
	const svc = platform?.env.RELAY;
	if (!svc) {
		throw new Error('Relay service binding (RELAY) is unavailable');
	}
	if (!did) {
		throw new Error('Not signed in');
	}

	return {
		listGrants: () => svc.listGrants(did),
		listPending: () => svc.listPending(did),
		listChannels: () => svc.listChannels(did),
		getSettings: () => svc.getSettings(did),
		grant: (input: ToolsAtmoNotifsGrant.$input) => svc.grant(did, input),
		revoke: (input: ToolsAtmoNotifsRevoke.$input) => svc.revoke(did, input),
		denyPending: (input: ToolsAtmoNotifsDenyPending.$input) => svc.denyPending(did, input),
		muteGrant: (input: ToolsAtmoNotifsMuteGrant.$input) => svc.muteGrant(did, input),
		linkChannel: (input: ToolsAtmoNotifsLinkChannel.$input) => svc.linkChannel(did, input),
		unlinkChannel: (input: ToolsAtmoNotifsUnlinkChannel.$input) => svc.unlinkChannel(did, input),
		updateSettings: (input: ToolsAtmoNotifsUpdateSettings.$input) =>
			svc.updateSettings(did, input),
		registerWebPush: (sub: PushSubscriptionInput) => svc.registerWebPush(did, sub),
		unregisterWebPush: (endpoint: string) => svc.unregisterWebPush(did, endpoint),
		listNotifications: (cursor?: string) => svc.listNotifications(did, cursor),
		markRead: (input: MarkReadInput) => svc.markRead(did, input),
		getRouting: () => svc.getRouting(did),
		setRouting: (sender: Did, category: string, route: CategoryRoute) =>
			svc.setRouting(did, sender, category, route),
		setDefaultRoute: (route: AlertRoute) => svc.setDefaultRoute(did, route)
	};
}
