<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AppMark from '$lib/components/AppMark.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import { markNotificationsRead } from '$lib/remote/notifs.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state(false);

	async function markAll() {
		busy = true;
		try {
			await markNotificationsRead({ all: true });
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function open(n: PageData['notifications'][number]) {
		if (!n.read) {
			try {
				await markNotificationsRead({ ids: [n.id] });
				await invalidateAll();
			} catch {
				/* ignore — opening still proceeds */
			}
		}
		if (n.uri) window.open(n.uri, '_blank', 'noopener');
	}
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
		{#if data.unread > 0}
			<button
				class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
				disabled={busy}
				onclick={markAll}
			>
				{busy ? '…' : 'Mark all read'}
			</button>
		{/if}
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
				<li>
					<button
						type="button"
						onclick={() => open(n)}
						class="flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-surface-2"
					>
						<AppMark id={n.sender} size={40} />
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate text-sm font-semibold text-fg">{n.title}</span>
								{#if !n.read}
									<span
										class="size-2 shrink-0 rounded-full bg-accent"
										aria-label="unread"
									></span>
								{/if}
							</div>
							{#if n.body}
								<p class="mt-0.5 line-clamp-2 text-sm text-muted">{n.body}</p>
							{/if}
							<div class="mt-1 flex items-center gap-2 font-mono text-xs text-muted-2">
								<RelativeTime date={n.createdAt} />
								{#if n.category}<span>· {n.category}</span>{/if}
							</div>
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
