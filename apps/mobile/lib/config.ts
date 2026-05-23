// Shared constants for the notify.atmo.tools mobile app.
//
// The OAuth host is the web app (notify.atmo.tools); the relay XRPC API is a
// separate host (notifs.atmo.tools, with an "s"). The native redirect scheme is
// the reverse-DNS of the OAuth host, as atproto requires for native clients.

export const APP_NAME = 'notify.atmo.tools';

/** iOS bundle id / Android package (also the relay's APNs topic). */
export const BUNDLE_ID = 'tools.atmo.notifs.app';

/** Web app that hosts the OAuth client metadata + docs. */
export const OAUTH_HOST = 'https://notify.atmo.tools';
export const OAUTH_CLIENT_ID = `${OAUTH_HOST}/mobile/oauth-client-metadata.json`;

/** Native deep-link scheme + redirect URI (must match the hosted metadata). */
export const URL_SCHEME = 'tools.atmo.notify';
export const REDIRECT_URI = `${URL_SCHEME}://oauth/callback`;

/** Relay XRPC API + its did:web. */
export const RELAY_BASE_URL = 'https://notifs.atmo.tools';
export const RELAY_DID = 'did:web:notifs.atmo.tools';

export const LEXICON_PREFIX = 'tools.atmo.notifs';

export const DOCS_URL = `${OAUTH_HOST}/docs`;

/** Local inbox cache cap (oldest rows pruned beyond this). */
export const INBOX_MAX_ROWS = 500;
