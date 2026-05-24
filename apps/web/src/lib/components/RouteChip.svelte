<script lang="ts">
	import { routeLabel } from '$lib/routes';

	let { route, size = 'sm' }: { route: string; size?: 'sm' | 'md' } = $props();

	// Hue per single channel; sets/sentinels render neutral. Colors are translucent
	// so they read on both light and dark.
	const HUE: Record<string, number | null> = {
		push: 145,
		telegram: 220,
		email: 25,
		dm: 195,
		webhook: 290,
		inbox: 250
	};

	const hue = $derived(HUE[route] ?? null);
	const label = $derived(routeLabel(route));
	const fs = $derived(size === 'md' ? 'text-xs' : 'text-[11px]');
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono whitespace-nowrap {fs} {hue ===
	null
		? 'border-line bg-surface-2 text-muted'
		: ''}"
	style={hue === null
		? ''
		: `color:oklch(0.62 0.15 ${hue});background:oklch(0.62 0.15 ${hue} / 0.13);border-color:oklch(0.62 0.15 ${hue} / 0.3)`}
>
	<span
		class="size-1.5 rounded-full {hue === null ? 'bg-muted-2' : ''}"
		style={hue === null ? '' : `background:oklch(0.62 0.15 ${hue})`}
	></span>
	{label}
</span>
