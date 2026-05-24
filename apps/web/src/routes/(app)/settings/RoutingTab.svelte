<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ChannelRoutePicker from '$lib/components/ChannelRoutePicker.svelte';
	import { setDefaultRoute } from '$lib/remote/notifs.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state(false);
	let errorMsg = $state('');

	async function save(route: string) {
		busy = true;
		errorMsg = '';
		try {
			await setDefaultRoute({ route });
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<section class="mt-6 max-w-2xl">
	<h2 class="mb-2 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Default routing</h2>
	{#if errorMsg}
		<p
			class="mb-3 rounded-card border border-line bg-danger/10 px-3 py-2 text-sm text-danger"
			role="alert"
		>
			{errorMsg}
		</p>
	{/if}
	<div class="rounded-card border border-line bg-surface p-4">
		<div class="text-sm font-medium text-fg">Where notifications go by default</div>
		<p class="mt-1 text-xs text-muted">
			Pick where notifications go by default. <span class="font-medium text-fg">Inbox only</span>
			saves them with no alerts; <span class="font-medium text-fg">Off</span> drops them entirely.
			Apps set to “Account default” use this; override per-app (and per-category) from
			<a href="/apps" class="text-accent hover:underline">Apps</a>.
		</p>
		<div class="mt-3">
			<ChannelRoutePicker
				value={data.defaultRoute}
				instances={data.channels}
				disabled={busy}
				onchange={save}
			/>
		</div>
	</div>
</section>
