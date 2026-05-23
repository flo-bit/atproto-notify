<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'system' | 'light' | 'dark';

	const order: Theme[] = ['system', 'light', 'dark'];
	const labels: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

	let theme = $state<Theme>('system');

	onMount(() => {
		const stored = localStorage.getItem('theme');
		theme = stored === 'light' || stored === 'dark' ? stored : 'system';
	});

	function cycle() {
		const next = order[(order.indexOf(theme) + 1) % order.length] ?? 'system';
		theme = next;
		if (next === 'system') {
			localStorage.removeItem('theme');
			delete document.documentElement.dataset.theme;
		} else {
			localStorage.setItem('theme', next);
			document.documentElement.dataset.theme = next;
		}
	}
</script>

<button
	type="button"
	onclick={cycle}
	title={`Theme: ${labels[theme]}`}
	aria-label={`Theme: ${labels[theme]}. Click to change.`}
	class="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
>
	{#if theme === 'system'}
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect x="2" y="3" width="20" height="14" rx="2" />
			<path d="M8 21h8M12 17v4" />
		</svg>
	{:else if theme === 'light'}
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path
				d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
			/>
		</svg>
	{:else}
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	{/if}
</button>
