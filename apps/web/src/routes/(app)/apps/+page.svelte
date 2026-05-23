<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AppMark from '$lib/components/AppMark.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import IOSToggle from '$lib/components/IOSToggle.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import { approve, deny, revoke, setMuted } from '$lib/remote/notifs.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let confirming = $state<Record<string, boolean>>({});
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
			{data.grants.length} connected · {data.pending.length} pending
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

	<!-- Pending requests -->
	<section class="mt-6">
		<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
			Pending requests · {data.pending.length}
		</h2>
		{#if data.pending.length === 0}
			<div class="rounded-card border border-dashed border-line px-6 py-8 text-center">
				<p class="text-sm font-medium text-fg">No pending requests</p>
				<p class="mx-auto mt-1 max-w-sm text-sm text-muted">
					When an app asks to notify you, it'll show up here for approval.
				</p>
			</div>
		{:else}
			<ul class="grid gap-3 sm:grid-cols-2">
				{#each data.pending as p (p.id)}
					<li
						class="rounded-card border border-accent bg-surface p-4 ring-3 ring-accent-soft"
					>
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
								onclick={() => run(`approve:${p.id}`, () => approve({ sender: p.sender, requestId: p.id }))}
							>
								Approve
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Your apps (granted) -->
	<section class="mt-8">
		<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">
			Your apps · {data.grants.length}
		</h2>
		{#if data.grants.length === 0}
			<div class="rounded-card border border-dashed border-line px-6 py-10 text-center">
				<p class="text-sm font-medium text-fg">No apps yet</p>
				<p class="mx-auto mt-1 max-w-sm text-sm text-muted">
					When you approve an app, it shows up here. You can mute or revoke it any time.
				</p>
			</div>
		{:else}
			<ul class="overflow-hidden rounded-card border border-line bg-surface">
				{#each data.grants as g, i (g.sender)}
					<li class="p-4 {i < data.grants.length - 1 ? 'border-b border-line-2' : ''}">
						<div class="flex items-start gap-3">
							{#if g.iconUrl ?? g.senderBskyAvatar}
								<img
									src={g.iconUrl ?? g.senderBskyAvatar}
									alt=""
									class="size-10 shrink-0 rounded-[0.6rem] bg-surface-2 object-cover {g.muted
										? 'opacity-60'
										: ''}"
								/>
							{:else}
								<AppMark id={g.title || g.sender} size={40} dim={g.muted} />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span
										class="truncate text-sm font-semibold {g.muted ? 'text-muted' : 'text-fg'}"
									>
										{g.title}
									</span>
									{#if g.muted}
										<span class="text-muted-2"><Icon name="bell-off" size={13} /></span>
									{/if}
								</div>
								<div class="truncate font-mono text-xs text-muted-2" title={g.sender}>
									{g.senderHandle ? `@${g.senderHandle}` : shortDid(g.sender)}
								</div>
								<div class="mt-0.5 text-xs text-muted-2">
									authorized <RelativeTime date={g.grantedAt} />
								</div>
							</div>
							<label class="flex shrink-0 items-center gap-2 text-xs text-muted-2">
								<span>Mute</span>
								<IOSToggle
									checked={g.muted}
									disabled={busy[`mute:${g.sender}`]}
									label="Mute {g.title}"
									onchange={(value) =>
										run(`mute:${g.sender}`, () => setMuted({ sender: g.sender, muted: value }))}
								/>
							</label>
						</div>

						<div class="mt-3 flex items-center justify-between">
							<a
								href={`/apps/${encodeURIComponent(g.sender)}`}
								class="text-sm font-medium text-accent hover:underline"
							>
								Routing →
							</a>
							{#if confirming[g.sender]}
								<div class="flex gap-2">
									<button
										class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2"
										onclick={() => (confirming[g.sender] = false)}
									>
										Cancel
									</button>
									<button
										class="rounded-md border border-danger px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
										disabled={busy[`revoke:${g.sender}`]}
										onclick={() =>
											run(`revoke:${g.sender}`, async () => {
												await revoke({ sender: g.sender });
												confirming[g.sender] = false;
											})}
									>
										Confirm revoke
									</button>
								</div>
							{:else}
								<button
									class="rounded-md px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
									onclick={() => (confirming[g.sender] = true)}
								>
									Revoke
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
