import { command } from '$app/server';
import * as v from 'valibot';
import { atproto } from '$lib/atproto';

export const oauthLogin = command(
	v.object({
		handle: v.optional(v.pipe(v.string(), v.minLength(3))),
		signup: v.optional(v.boolean()),
		returnTo: v.optional(v.string())
	}),
	async (input) => {
		try {
			return await atproto.api.startLogin(input);
		} catch (err) {
			// Surfaces the real cause in `wrangler tail` / dev console.
			console.error('[oauthLogin] startLogin failed:', err);
			throw err;
		}
	}
);

export const oauthLogout = command(() => atproto.api.logout());
