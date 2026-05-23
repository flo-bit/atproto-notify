// Browser-only web push helpers. Functions assume they run in the browser
// (Settings click handlers / onMount); `pushSupported()` gates them for SSR and
// unsupported browsers, and when no VAPID key is configured.
import { VAPID_PUBLIC_KEY } from '$lib/config';

export interface FlatPushSubscription {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export function pushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window &&
		VAPID_PUBLIC_KEY !== ''
	);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	const raw = atob(padded);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

function flatten(sub: PushSubscription): FlatPushSubscription {
	const keys = sub.toJSON().keys;
	return { endpoint: sub.endpoint, p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' };
}

export async function currentSubscription(): Promise<FlatPushSubscription | null> {
	if (!pushSupported()) return null;
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	return sub ? flatten(sub) : null;
}

/** Request permission + subscribe this browser; returns the flattened subscription. */
export async function subscribe(): Promise<FlatPushSubscription> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		throw new Error('Notification permission was not granted');
	}
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
	});
	return flatten(sub);
}

/** Unsubscribe this browser; returns the endpoint that was removed (or null). */
export async function unsubscribe(): Promise<string | null> {
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	if (!sub) return null;
	const { endpoint } = sub;
	await sub.unsubscribe();
	return endpoint;
}
