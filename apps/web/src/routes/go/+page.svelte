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
	import { markNotificationsRead } from '$lib/remote/notifs.remote';

	const to = $derived(page.url.searchParams.get('to') ?? '');
	const valid = $derived(/^https?:\/\//.test(to));
	const host = $derived(valid ? new URL(to).host : '');

	onMount(() => {
		// Mark the originating notification read on open. iOS doesn't do this just
		// because the app came to the foreground, so we do it explicitly (and again
		// here even if the user later taps "Open").
		const n = page.url.searchParams.get('n');
		const marked = n ? markNotificationsRead({ ids: [n] }).catch(() => {}) : Promise.resolve();

		// Once the link opens, the browser/app takes over (page → hidden); when the
		// user comes back to the PWA (→ visible) drop them on the inbox instead of
		// leaving them stranded on this handoff page.
		let leftForLink = false;
		function onVisibility() {
			if (document.visibilityState === 'hidden') leftForLink = true;
			else if (leftForLink) goto('/inbox', { replaceState: true });
		}
		document.addEventListener('visibilitychange', onVisibility);

		// Non-iOS (Mac PWA / desktop) auto-redirects; iOS waits for a real tap. Let
		// the mark-read settle first (a navigation would abort the in-flight fetch),
		// but cap the wait so a slow request never strands the user here.
		const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (valid && !iosStandalone) {
			const cap = new Promise((r) => setTimeout(r, 1000));
			Promise.race([marked, cap]).then(() => {
				window.location.href = to;
			});
		}

		return () => document.removeEventListener('visibilitychange', onVisibility);
	});
</script>

<svelte:head><title>Open link · atmo.pub</title></svelte:head>

<main class="flex min-h-dvh flex-col px-6 pt-16 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
	{#if valid}
		<div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
			<p class="text-sm text-muted">Continue to</p>
			<p class="max-w-full font-medium break-all text-fg">{host}</p>
		</div>

		<div class="flex flex-col gap-3">
			<a
				href={to}
				rel="noopener noreferrer"
				class="block w-full rounded-2xl bg-accent px-6 py-5 text-center text-lg font-semibold text-accent-fg transition-opacity hover:opacity-90"
			>
				Open in browser
			</a>
			<a
				href="/inbox"
				class="block w-full py-2 text-center text-sm font-medium text-muted hover:text-fg"
			>
				Back to inbox
			</a>
		</div>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center gap-5 text-center">
			<p class="text-sm text-muted">That link looks invalid.</p>
			<a href="/inbox" class="text-sm font-medium text-accent hover:underline">Back to inbox</a>
		</div>
	{/if}
</main>
