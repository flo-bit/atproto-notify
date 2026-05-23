// Constants for the marketing site (landing + docs). The webapp (PWA) and the
// relay live on their own domains; these point at them.

/** Product name shown in the UI. */
export const PROJECT_NAME = 'atmo.pub';

/** The webapp (PWA) — where the header/landing "Sign in" buttons send users. */
export const WEBAPP_URL = 'https://atmo.pub';

/** GitHub repo link in the footer. */
export const GITHUB_URL = 'https://github.com/flo-bit/atproto-notify';

// --- Relay (used only by the /docs code examples) --------------------------

/** `https://relay.atmo.pub` — base for the relay XRPC examples. */
export const RELAY_ORIGIN = 'https://relay.atmo.pub';

/** The relay's `did:web` identity (the `aud` for service-auth JWTs in examples). */
export const RELAY_DID = 'did:web:relay.atmo.pub';

/** Lexicon NSID prefix for relay methods. */
export const LEXICON_PREFIX = 'pub.atmo.notify';
