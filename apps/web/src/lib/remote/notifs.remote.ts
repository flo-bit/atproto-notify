// Remote `command` functions for dashboard mutations. Reads live in the page
// `load` functions; after a command runs, the client calls `invalidateAll()` to
// refresh the page data.
import type { Did } from '@atcute/lexicons';
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

import { relay } from '$lib/server/relay';

/** Resolve the signed-in user's authenticated client, or 401. */
function requireClient() {
	const { locals } = getRequestEvent();
	if (!locals.client) {
		error(401, 'Not signed in');
	}
	return locals.client;
}

const didSchema = v.pipe(v.string(), v.startsWith('did:'));

export const approve = command(
	v.object({ sender: didSchema, requestId: v.optional(v.string()) }),
	async ({ sender, requestId }) => {
		await relay.grant(requireClient(), { sender: sender as Did, requestId });
	}
);

export const deny = command(v.object({ requestId: v.string() }), async ({ requestId }) => {
	await relay.denyPending(requireClient(), { requestId });
});

export const revoke = command(v.object({ sender: didSchema }), async ({ sender }) => {
	await relay.revoke(requireClient(), { sender: sender as Did });
});

export const setMuted = command(
	v.object({ sender: didSchema, muted: v.boolean() }),
	async ({ sender, muted }) => {
		await relay.muteGrant(requireClient(), { sender: sender as Did, muted });
	}
);

export const setNotifyPending = command(v.object({ value: v.boolean() }), async ({ value }) => {
	await relay.updateSettings(requireClient(), { notifyPendingViaTelegram: value });
});

/** Returns the Telegram deep link; the client navigates to it. */
export const linkTelegram = command(async () => {
	const { deepLink } = await relay.linkChannel(requireClient(), { platform: 'telegram' });
	return { deepLink };
});

export const unlinkChannel = command(v.object({ deviceId: v.string() }), async ({ deviceId }) => {
	await relay.unlinkChannel(requireClient(), { deviceId });
});
