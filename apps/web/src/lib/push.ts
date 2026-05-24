// Browser-only web push helpers. Functions assume they run in the browser
// (Settings click handlers / onMount); `pushSupported()` gates them for SSR and
// unsupported browsers, and when no VAPID key is configured.
import { VAPID_PUBLIC_KEY } from '$lib/config';

export interface FlatPushSubscription {
	endpoint: string;
	p256dh: string;
	auth: string;
	/** Device label: a user-chosen name if `named`, else the auto UA descriptor. */
	label?: string;
	/** True when `label` is a name the user typed (shown to apps as-is). */
	named?: boolean;
}

/** Best-effort "Browser · OS" label from the User-Agent (user can rename later). */
function deviceLabel(): string {
	const ua = navigator.userAgent;
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /OPR\/|Opera/.test(ua)
			? 'Opera'
			: /Firefox\//.test(ua)
				? 'Firefox'
				: /Chrome\//.test(ua)
					? 'Chrome'
					: /Safari\//.test(ua)
						? 'Safari'
						: 'Browser';
	const os = /iPhone|iPad|iPod/.test(ua)
		? 'iOS'
		: /Android/.test(ua)
			? 'Android'
			: /Macintosh|Mac OS X/.test(ua)
				? 'macOS'
				: /Windows/.test(ua)
					? 'Windows'
					: /Linux/.test(ua)
						? 'Linux'
						: '';
	return os ? `${browser} · ${os}` : browser;
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
	// Use getRegistration() (resolves immediately, even before the SW is active)
	// rather than `.ready`, which never resolves until a worker is active and so
	// hangs detection when the SW is still registering (notably in dev).
	const reg = await navigator.serviceWorker.getRegistration();
	if (!reg) return null;
	const sub = await reg.pushManager.getSubscription();
	return sub ? flatten(sub) : null;
}

/** The SW registration, preferring an existing one (no hang) over `.ready`. */
async function registration(): Promise<ServiceWorkerRegistration> {
	return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
}

/**
 * Request permission + subscribe this browser; returns the flattened subscription.
 * An optional `name` is the user's chosen device label (named); without one we
 * fall back to the auto "Browser · OS" descriptor.
 */
export async function subscribe(name?: string): Promise<FlatPushSubscription> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		throw new Error('Notification permission was not granted');
	}
	const reg = await registration();
	const sub = await reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
	});
	const trimmed = name?.trim();
	return trimmed
		? { ...flatten(sub), label: trimmed, named: true }
		: { ...flatten(sub), label: deviceLabel(), named: false };
}

/** Unsubscribe this browser; returns the endpoint that was removed (or null). */
export async function unsubscribe(): Promise<string | null> {
	const reg = await registration();
	const sub = await reg.pushManager.getSubscription();
	if (!sub) return null;
	const { endpoint } = sub;
	await sub.unsubscribe();
	return endpoint;
}
