// Single source of truth for app-facing constants.

/** Product name shown in the UI. */
export const PROJECT_NAME = 'atmo.pub';

/** GitHub repo link in the footer. */
export const GITHUB_URL = 'https://github.com/flo-bit/atproto-notify';

/**
 * OAuth scope: identity only. The webapp talks to the relay's management methods
 * over a private Cloudflare service binding (see src/lib/server/relay.ts) and
 * never mints service-auth JWTs, so it needs no `rpc?lxm=…` scopes — plain
 * `atproto` (identity) is sufficient.
 */
export const OAUTH_SCOPE = 'atproto';
