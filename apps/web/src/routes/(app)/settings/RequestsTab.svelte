<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ChannelRoutePicker from '$lib/components/ChannelRoutePicker.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { setAutoAllow, setPendingRoute } from '$lib/remote/notifs.remote';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});

	async function run(key: string, fn: () => Promise<unknown>) {
		busy[key] = true;
		try {
			await fn();
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Something went wrong');
		} finally {
			busy[key] = false;
		}
	}

	const autoAllowOptions = [
		{ value: 'all', label: 'All apps', desc: 'Any app that asks is approved automatically.' },
		{
			value: 'trusted',
			label: 'Trusted apps only',
			desc: 'A small built-in allowlist is auto-approved; everything else waits for you.'
		},
		{ value: 'none', label: 'No apps', desc: 'Every request waits for your approval in Apps.' }
	] as const;

	const sectionLabel = 'mb-2 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase';
</script>

<div class="mt-6 flex max-w-2xl flex-col gap-8">
	<!-- Automatic approval -->
	<section>
		<h2 class={sectionLabel}>Allow apps automatically</h2>
		<p class="mb-2 text-sm text-muted">
			When an app asks to notify you, decide whether it's approved automatically or waits for you in
			Apps.
		</p>
		<div class="overflow-hidden rounded-card border border-line bg-surface">
			{#each autoAllowOptions as opt, i (opt.value)}
				<button
					type="button"
					disabled={busy['autoAllow']}
					onclick={() => run('autoAllow', () => setAutoAllow({ autoAllow: opt.value }))}
					class="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-2 disabled:opacity-50 {i <
					autoAllowOptions.length - 1
						? 'border-b border-line-2'
						: ''}"
				>
					<div class="min-w-0">
						<div class="text-sm font-semibold text-fg">{opt.label}</div>
						<div class="mt-0.5 text-xs text-muted">{opt.desc}</div>
					</div>
					{#if data.autoAllow === opt.value}
						<Icon name="check" size={18} stroke={2.4} class="shrink-0 text-accent" />
					{/if}
				</button>
			{/each}
		</div>
	</section>

	<!-- Where permission requests are sent -->
	<section>
		<h2 class={sectionLabel}>Alert me about requests</h2>
		<div class="rounded-card border border-line bg-surface p-4">
			<div class="text-sm font-medium text-fg">Where new permission requests are sent</div>
			<p class="mt-1 mb-3 text-xs text-muted">
				Pick the channels to ping when an app asks for permission (<span class="font-medium text-fg"
					>Off</span
				>
				for none). You can always review and approve them in
				<a href="/apps" class="text-accent hover:underline">Apps</a>.
			</p>
			<ChannelRoutePicker
				value={data.pendingRoute}
				instances={data.channels}
				allowInbox={false}
				disabled={busy['pending']}
				onchange={(route) => run('pending', () => setPendingRoute({ route }))}
			/>
		</div>
	</section>
</div>
