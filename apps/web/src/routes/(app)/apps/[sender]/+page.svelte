<script lang="ts">
	import type { CategoryRoute } from '@atmo/notifs-lexicons';
	import { invalidateAll } from '$app/navigation';
	import AppMark from '$lib/components/AppMark.svelte';
	import { setRouting } from '$lib/remote/notifs.remote';
	import { CATEGORY_ROUTES, ROUTE_LABELS } from '$lib/routes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let errorMsg = $state('');

	async function changeRoute(category: string, route: CategoryRoute) {
		const sender = data.app?.sender;
		if (!sender) return;
		busy[category] = true;
		errorMsg = '';
		try {
			await setRouting({ sender, category, route });
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not update routing';
		} finally {
			busy[category] = false;
		}
	}
</script>

<svelte:head><title>{data.app?.title ?? 'App'} · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<a href="/apps" class="mb-4 inline-block text-sm font-medium text-muted hover:text-fg">← Apps</a>

	{#if !data.app}
		<div class="rounded-card border border-dashed border-line px-6 py-10 text-center">
			<p class="text-sm font-medium text-fg">App not found</p>
			<p class="mt-1 text-sm text-muted">This app isn't connected.</p>
		</div>
	{:else}
		<header class="flex items-center gap-3 border-b border-line pb-4">
			<AppMark id={data.app.title || data.app.sender} size={44} />
			<div class="min-w-0">
				<h1 class="truncate text-2xl font-bold tracking-tight text-fg">{data.app.title}</h1>
				<div class="truncate font-mono text-xs text-muted-2" title={data.app.sender}>
					{data.app.sender}
				</div>
			</div>
		</header>

		{#if errorMsg}
			<p
				class="mt-4 rounded-card border border-line bg-danger/10 px-3 py-2 text-sm text-danger"
				role="alert"
			>
				{errorMsg}
			</p>
		{/if}

		<section class="mt-6 max-w-2xl">
			<h2 class="mb-1 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Routing</h2>
			<p class="mb-3 text-sm text-muted">
				Choose where each kind of notification goes.
				<span class="font-medium text-fg">Default</span> follows your
				<a href="/settings" class="text-accent hover:underline">default route</a>
				({ROUTE_LABELS[data.defaultRoute]}). Everything is in your inbox regardless.
			</p>

			{#if data.app.categories.length === 0}
				<div class="rounded-card border border-dashed border-line px-6 py-8 text-center">
					<p class="text-sm font-medium text-fg">No categories yet</p>
					<p class="mx-auto mt-1 max-w-sm text-sm text-muted">
						Categories appear here once this app sends notifications.
					</p>
				</div>
			{:else}
				<ul class="overflow-hidden rounded-card border border-line bg-surface">
					{#each data.app.categories as c, i (c.category)}
						<li
							class="flex items-center justify-between gap-3 p-4 {i <
							data.app.categories.length - 1
								? 'border-b border-line-2'
								: ''}"
						>
							<div class="min-w-0">
								<div class="text-sm font-semibold text-fg">{c.category}</div>
								{#if c.description}<div class="text-xs text-muted">{c.description}</div>{/if}
							</div>
							<select
								class="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg disabled:opacity-50"
								value={c.route}
								disabled={busy[c.category]}
								onchange={(e) => changeRoute(c.category, e.currentTarget.value as CategoryRoute)}
							>
								{#each CATEGORY_ROUTES as r (r)}
									<option value={r}>{ROUTE_LABELS[r]}</option>
								{/each}
							</select>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
