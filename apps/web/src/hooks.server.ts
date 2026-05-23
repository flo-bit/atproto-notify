import type { Handle } from '@sveltejs/kit';

import { atproto } from '$lib/atproto';
import { LITE_SESSION_COOKIE, verifyLiteSession } from '$lib/server/liteSession';

// Run the OAuth lib's handle (it populates locals.did/session/client from the
// OAuth session and intercepts /oauth/* routes). For normal requests it didn't
// intercept, fall back to the cross-app "lite session" cookie if there's no
// OAuth session, so a link-authenticated user is signed in too. The app only
// ever needs locals.did, so the two paths are equivalent (see CROSS-APP-AUTH.md).
export const handle: Handle = ({ event, resolve }) =>
	atproto.handle({
		event,
		resolve: async (ev) => {
			if (ev.locals.did) {
				ev.locals.authVia = 'oauth';
			} else {
				const did = await verifyLiteSession(ev.cookies.get(LITE_SESSION_COOKIE));
				ev.locals.did = did;
				ev.locals.authVia = did ? 'link' : null;
			}
			return resolve(ev);
		}
	});
