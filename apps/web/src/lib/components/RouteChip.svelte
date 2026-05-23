<script lang="ts">
	import { ROUTE_LABELS } from '$lib/routes';

	let { route, size = 'sm' }: { route: string; size?: 'sm' | 'md' } = $props();

	// Hue per route; null = neutral (uses theme tokens). Colors are translucent so
	// they read on both light and dark.
	const HUE: Record<string, number | null> = {
		push: 145,
		telegram: 220,
		'push+telegram': 185,
		inbox: 250,
		off: null,
		default: null,
		app: null
	};

	const hue = $derived(HUE[route] ?? null);
	const label = $derived(ROUTE_LABELS[route] ?? route);
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
