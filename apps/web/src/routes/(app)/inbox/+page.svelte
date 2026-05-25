<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import NotificationAvatar from '$lib/components/NotificationAvatar.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import { markNotificationsRead } from '$lib/remote/notifs.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state(false);
	let refreshing = $state(false);

	async function refresh() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	// In an installed PWA, `target="_blank"` opens an in-app browser (and iOS
	// keeps it Safari-only). A plain same-window navigation to an out-of-scope URL
	// (notification uris are cross-origin → outside our scope) is the only thing
	// iOS hands to the user's *default* browser. So: drop `target` when running
	// standalone, keep new-tab in a normal browser. Detected after mount so SSR/
	// hydration render the same thing first (no mismatch).
	let standalone = $state(false);
	onMount(() => {
		standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;

		// A push click with no link lands here as `/inbox?n=<id>`. iOS doesn't mark
		// the notification read just because the app opened, so do it explicitly.
		const n = page.url.searchParams.get('n');
		if (n) {
			markNotificationsRead({ ids: [n] })
				.then(() => invalidateAll())
				.catch(() => {});
		}
	});

	async function markAll() {
		busy = true;
		try {
			await markNotificationsRead({ all: true });
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	// Mark read in the background (fire-and-forget). We DON'T open the link here —
	// notifications with a `uri` are real <a target="_blank"> anchors so the OS hands
	// the link to the default browser (a standalone PWA keeps `window.open` in-app).
	function markRead(n: PageData['notifications'][number]) {
		if (n.read) return;
		markNotificationsRead({ ids: [n.id] })
			.then(() => invalidateAll())
			.catch(() => {
				/* ignore — opening still proceeds */
			});
	}

	// The row is a flex container; the avatar (which may hold its own actor links)
	// sits beside the notification's link/button so we never nest anchors.
	const rowClass =
		'flex items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-surface-2';
	const openClass = 'block min-w-0 flex-1 text-left';
</script>

<svelte:head><title>Inbox · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<header class="flex items-center justify-between border-b border-line pb-4">
		<div class="flex items-center gap-2">
			<h1 class="text-2xl font-bold tracking-tight text-fg">Inbox</h1>
			{#if data.unread > 0}
				<span
					class="rounded-full bg-accent px-2 py-0.5 font-mono text-xs font-medium text-accent-fg"
				>
					{data.unread}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if data.unread > 0}
				<button
					class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
					disabled={busy}
					onclick={markAll}
				>
					{busy ? '…' : 'Mark all read'}
				</button>
			{/if}
			<button
				class="grid size-9 place-items-center rounded-md border border-line text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
				disabled={refreshing}
				onclick={refresh}
				aria-label="Refresh"
				title="Refresh"
			>
				<Icon name="refresh" size={16} class={refreshing ? 'animate-spin' : ''} />
			</button>
		</div>
	</header>

	{#if data.notifications.length === 0}
		<div class="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
			<div
				class="grid size-14 place-items-center rounded-card bg-accent-soft text-accent"
				aria-hidden="true"
			>
				<Icon name="inbox" size={28} stroke={1.7} />
			</div>
			<p class="text-base font-semibold text-fg">No notifications yet</p>
			<p class="max-w-xs text-sm text-muted">
				When an app you've approved sends you something, it'll show up here.
			</p>
		</div>
	{:else}
		<ul class="mt-2 divide-y divide-line-2">
			{#each data.notifications as n (n.id)}
				<li class={rowClass}>
					<NotificationAvatar
						sender={n.sender}
						senderTitle={n.senderTitle}
						iconUrl={n.iconUrl}
						actors={n.actors}
						{standalone}
					/>
					{#if n.uri}
						<!-- Open in the default browser. Standalone PWA: no target → out-of-scope nav
						     hands off to the default browser. Normal browser: new tab. -->
						<a
							href={n.uri}
							target={standalone ? undefined : '_blank'}
							rel="noopener noreferrer"
							onclick={() => markRead(n)}
							class={openClass}
						>
							{@render itemText(n)}
						</a>
					{:else}
						<button type="button" onclick={() => markRead(n)} class={openClass}>
							{@render itemText(n)}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#snippet itemText(n: PageData['notifications'][number])}
	<div class="flex items-center gap-2">
		<span class="min-w-0 truncate text-sm font-semibold text-fg">{n.title}</span>
		{#if !n.read}
			<span class="size-2 shrink-0 rounded-full bg-accent" aria-label="unread"></span>
		{/if}
		{#if n.category}
			<span
				class="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-2"
			>
				{n.category}
			</span>
		{/if}
		<RelativeTime
			date={n.createdAt}
			class="ml-auto shrink-0 font-mono text-xs whitespace-nowrap text-muted-2"
		/>
	</div>
	{#if n.body}
		<p class="mt-0.5 line-clamp-2 text-sm text-muted">{n.body}</p>
	{/if}
{/snippet}
