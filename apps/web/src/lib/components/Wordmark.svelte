<script lang="ts">
	// atmo.pub wordmark: the existing bell Logomark (accent) + "atmo" then a
	// muted ".pub", set in the mono font. Loosely modeled on `WordmarkV2`.
	import Logomark from '$lib/components/Logomark.svelte';

	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 15, class: klass = '' }: Props = $props();
</script>

<span class="flex items-center gap-2 text-fg {klass}">
	<Logomark size={size + 3} class="text-accent" />
	<span class="font-mono font-semibold tracking-tight" style="font-size: {size}px;">
		atmo<span class="font-normal text-muted-2">.pub</span>
	</span>
</span>
