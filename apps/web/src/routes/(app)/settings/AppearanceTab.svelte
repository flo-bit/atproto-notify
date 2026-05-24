<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	type Theme = 'system' | 'light' | 'dark';
	let theme = $state<Theme>('system');
	const themeOptions = [
		{ value: 'system', label: 'System', desc: 'Match your device appearance.' },
		{ value: 'light', label: 'Light', desc: 'Always use the light theme.' },
		{ value: 'dark', label: 'Dark', desc: 'Always use the dark theme.' }
	] as const;

	onMount(() => {
		const stored = localStorage.getItem('theme');
		theme = stored === 'light' || stored === 'dark' ? stored : 'system';
	});

	function setTheme(value: Theme) {
		theme = value;
		if (value === 'system') {
			localStorage.removeItem('theme');
			delete document.documentElement.dataset.theme;
		} else {
			localStorage.setItem('theme', value);
			document.documentElement.dataset.theme = value;
		}
	}
</script>

<section class="mt-6 max-w-2xl">
	<h2 class="mb-2 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Theme</h2>
	<div class="overflow-hidden rounded-card border border-line bg-surface">
		{#each themeOptions as opt, i (opt.value)}
			<button
				type="button"
				onclick={() => setTheme(opt.value)}
				class="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-2 {i <
				themeOptions.length - 1
					? 'border-b border-line-2'
					: ''}"
			>
				<div class="min-w-0">
					<div class="text-sm font-semibold text-fg">{opt.label}</div>
					<div class="mt-0.5 text-xs text-muted">{opt.desc}</div>
				</div>
				{#if theme === opt.value}
					<Icon name="check" size={18} stroke={2.4} class="shrink-0 text-accent" />
				{/if}
			</button>
		{/each}
	</div>
</section>
