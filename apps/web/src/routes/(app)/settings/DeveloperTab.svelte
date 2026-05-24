<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { DOCS_URL } from '$lib/config';
</script>

<section class="mt-6 max-w-2xl">
	<h2 class="mb-2 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Developer docs</h2>
	<div class="rounded-card border border-line bg-surface p-4">
		<p class="text-sm text-muted">
			Building an app? Send notifications through atmo.pub — request permission, send, and let users
			manage routing — over a small XRPC API. The full guide, with code, lives on the docs site.
		</p>
		<a
			href={DOCS_URL}
			target="_blank"
			rel="noreferrer"
			class="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
		>
			Open developer docs
			<Icon name="arrow-right" size={16} stroke={2} />
		</a>
	</div>
</section>
