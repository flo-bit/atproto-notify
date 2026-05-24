// Routing UI helpers. A route is a channel set ('+'-joined, e.g. 'push+email') or
// 'off'; app-wide and per-category routes add the inherit sentinels 'default'/'app'.
// See @atmo/notifs-lexicons (routeChannels / channelsRoute).
import { type Channel, routeChannels } from '@atmo/notifs-lexicons';

/** Channels offered in the routing picker, in display order. */
export const CHANNELS: { id: Channel; label: string }[] = [
	{ id: 'push', label: 'Push' },
	{ id: 'telegram', label: 'Telegram' },
	{ id: 'email', label: 'Email' }
];

const CHANNEL_LABEL: Record<Channel, string> = {
	push: 'Push',
	telegram: 'Telegram',
	email: 'Email'
};

/** Human label for a route string (a channel set, 'off', or an inherit sentinel). */
export function routeLabel(route: string): string {
	if (route === 'default') return 'Account default';
	if (route === 'app') return 'Like app';
	const ch = routeChannels(route);
	return ch.length > 0 ? ch.map((c) => CHANNEL_LABEL[c]).join(' + ') : 'Off';
}
