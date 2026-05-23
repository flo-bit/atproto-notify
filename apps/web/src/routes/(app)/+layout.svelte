<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { oauthLogout } from '$lib/atproto/oauth.remote';
	import Icon from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
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

<div class="min-h-screen md:grid md:grid-cols-[15.5rem_1fr]">
	<!-- Desktop sidebar -->
	<aside
		class="sticky top-0 hidden h-screen flex-col gap-1 border-r border-line bg-bg p-3 md:flex"
	>
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

		<!-- Account / theme / sign out -->
		<div class="flex flex-col gap-2 border-t border-line pt-3">
			<div class="px-2">
				<div class="truncate font-mono text-xs text-muted-2" title={data.did}>{shortDid}</div>
			</div>
			<div class="flex items-center gap-2">
				<ThemeToggle />
				<button
					type="button"
					onclick={signOut}
					disabled={signingOut}
					class="flex flex-1 items-center justify-start gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
				>
					<Icon name="logout" size={16} />
					<span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
				</button>
			</div>
		</div>
	</aside>

	<!-- Main content -->
	<div class="flex min-w-0 flex-col">
		<!-- Mobile top bar -->
		<header
			class="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur md:hidden"
		>
			<Wordmark size={15} />
			<ThemeToggle />
		</header>

		<main class="flex-1 pb-24 md:pb-0">
			{@render children()}
		</main>
	</div>
</div>

<!-- Mobile bottom tab bar -->
<nav
	class="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-bg/90 pt-2 pb-6 backdrop-blur md:hidden"
>
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
