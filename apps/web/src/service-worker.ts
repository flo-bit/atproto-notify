/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Minimal PWA service worker (Phase 1): precache the built app shell + static
// files so the app launches offline. Pages and relay/auth requests are NOT
// cached (they're user-specific). Phase 2 adds `push` / `notificationclick`
// handlers for web push.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `atmo-pub-${version}`;
// Built JS/CSS (immutable, hashed) + static assets (icon, manifest, robots).
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

	// Only serve precached, build/static assets from the cache; everything else
	// (pages, OAuth, relay data) goes straight to the network so we never serve
	// stale or another user's content.
	if (PRECACHE.includes(url.pathname)) {
		event.respondWith(
			caches.match(request).then((cached) => cached ?? fetch(request))
		);
	}
});

// Web push: show the notification the relay delivered.
sw.addEventListener('push', (event) => {
	let data: { title?: string; body?: string; uri?: string; notificationId?: string } = {};
	try {
		data = event.data?.json() ?? {};
	} catch {
		/* non-JSON payload — fall back to defaults */
	}
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'atmo.pub', {
			body: data.body ?? '',
			icon: '/icon.svg',
			badge: '/icon.svg',
			// `n` lets the click handler mark this inbox notification read on open.
			data: { uri: data.uri, n: data.notificationId }
		})
	);
});

// A click goes to the PWA (the SW can only open in-scope pages). For an external
// link we open the in-scope `/go` handoff page, which then bounces to the user's
// default browser (a PWA can't render an out-of-scope URL); links to nowhere just
// open the inbox. Either way we carry `n` (the notification id) so the opened page
// can mark it read — iOS doesn't do that just because the app came to the front.
// Routing through `/go` also keeps `client.navigate` same-origin (it can't navigate
// an existing window to a cross-origin URL).
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const { uri, n } = (event.notification.data as { uri?: string; n?: string } | null) ?? {};
	const origin = sw.location.origin;
	const nParam = n ? `&n=${encodeURIComponent(n)}` : '';
	const target =
		uri && /^https?:/.test(uri)
			? new URL(`/go?to=${encodeURIComponent(uri)}${nParam}`, origin).href
			: new URL(`/inbox${n ? `?n=${encodeURIComponent(n)}` : ''}`, origin).href;
	event.waitUntil(
		(async () => {
			const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of clients) {
				await client.focus();
				await client.navigate(target);
				return;
			}
			await sw.clients.openWindow(target);
		})()
	);
});
