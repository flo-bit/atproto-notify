<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AppMark from '$lib/components/AppMark.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import { approve, deny } from '$lib/remote/notifs.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let errorMsg = $state('');

	/** Run a mutation, refresh page data, and surface errors. */
	async function run(key: string, fn: () => Promise<unknown>) {
		busy[key] = true;
		errorMsg = '';
		try {
			await fn();
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Something went wrong';
		} finally {
			busy[key] = false;
		}
	}

	function shortDid(did: string) {
		return did.length > 32 ? `${did.slice(0, 20)}…${did.slice(-6)}` : did;
	}
</script>

<svelte:head><title>Apps · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<header class="border-b border-line pb-4">
		<h1 class="text-2xl font-bold tracking-tight text-fg">Apps</h1>
		<p class="mt-1 text-sm text-muted">
			{data.grants.length} connected{#if data.pending.length > 0}
				· {data.pending.length} pending{/if}
		</p>
	</header>

	{#if errorMsg}
		<p
			class="mt-4 rounded-card border border-line bg-danger/10 px-3 py-2 text-sm text-danger"
			role="alert"
		>
			{errorMsg}
		</p>
	{/if}
	<div aria-live="polite" class="sr-only">{errorMsg}</div>

	<!-- Pending requests (hidden when there are none) -->
	{#if data.pending.length > 0}
		<section class="mt-6">
			<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
				Pending requests · {data.pending.length}
			</h2>
			<ul class="grid gap-3 sm:grid-cols-2">
				{#each data.pending as p (p.id)}
					<li class="rounded-card border border-accent bg-surface p-4 ring-3 ring-accent-soft">
						<div class="flex items-start gap-3">
							{#if p.iconUrl ?? p.senderBskyAvatar}
								<img
									src={p.iconUrl ?? p.senderBskyAvatar}
									alt=""
									class="size-10 shrink-0 rounded-[0.6rem] bg-surface-2 object-cover"
								/>
							{:else}
								<AppMark id={p.title || p.sender} size={40} />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<span class="truncate text-sm font-semibold text-fg">{p.title}</span>
									<span
										class="font-mono text-[0.6rem] font-bold tracking-wide text-accent uppercase"
									>
										requesting
									</span>
								</div>
								<div class="truncate font-mono text-xs text-muted-2" title={p.sender}>
									{shortDid(p.sender)}
								</div>
							</div>
							<RelativeTime date={p.createdAt} class="text-xs whitespace-nowrap text-muted-2" />
						</div>

						{#if p.description}
							<p class="mt-3 text-sm leading-relaxed text-muted">{p.description}</p>
						{/if}

						{#if p.senderHandle}
							<p class="mt-2 flex items-center gap-1 text-xs text-muted-2">
								<span class="text-success"><Icon name="check" size={12} stroke={2.5} /></span>
								Verified on Bluesky: @{p.senderHandle}
							</p>
						{/if}

						<div class="mt-4 flex gap-2">
							<button
								class="flex-1 rounded-md border border-line px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
								disabled={busy[`approve:${p.id}`] || busy[`deny:${p.id}`]}
								onclick={() => run(`deny:${p.id}`, () => deny({ requestId: p.id }))}
							>
								Deny
							</button>
							<button
								class="flex-[1.2] rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
								disabled={busy[`approve:${p.id}`] || busy[`deny:${p.id}`]}
								onclick={() =>
									run(`approve:${p.id}`, () => approve({ sender: p.sender, requestId: p.id }))}
							>
								Approve
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Your apps (granted) -->
	<section class="mt-8">
		<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
			Your apps · {data.grants.length}
		</h2>
		{#if data.grants.length === 0}
			<div class="rounded-card border border-dashed border-line px-6 py-10 text-center">
				<p class="text-sm font-medium text-fg">No apps yet</p>
				<p class="mx-auto mt-1 max-w-sm text-sm text-muted">
					When you approve an app, it shows up here. Tap one to manage its routing, mute, or revoke
					it.
				</p>
			</div>
		{:else}
			<ul class="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
				{#each data.grants as g (g.sender)}
					<li>
						<a
							href={`/apps/${encodeURIComponent(g.sender)}`}
							class="flex flex-col items-center gap-2 rounded-card p-3 text-center transition-colors hover:bg-surface-2"
							title={g.title}
						>
							{#if g.iconUrl ?? g.senderBskyAvatar}
								<img
									src={g.iconUrl ?? g.senderBskyAvatar}
									alt=""
									class="size-14 rounded-[0.9rem] bg-surface-2 object-cover {g.muted
										? 'opacity-50'
										: ''}"
								/>
							{:else}
								<AppMark id={g.title || g.sender} size={56} dim={g.muted} />
							{/if}
							<span class="line-clamp-2 w-full text-xs font-medium text-fg">{g.title}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Apps you can enable (hardcoded catalog) -->
	{#if data.discover.length > 0}
		<section class="mt-8">
			<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
				Apps you can enable · {data.discover.length}
			</h2>
			<ul class="overflow-hidden rounded-card border border-line bg-surface">
				{#each data.discover as app, i (app.did)}
					<li class="p-4 {i < data.discover.length - 1 ? 'border-b border-line-2' : ''}">
						<div class="flex items-start gap-3">
							{#if app.iconUrl}
								<img
									src={app.iconUrl}
									alt=""
									class="size-10 shrink-0 rounded-[0.6rem] bg-surface-2 object-cover"
								/>
							{:else}
								<AppMark id={app.title || app.did} size={40} />
							{/if}
							<div class="min-w-0 flex-1">
								<span class="truncate text-sm font-semibold text-fg">{app.title}</span>
								<div class="truncate font-mono text-xs text-muted-2" title={app.did}>
									{shortDid(app.did)}
								</div>
								{#if app.description}
									<p class="mt-1 text-sm leading-relaxed text-muted">{app.description}</p>
								{/if}
							</div>
							<button
								class="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
								disabled={busy[`enable:${app.did}`]}
								onclick={() => run(`enable:${app.did}`, () => approve({ sender: app.did }))}
							>
								{busy[`enable:${app.did}`] ? 'Enabling…' : 'Enable'}
							</button>
						</div>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-xs text-muted-2">
				Enabling notifies the app directly — you don't need to visit it first.
			</p>
		</section>
	{/if}
</div>
