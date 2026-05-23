// Side-effect: loads `com.atproto.*` lexicon types into the atcute Client.
import '@atcute/atproto';
import { createAtprotoAuth } from '@svelte-atproto/oauth/server';
import { cloudflareKV } from '@svelte-atproto/oauth/server/stores/cloudflare';
import { env } from '$env/dynamic/private';

// To enable signup, add: signupPDS: 'https://your-pds.example/'
export const atproto = createAtprotoAuth({
	origin: env.ORIGIN,
	cookieSecret: env.COOKIE_SECRET,
	clientAssertionKey: env.CLIENT_ASSERTION_KEY,
	scope: 'atproto repo:xyz.statusphere.status',
	sessions: cloudflareKV('OAUTH_SESSIONS'),
	states: cloudflareKV('OAUTH_STATES', { ttl: 600 })
});
