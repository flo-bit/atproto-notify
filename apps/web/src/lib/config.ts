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

/** Lexicon NSID prefix for relay methods (still used by the /docs examples). */
export const LEXICON_PREFIX = 'tools.atmo.notifs';

/**
 * OAuth scope: identity only.
 *
 * The website talks to the relay's management methods over a private Cloudflare
 * service binding (see src/lib/server/relay.ts), passing the signed-in user's
 * DID directly — it never mints service-auth JWTs on the user's behalf. So it
 * needs no `rpc?lxm=…` scopes; plain `atproto` (identity) is sufficient, which
 * also means a phished web OAuth grant yields nothing but the user's identity.
 */
export const OAUTH_SCOPE = 'atproto';

// --- Branding (placeholders — rename freely) -------------------------------

/** Product name shown in the UI. */
export const PROJECT_NAME = 'notify.atmo.tools';

/** GitHub repo link in the footer. */
export const GITHUB_URL = 'https://github.com/flo-bit/atproto-notify';
