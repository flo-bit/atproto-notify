// Minimal, hand-written route helpers — the same channel-set format atmo.pub
// uses, kept dependency-light for the demo. A route is a `+`-joined set of
// channel tokens; a token may be a bare channel ('push') or pin one instance
// ('push:<id>'). This demo routes at the channel level, so it reads any
// instance-pinned tokens as "that whole channel is on" and writes bare channels.
export const CHANNELS = ['push', 'telegram', 'email', 'dm', 'webhook'] as const;
export type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABEL: Record<string, string> = {
	push: 'Push',
	telegram: 'Telegram',
	email: 'Email',
	dm: 'Bluesky DM',
	webhook: 'Webhook'
};

/** Display label for a single channel (capitalized id as a fallback). */
export function channelLabel(c: string): string {
	return CHANNEL_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

const SENTINELS = new Set(['off', 'inbox', 'default', 'app', '']);

/** The distinct channels a route fires (sentinels → none), in canonical order. */
export function routeChannels(route: string): string[] {
	if (SENTINELS.has(route)) return [];
	const present = new Set<string>();
	for (const part of route.split('+')) {
		const channel = part.split(':')[0];
		if ((CHANNELS as readonly string[]).includes(channel)) present.add(channel);
	}
	return CHANNELS.filter((c) => present.has(c));
}

/** Encode whole channels as a canonical route string ('off' when empty). */
export function channelsRoute(channels: string[]): string {
	const set = CHANNELS.filter((c) => channels.includes(c));
	return set.length > 0 ? set.join('+') : 'off';
}

/** Human label for a route value (sentinel, 'off'/'inbox', or a channel set). */
export function routeLabel(route: string): string {
	if (route === 'default') return 'Account default';
	if (route === 'app') return 'App default';
	if (route === 'off') return 'Off';
	if (route === 'inbox') return 'Inbox only';
	const ch = routeChannels(route);
	return ch.length > 0 ? ch.map(channelLabel).join(' + ') : 'Inbox only';
}
