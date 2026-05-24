<script lang="ts">
	import { page } from '$app/state';
	import AppearanceTab from './AppearanceTab.svelte';
	import ChannelsTab from './ChannelsTab.svelte';
	import DeveloperTab from './DeveloperTab.svelte';
	import RequestsTab from './RequestsTab.svelte';
	import RoutingTab from './RoutingTab.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const TABS = [
		{ id: 'channels', label: 'Channels' },
		{ id: 'routing', label: 'Routing' },
		{ id: 'requests', label: 'Requests' },
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'developer', label: 'Developer docs' }
	] as const;
	const initialTab = page.url.searchParams.get('tab') ?? 'channels';
	let tab = $state(TABS.some((t) => t.id === initialTab) ? initialTab : 'channels');
</script>

<svelte:head><title>Settings · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<header>
		<h1 class="text-2xl font-bold tracking-tight text-fg">Settings</h1>
		<nav class="mt-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
			{#each TABS as t (t.id)}
				<button
					type="button"
					onclick={() => (tab = t.id)}
					aria-current={tab === t.id}
					class="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors {tab ===
					t.id
						? 'border-accent text-fg'
						: 'border-transparent text-muted hover:text-fg'}"
				>
					{t.label}
				</button>
			{/each}
		</nav>
	</header>

	{#if tab === 'channels'}
		<ChannelsTab {data} />
	{:else if tab === 'routing'}
		<RoutingTab {data} />
	{:else if tab === 'requests'}
		<RequestsTab {data} />
	{:else if tab === 'appearance'}
		<AppearanceTab />
	{:else if tab === 'developer'}
		<DeveloperTab />
	{/if}
</div>
