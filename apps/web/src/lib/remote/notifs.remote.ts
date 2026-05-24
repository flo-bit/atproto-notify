// Remote `command` functions for dashboard mutations. Reads live in the page
// `load` functions; after a command runs, the client calls `invalidateAll()` to
// refresh the page data.
import type { Did } from '@atcute/lexicons';
import { isConcreteRoute } from '@atmo/notifs-lexicons';
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

const optionalLabel = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(64)));

/** Returns the Telegram deep link; the client navigates to it. Optional `label`
 *  is the user's chosen name, applied to the chat once linked. */
export const linkTelegram = command(
	v.object({ label: optionalLabel }),
	async ({ label }) => {
		const { deepLink } = await requireRelay().linkChannel({ platform: 'telegram' }, label);
		return { deepLink };
	}
);

export const linkEmail = command(
	v.object({ address: v.pipe(v.string(), v.email()), label: optionalLabel }),
	async ({ address, label }) => {
		await requireRelay().linkEmail(address, label);
	}
);

export const verifyEmail = command(
	v.object({ code: v.pipe(v.string(), v.regex(/^\d{6}$/)) }),
	async ({ code }) => requireRelay().verifyEmail(code)
);

/** Add a webhook target: the relay POSTs notifications to `url`. Relay re-validates. */
export const addWebhook = command(
	v.object({
		url: v.pipe(v.string(), v.url(), v.startsWith('https://', 'Webhook URL must use https://')),
		label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64))
	}),
	async ({ url, label }) => {
		await requireRelay().addWebhook(url, label);
	}
);

/** Enable Bluesky DM delivery (the relay's bot DMs the signed-in user). */
export const enableDM = command(async () => {
	await requireRelay().enableDM();
});

export const registerPush = command(
	v.object({
		endpoint: v.string(),
		p256dh: v.string(),
		auth: v.string(),
		label: v.optional(v.string()),
		named: v.optional(v.boolean())
	}),
	async (sub) => {
		await requireRelay().registerWebPush(sub);
	}
);

export const unregisterPush = command(v.object({ endpoint: v.string() }), async ({ endpoint }) => {
	await requireRelay().unregisterWebPush(endpoint);
});

/** Rename any delivery target (push device, Telegram chat, email). */
export const renameTarget = command(
	v.object({ id: v.string(), label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)) }),
	async ({ id, label }) => {
		await requireRelay().renameTarget(id, label);
	}
);

/** Remove any delivery target by id (unlink a Telegram chat, drop an email/device). */
export const removeTarget = command(v.object({ id: v.string() }), async ({ id }) => {
	await requireRelay().removeTarget(id);
});

export const markNotificationsRead = command(
	v.object({ ids: v.optional(v.array(v.string())), all: v.optional(v.boolean()) }),
	async (input) => {
		await requireRelay().markRead(input);
	}
);

/** Permanently delete every notification from one app. Returns the deleted count. */
export const clearAppNotifications = command(
	v.object({ sender: didSchema }),
	async ({ sender }) => requireRelay().clearNotificationsFromSender(sender as Did)
);

// A route is a `+`-joined channel set or 'off'; app/category add an inherit sentinel.
const concreteRoute = v.pipe(v.string(), v.check(isConcreteRoute, 'Invalid route'));
const appRoute = v.pipe(
	v.string(),
	v.check((s) => s === 'default' || isConcreteRoute(s), 'Invalid route')
);
const categoryRoute = v.pipe(
	v.string(),
	v.check((s) => s === 'app' || isConcreteRoute(s), 'Invalid route')
);

export const setDefaultRoute = command(v.object({ route: concreteRoute }), async ({ route }) => {
	await requireRelay().setDefaultRoute(route);
});

export const setRouting = command(
	v.object({ sender: didSchema, category: v.string(), route: categoryRoute }),
	async ({ sender, category, route }) => {
		await requireRelay().setRouting(sender as Did, category, route);
	}
);

export const setAppRouting = command(
	v.object({ sender: didSchema, route: appRoute }),
	async ({ sender, route }) => {
		await requireRelay().setAppRouting(sender as Did, route);
	}
);

export const setManage = command(
	v.object({ sender: didSchema, manage: v.picklist(['none', 'self', 'full']) }),
	async ({ sender, manage }) => {
		await requireRelay().setGrantManage(sender as Did, manage);
	}
);

export const setAutoAllow = command(
	v.object({ autoAllow: v.picklist(['all', 'trusted', 'none']) }),
	async ({ autoAllow }) => {
		await requireRelay().updateSettings({ autoAllow });
	}
);
