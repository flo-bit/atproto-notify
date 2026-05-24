<script lang="ts">
	import { channelsRoute, routeChannels, type Channel } from '@atmo/notifs-lexicons';
	import { CHANNELS } from '$lib/routes';

	let {
		value,
		inherit,
		disabled = false,
		onchange
	}: {
		/** Current route string (a channel set, 'off', or an inherit sentinel). */
		value: string;
		/** Optional "inherit" choice (account default for apps, app-wide for categories). */
		inherit?: { token: 'default' | 'app'; label: string };
		disabled?: boolean;
		onchange: (route: string) => void;
	} = $props();

	const inheriting = $derived(inherit !== undefined && value === inherit.token);
	const selected = $derived(routeChannels(value));

	function toggle(id: Channel) {
		const next = selected.includes(id)
			? selected.filter((c) => c !== id)
			: [...selected, id];
		onchange(channelsRoute(next));
	}

	const base =
		'rounded-md border px-2.5 py-1 text-sm font-medium transition-colors disabled:opacity-50';
	const on = 'border-accent bg-accent-soft text-accent';
	const off = 'border-line text-muted hover:bg-surface-2 hover:text-fg';
</script>

<div class="flex flex-wrap gap-1.5">
	{#if inherit}
		<button
			type="button"
			{disabled}
			onclick={() => onchange(inherit.token)}
			aria-pressed={inheriting}
			class="{base} {inheriting ? on : off}"
		>
			{inherit.label}
		</button>
	{/if}
	{#each CHANNELS as c (c.id)}
		{@const active = !inheriting && selected.includes(c.id)}
		<button
			type="button"
			{disabled}
			onclick={() => toggle(c.id)}
			aria-pressed={active}
			class="{base} {active ? on : off}"
		>
			{c.label}
		</button>
	{/each}
</div>
