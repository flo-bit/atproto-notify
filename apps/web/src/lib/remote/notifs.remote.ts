// Remote `command` functions for dashboard mutations. Reads live in the page
// `load` functions; after a command runs, the client calls `invalidateAll()` to
// refresh the page data.
import type { Did } from '@atcute/lexicons';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

import { relayFor } from '$lib/server/relay';

/** Resolve the relay bound to the signed-in user, or 401. */
function requireRelay() {
	const { locals, platform } = getRequestEvent();
	if (!locals.did) {
		error(401, 'Not signed in');
	}
	return relayFor(platform, locals.did);
}

const didSchema = v.pipe(v.string(), v.startsWith('did:'));

export const approve = command(
	v.object({ sender: didSchema, requestId: v.optional(v.string()) }),
	async ({ sender, requestId }) => {
		await requireRelay().grant({ sender: sender as Did, requestId });
	}
);

export const deny = command(v.object({ requestId: v.string() }), async ({ requestId }) => {
	await requireRelay().denyPending({ requestId });
});

export const revoke = command(v.object({ sender: didSchema }), async ({ sender }) => {
	await requireRelay().revoke({ sender: sender as Did });
});

export const setMuted = command(
	v.object({ sender: didSchema, muted: v.boolean() }),
	async ({ sender, muted }) => {
		await requireRelay().muteGrant({ sender: sender as Did, muted });
	}
);

export const setNotifyPending = command(v.object({ value: v.boolean() }), async ({ value }) => {
	await requireRelay().updateSettings({ notifyPendingViaTelegram: value });
});

/** Returns the Telegram deep link; the client navigates to it. */
export const linkTelegram = command(async () => {
	const { deepLink } = await requireRelay().linkChannel({ platform: 'telegram' });
	return { deepLink };
});

export const unlinkTelegram = command(async () => {
	await requireRelay().unlinkChannel({ platform: 'telegram' });
});

export const registerPush = command(
	v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() }),
	async (sub) => {
		await requireRelay().registerWebPush(sub);
	}
);

export const unregisterPush = command(v.object({ endpoint: v.string() }), async ({ endpoint }) => {
	await requireRelay().unregisterWebPush(endpoint);
});

export const markNotificationsRead = command(
	v.object({ ids: v.optional(v.array(v.string())), all: v.optional(v.boolean()) }),
	async (input) => {
		await requireRelay().markRead(input);
	}
);
