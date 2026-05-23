<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		/** Optional call-to-action rendered below the text. */
		cta?: Snippet;
	}

	let { title, description, cta }: Props = $props();
</script>

<div class="rounded-card border border-dashed border-line px-6 py-10 text-center">
	<p class="font-medium text-fg">{title}</p>
	{#if description}
		<p class="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
	{/if}
	{#if cta}
		<div class="mt-4 flex justify-center">{@render cta()}</div>
	{/if}
</div>
