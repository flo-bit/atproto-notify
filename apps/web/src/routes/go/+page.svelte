<script lang="ts">
	// Handoff page for opening an external link in the user's default browser from
	// the installed PWA. Push clicks go through the service worker, which can only
	// open in-scope pages — it opens THIS page, which links out to the destination.
	//
	// iOS only hands an out-of-scope link to the default browser on a real TAP, so
	// there we DON'T auto-redirect (it would just load the URL inside the PWA) —
	// the user taps the button. Everywhere else (Mac PWA, desktop) the programmatic
	// redirect works, so we do it automatically.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	const to = $derived(page.url.searchParams.get('to') ?? '');
	const valid = $derived(/^https?:\/\//.test(to));
	const host = $derived(valid ? new URL(to).host : '');

	onMount(() => {
		// Once the link opens, the browser/app takes over (page → hidden); when the
		// user comes back to the PWA (→ visible) drop them on the inbox instead of
		// leaving them stranded on this handoff page.
		let leftForLink = false;
		function onVisibility() {
			if (document.visibilityState === 'hidden') leftForLink = true;
			else if (leftForLink) goto('/inbox', { replaceState: true });
		}
		document.addEventListener('visibilitychange', onVisibility);

		const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (valid && !iosStandalone) window.location.href = to;

		return () => document.removeEventListener('visibilitychange', onVisibility);
	});
</script>

<svelte:head><title>Open link · atmo.pub</title></svelte:head>

<main class="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
	{#if valid}
		<div>
			<p class="text-sm text-muted">Continue to</p>
			<p class="mt-1 font-medium break-all text-fg">{host}</p>
		</div>
		<a
			href={to}
			rel="noopener noreferrer"
			class="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
		>
			Open in browser
		</a>
		<a href="/inbox" class="text-sm font-medium text-muted hover:text-fg">Back to inbox</a>
	{:else}
		<p class="text-sm text-muted">That link looks invalid.</p>
		<a href="/inbox" class="text-sm font-medium text-accent hover:underline">Back to inbox</a>
	{/if}
</main>
