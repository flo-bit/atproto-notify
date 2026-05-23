// Single source of truth for relay-facing constants. See the relay's README
// "Configuration" section to keep these in sync if the relay is re-homed.

/** The notification relay's domain. */
export const RELAY_DOMAIN = 'notifs.atmo.tools';

/** `https://notifs.atmo.tools` — base for relay XRPC calls. */
export const RELAY_ORIGIN = `https://${RELAY_DOMAIN}`;

/** The relay's `did:web` identity (the `aud` for service-auth JWTs). */
export const RELAY_DID = 'did:web:notifs.atmo.tools';

/** Service-ref form (the relay's `#notif_relay` service). */
export const RELAY_SERVICE_REF = `${RELAY_DID}#notif_relay`;

/** Lexicon NSID prefix for all relay methods. */
export const LEXICON_PREFIX = 'tools.atmo.notifs';

/**
 * The user-management methods the website calls on the relay, requested directly
 * as individual `rpc` scopes (rather than a published permission set).
 */
export const USER_LXMS = [
	'grant',
	'revoke',
	'denyPending',
	'muteGrant',
	'listGrants',
	'listPending',
	'linkChannel',
	'unlinkChannel',
	'listChannels',
	'getSettings',
	'updateSettings'
].map((method) => `${LEXICON_PREFIX}.${method}`);

/**
 * OAuth scope: base `atproto` plus an `rpc` permission for the relay methods.
 * Format is `rpc?lxm=<nsid>&lxm=<nsid>…&aud=<aud>`. `aud=*` (any audience) so
 * service-auth tokens can be minted for the relay.
 */
export const OAUTH_SCOPE = `atproto rpc?${USER_LXMS.map((lxm) => `lxm=${lxm}`).join('&')}&aud=*`;

// --- Branding (placeholders — rename freely) -------------------------------

/** Product name shown in the UI. */
export const PROJECT_NAME = 'notify.atmo.tools';

/** GitHub repo link in the footer. */
export const GITHUB_URL = 'https://github.com/flo-bit/atproto-notify';
