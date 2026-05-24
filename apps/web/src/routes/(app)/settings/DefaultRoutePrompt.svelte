<script lang="ts">
	// Nudge the user to pick a real default route when their account default would
	// reach NONE of their connected channels — i.e. a fresh 'inbox' default, or a
	// stale one like 'push' when they have no push device. Shows on the Channels
	// tab once at least one channel is connected. Only the explicit "Not now"
	// persists (localStorage); backdrop/Escape just close it for this session, so a
	// stray click can't hide it forever.
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { CHANNELS, channelsRoute, routeChannels, type RouteInstances } from '@atmo/notifs-lexicons';
	import { channelLabel } from '$lib/routes';
	import { setDefaultRoute } from '$lib/remote/notifs.remote';

	let { defaultRoute, channels }: { defaultRoute: string; channels: RouteInstances } = $props();

	const DISMISS_KEY = 'atmo:defaultRoutePrompt:dismissed:v2';

	let mounted = $state(false);
	let dismissed = $state(false); // persisted "Not now"
	let closed = $state(false); // session-only (backdrop / Escape)
	let busy = $state(false);

	onMount(() => {
		dismissed = localStorage.getItem(DISMISS_KEY) === '1';
		mounted = true;
	});

	// Channels the user has at least one (verified) target for.
	const available = $derived(CHANNELS.filter((c) => (channels[c]?.length ?? 0) > 0));
	// The default delivers nowhere useful: none of its channels is one they have.
	// (Empty 'inbox'/'' → reaches none; 'off' is a deliberate "drop", so leave it.)
	const reachesNone = $derived(
		defaultRoute !== 'off' && routeChannels(defaultRoute).every((c) => !available.includes(c))
	);
	const visible = $derived(
		mounted && !dismissed && !closed && available.length > 0 && reachesNone
	);

	const label = $derived(
		available.length === 1 ? channelLabel(available[0]) : 'your connected channels'
	);

	function notNow() {
		dismissed = true;
		localStorage.setItem(DISMISS_KEY, '1');
	}

	async function setAsDefault() {
		busy = true;
		try {
			await setDefaultRoute({ route: channelsRoute(available) });
			await invalidateAll(); // default now reaches a channel → `visible` becomes false
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => visible && e.key === 'Escape' && (closed = true)} />

{#if visible}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
		onclick={() => (closed = true)}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="drp-title"
			tabindex="-1"
			class="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-lg"
			onclick={(e) => e.stopPropagation()}
		>
			<h2 id="drp-title" class="text-base font-semibold text-fg">Set a default route?</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Right now notifications won't alert you anywhere — they only land in your inbox. Send them to
				<span class="font-medium text-fg">{label}</span> by default? You can change this anytime in
				Settings&nbsp;→&nbsp;Routing.
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					onclick={notNow}
					disabled={busy}
					class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
				>
					Not now
				</button>
				<button
					type="button"
					onclick={setAsDefault}
					disabled={busy}
					class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{busy ? 'Saving…' : `Send to ${label}`}
				</button>
			</div>
		</div>
	</div>
{/if}
