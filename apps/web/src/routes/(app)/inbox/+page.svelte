<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head><title>Inbox · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<header class="border-b border-line pb-4">
		<h1 class="text-2xl font-bold tracking-tight text-fg">Inbox</h1>
	</header>

	<div class="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
		<div
			class="grid size-14 place-items-center rounded-card bg-accent-soft text-accent"
			aria-hidden="true"
		>
			<Icon name="inbox" size={28} stroke={1.7} />
		</div>
		<p class="text-base font-semibold text-fg">Inbox</p>
		<p class="max-w-xs text-sm text-muted">
			Coming soon — your notifications will show up here.
		</p>
	</div>
</div>
