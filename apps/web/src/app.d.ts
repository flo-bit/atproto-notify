// See https://svelte.dev/docs/kit/types#app.d.ts
import type { OAuthSession } from '@atcute/oauth-node-client';
import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import type { NotifsRpc } from '@atmo/notifs-lexicons';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: OAuthSession | null;
			client: Client | null;
			did: Did | null;
			// How the current session was established: a full OAuth login, a
			// cross-app login link (lite session, see CROSS-APP-AUTH.md), or neither.
			authVia: 'oauth' | 'link' | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			// Cloudflare bindings on `event.platform`. `RELAY` is the relay Worker's
			// `RelayRpc` entrypoint (wrangler.jsonc → services + src/lib/server/relay.ts).
			// KV/ASSETS/vars are resolved by the OAuth lib via runtime binding names, so
			// they're covered by the index signature rather than enumerated here.
			env: {
				RELAY: NotifsRpc;
				[binding: string]: unknown;
			};
		}
	}
}

export {};
