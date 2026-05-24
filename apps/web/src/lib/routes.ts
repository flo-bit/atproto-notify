// Routing UI helpers. A route is a channel set ('+'-joined, e.g. 'push+email') or
// 'off'; app-wide and per-category routes add the inherit sentinels 'default'/'app'.
// See @atmo/notifs-lexicons (routeChannels / channelsRoute).
import { type Channel, routeChannels } from '@atmo/notifs-lexicons';

// Partial so adding a Channel never leaves this stale; `channelLabel` falls back
// to a capitalized id for any channel without an explicit label here.
const CHANNEL_LABEL: Partial<Record<Channel, string>> = {
	push: 'Push',
	telegram: 'Telegram',
	email: 'Email',
	dm: 'DM',
	webhook: 'Webhook'
};

/** Display label for a single channel (explicit, else capitalized id). */
export function channelLabel(c: Channel): string {
	return CHANNEL_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

/** Human label for a route string: inherit sentinel, 'off', 'inbox', or a token set. */
export function routeLabel(route: string): string {
	if (route === 'default') return 'Account default';
	if (route === 'app') return 'App default';
	if (route === 'off') return 'Off';
	if (route === 'inbox') return 'Inbox only';
	const ch = routeChannels(route);
	return ch.length > 0 ? ch.map(channelLabel).join(' + ') : 'Inbox only';
}
