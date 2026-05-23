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

/**
 * VAPID public key (base64url, uncompressed point) — the browser's
 * applicationServerKey for web push. MUST equal the relay's `VAPID_PUBLIC_KEY`.
 * Generate once with `pnpm --filter @atmo/notifs-relay vapid:keygen`, then paste
 * the same value here and into the relay's `wrangler.toml`. Empty hides the push
 * controls (so the app still works before keys are configured).
 */
export const VAPID_PUBLIC_KEY: string =
	'BF4pVUiFeh9wltn6Rj151RHA4WfidcRRv8kXp2aKcRATi_2gUgq0uGX8jVY1EczXqOvRtluqIxRj6Mtf5d1ImRw';
