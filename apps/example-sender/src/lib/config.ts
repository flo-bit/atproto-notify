// Configuration for the example sender app.
import { dev } from '$app/environment';

/** This app's public domain. */
export const APP_DOMAIN = 'example.atmo.pub';

/** This app's sender DID — what the user approves and what `send` authenticates as. */
export const SENDER_DID = `did:web:${APP_DOMAIN}`;

/** Display name + description shown to the user when requesting permission. */
export const APP_TITLE = 'Example Sender';
export const APP_DESCRIPTION = 'Demo of how to integrate with atmo.pub.';

/**
 * The relay's XRPC API. In dev (`vite dev`) talk to the local relay running via
 * `wrangler dev`; in production use the deployed relay. The DID (service-auth
 * `aud`) is the same either way — the local relay's `RELAY_DID` var matches.
 */
export const RELAY_ORIGIN = dev ? 'http://localhost:8787' : 'https://relay.atmo.pub';
export const RELAY_DID = 'did:web:relay.atmo.pub';

/**
 * The web dashboard where users approve apps + link Telegram. In dev the webapp
 * runs on Vite's default 5173, so cross-app login links point there.
 */
export const DASHBOARD_ORIGIN = dev ? 'http://localhost:5173' : 'https://atmo.pub';

/** lxm for cross-app login (a convention NSID, not a published lexicon). */
export const APPLOGIN_LXM = 'pub.atmo.auth';

/**
 * OAuth scope. Each `rpc?lxm=…` entry lets this app mint a user service-auth
 * token (via `com.atproto.server.getServiceAuth`) for that method:
 *   - `requestPermission` — ask the user for notify permission.
 *   - `pub.atmo.auth` — one-time login token to jump into atmo.pub signed in.
 *   - `setRouting`/`getRouting`/`listNotifications`/`markRead` — the dual-auth
 *     methods, where this user token rides in the body alongside our own app JWT.
 * `send` is NOT here — it uses this app's own DID key, not the user's OAuth.
 *
 * Changing this scope means already-signed-in users must sign out and back in
 * before the new tokens can be minted.
 */
export const OAUTH_SCOPE = [
	'atproto',
	'rpc?lxm=pub.atmo.notify.requestPermission&aud=*',
	'rpc?lxm=pub.atmo.auth&aud=*',
	'rpc?lxm=pub.atmo.notify.setRouting&aud=*',
	'rpc?lxm=pub.atmo.notify.getRouting&aud=*',
	'rpc?lxm=pub.atmo.notify.listNotifications&aud=*',
	'rpc?lxm=pub.atmo.notify.markRead&aud=*'
].join(' ');

/** Branding. */
export const PROJECT_NAME = 'atmo.pub · example sender';
export const GITHUB_URL = 'https://github.com/flo-bit/atproto-notify';
