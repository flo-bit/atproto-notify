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

/** The web dashboard where users approve apps + link Telegram (note: no "s"). */
export const DASHBOARD_ORIGIN = 'https://atmo.pub';

/**
 * OAuth scope: the sender app only needs `requestPermission` via the user's
 * session (`send` uses this app's own DID key, not the user's OAuth). Requested
 * as an individual `rpc` scope.
 */
export const OAUTH_SCOPE = 'atproto rpc?lxm=pub.atmo.notify.requestPermission&aud=*';

/** Branding. */
export const PROJECT_NAME = 'atmo.pub · example sender';
export const GITHUB_URL = 'https://github.com/flo-bit/atproto-notify';
