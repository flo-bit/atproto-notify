// Cross-app login landing. Another atproto app links the user here with a
// single-use `pub.atmo.auth` service-auth token minted by their PDS; we verify
// it through the RELAY binding, mint a lite session, and redirect — stripping the
// token from the URL. See CROSS-APP-AUTH.md.
import { redirect } from '@sveltejs/kit';

import { LITE_SESSION_COOKIE, liteCookieOptions, signLiteSession } from '$lib/server/liteSession';

import type { RequestHandler } from './$types';

/** Only allow same-app relative redirects (no open redirects). */
function safeRedirect(target: string | null): string {
	if (!target || !target.startsWith('/') || target.startsWith('//')) return '/apps';
	return target;
}

export const GET: RequestHandler = async ({ url, platform, cookies, setHeaders }) => {
	// Defence-in-depth: keep the token out of any Referer to a third party. The
	// token is also single-use, so it is inert after this request regardless.
	setHeaders({ 'referrer-policy': 'no-referrer' });

	const token = url.searchParams.get('token');
	const target = safeRedirect(url.searchParams.get('redirect'));
	const relay = platform?.env.RELAY;

	if (!token || !relay) {
		redirect(303, '/?login=expired');
	}

	// A service-binding RPC call returns an awaitable thenable, but not a full
	// Promise — `.catch()` isn't available on it — so guard with try/catch.
	let result: Awaited<ReturnType<typeof relay.verifyAppLogin>> | null = null;
	try {
		result = await relay.verifyAppLogin(token);
	} catch {
		result = null;
	}
	if (!result) {
		redirect(303, '/?login=expired');
	}

	cookies.set(LITE_SESSION_COOKIE, await signLiteSession(result.did), liteCookieOptions);
	redirect(303, target);
};
