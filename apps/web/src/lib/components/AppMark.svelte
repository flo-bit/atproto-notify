<script lang="ts">
	// Deterministic colored rounded square with the first letter of `id`.
	// Ported from `AppMarkV2` in ref/design/project/v2-data.jsx. The hue is
	// derived from the id so the same app always gets the same color.
	interface Props {
		/** Identity used to derive both the hue and the displayed initial (DID or title). */
		id: string;
		size?: number;
		/** Slightly lighter color for muted/dimmed apps. */
		dim?: boolean;
	}

	let { id, size = 38, dim = false }: Props = $props();

	const hue = $derived([...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360);
	const initial = $derived((id.trim()[0] ?? '?').toUpperCase());
</script>

<div
	class="flex shrink-0 items-center justify-center rounded-[0.6rem] font-bold text-white"
	style="width: {size}px; height: {size}px; font-size: {size * 0.42}px; background: oklch({dim
		? 0.78
		: 0.7} 0.13 {hue});"
	aria-hidden="true"
>
	{initial}
</div>
