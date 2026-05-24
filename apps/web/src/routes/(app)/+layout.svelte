<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { oauthLogout } from '$lib/atproto/oauth.remote';
	import Icon from '$lib/components/Icon.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { DOCS_URL } from '$lib/config';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	type NavItem = { id: string; label: string; href: string; icon: 'inbox' | 'apps' | 'gear' };
	const nav: NavItem[] = [
		{ id: 'inbox', label: 'Inbox', href: '/inbox', icon: 'inbox' },
		{ id: 'apps', label: 'Apps', href: '/apps', icon: 'apps' },
		{ id: 'settings', label: 'Settings', href: '/settings', icon: 'gear' }
	];

	// Active tab is derived from the current path's first segment.
	const active = $derived(page.url.pathname.split('/')[1] ?? '');

	const shortDid = $derived(
		data.did && data.did.length > 24 ? `${data.did.slice(0, 16)}…${data.did.slice(-4)}` : data.did
	);

	// The content scroller is a persistent element (not the window), so reset it to
	// the top on each navigation — otherwise scroll position carries between pages.
	let mainEl = $state<HTMLElement>();
	afterNavigate(() => mainEl?.scrollTo({ top: 0 }));

	let signingOut = $state(false);
	async function signOut() {
		signingOut = true;
		try {
			await oauthLogout();
			window.location.href = '/';
		} catch {
			signingOut = false;
		}
	}
</script>

<div class="md:grid md:h-screen md:grid-cols-[15.5rem_1fr]">
	<!-- Desktop sidebar -->
	<aside class="sticky top-0 hidden h-screen flex-col gap-1 border-r border-line bg-bg p-3 md:flex">
		<div class="px-2 pt-2 pb-4">
			<Wordmark size={15} />
		</div>

		<nav class="flex flex-col gap-1">
			{#each nav as item (item.id)}
				{@const isActive = active === item.id}
				<a
					href={item.href}
					aria-current={isActive ? 'page' : undefined}
					class="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors
						{isActive
						? 'bg-surface-2 font-semibold text-fg'
						: 'font-medium text-muted hover:bg-surface-2 hover:text-fg'}"
				>
					<Icon name={item.icon} size={18} stroke={isActive ? 2 : 1.7} />
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>

		<div class="flex-1"></div>

		<!-- Developer docs (external) -->
		<a
			href={DOCS_URL}
			target="_blank"
			rel="noreferrer"
			class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
		>
			<Icon name="arrow-right" size={18} stroke={1.7} />
			<span>Developer docs</span>
		</a>

		<!-- Account / sign out -->
		<div class="mt-1 flex flex-col gap-2 border-t border-line pt-3">
			<div class="px-2" title={data.did}>
				{#if data.handle}
					<div class="truncate text-xs font-medium text-fg">@{data.handle}</div>
				{:else}
					<div class="truncate font-mono text-xs text-muted-2">{shortDid}</div>
				{/if}
			</div>
			<button
				type="button"
				onclick={signOut}
				disabled={signingOut}
				class="flex items-center justify-start gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
			>
				<Icon name="logout" size={16} />
				<span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
			</button>
		</div>
	</aside>

	<!-- App column: a full-viewport flex column on mobile (so the tab bar stays
	     pinned and only the content scrolls), the grid's 2nd cell on desktop. -->
	<div class="flex h-dvh min-w-0 flex-col md:h-screen">
		<!-- Mobile top bar -->
		<header class="flex h-14 shrink-0 items-center border-b border-line bg-bg px-4 md:hidden">
			<Wordmark size={15} />
		</header>

		<main bind:this={mainEl} class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</main>

		<!-- Mobile bottom tab bar — in-flow, so it always sits at the column's
		     bottom (no `fixed`, which is unreliable with iOS scrolling). -->
		<nav class="flex shrink-0 justify-around border-t border-line bg-bg pt-2 pb-6 md:hidden">
			{#each nav as item (item.id)}
				{@const isActive = active === item.id}
				<a
					href={item.href}
					aria-current={isActive ? 'page' : undefined}
					class="flex flex-col items-center gap-1 px-4 text-[0.65rem] font-semibold transition-colors
						{isActive ? 'text-accent' : 'text-muted-2'}"
				>
					<Icon name={item.icon} size={24} stroke={isActive ? 2 : 1.7} />
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</div>
</div>
