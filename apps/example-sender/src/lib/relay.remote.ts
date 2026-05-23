// Remote command functions the page calls. requestNotifications goes through the
// user's OAuth session; sendTest signs with this app's own key.
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

import { APP_DOMAIN } from '$lib/config';
import { requestPermissionForUser, sendAsSender } from '$lib/server/relay';

export const requestNotifications = command(async () => {
	const { locals } = getRequestEvent();
	if (!locals.client) {
		error(401, 'Not signed in');
	}
	return requestPermissionForUser(locals.client);
});

export type SendResult =
	| { ok: true; id: string; delivered: number }
	| { ok: false; reason: 'notApproved' };

export const sendTest = command(
	v.object({ title: v.optional(v.string()), body: v.optional(v.string()) }),
	async ({ title, body }): Promise<SendResult> => {
		const { locals } = getRequestEvent();
		if (!locals.did) {
			error(401, 'Not signed in');
		}
		try {
			const result = await sendAsSender({
				recipient: locals.did,
				title: title?.trim() || 'Hello from the example sender',
				body: body?.trim() || 'If you can read this, the integration works end to end.',
				uri: `https://${APP_DOMAIN}`
			});
			return { ok: true, ...result };
		} catch (e) {
			// 403 = the user hasn't approved this sender yet.
			if ((e as { status?: number }).status === 403) {
				return { ok: false, reason: 'notApproved' };
			}
			throw e;
		}
	}
);
