<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import SenderCard from '$lib/components/SenderCard.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import {
		approve,
		deny,
		linkTelegram,
		revoke,
		setMuted,
		setNotifyPending,
		unlinkChannel
	} from '$lib/remote/notifs.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let confirming = $state<Record<string, boolean>>({});
	let errorMsg = $state('');

	const telegramChannel = $derived(data.channels.find((c) => c.platform === 'telegram'));

	/** Run a mutation, refresh the page data, and surface errors. */
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

	async function connectTelegram() {
		busy['link'] = true;
		errorMsg = '';
		try {
			const { deepLink } = await linkTelegram();
			window.location.href = deepLink;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not start linking';
			busy['link'] = false;
		}
	}

	const btnBase =
		'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50';
	const btnPrimary = `${btnBase} bg-accent text-accent-fg hover:opacity-90`;
	const btnGhost = `${btnBase} border border-line text-fg hover:bg-surface-2`;
	const btnDanger = `${btnBase} border border-line text-danger hover:bg-surface-2`;
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight text-fg">Dashboard</h1>

{#if errorMsg}
	<p
		class="mt-3 rounded-md border border-line bg-danger/10 px-3 py-2 text-sm text-danger"
		role="alert"
	>
		{errorMsg}
	</p>
{/if}

<div aria-live="polite" class="sr-only">{errorMsg}</div>

<!-- a) Pending requests -->
{#if data.pending.length > 0}
	<section class="mt-8">
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Pending requests</h2>
		<ul class="space-y-3">
			{#each data.pending as p (p.id)}
				<li class="rounded-card border border-line bg-surface p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<SenderCard
							sender={p.sender}
							title={p.title}
							description={p.description}
							iconUrl={p.iconUrl}
							senderHandle={p.senderHandle}
							senderBskyDisplayName={p.senderBskyDisplayName}
							senderBskyAvatar={p.senderBskyAvatar}
						/>
						<RelativeTime date={p.createdAt} class="text-xs whitespace-nowrap text-muted-2" />
					</div>
					<div class="mt-4 flex gap-2">
						<button
							class={btnPrimary}
							disabled={busy[`approve:${p.id}`] || busy[`deny:${p.id}`]}
							onclick={() =>
								run(`approve:${p.id}`, () => approve({ sender: p.sender, requestId: p.id }))}
						>
							Approve
						</button>
						<button
							class={btnGhost}
							disabled={busy[`approve:${p.id}`] || busy[`deny:${p.id}`]}
							onclick={() => run(`deny:${p.id}`, () => deny({ requestId: p.id }))}
						>
							Deny
						</button>
						<a
							class="{btnGhost} ml-auto self-center !border-0 !px-0 text-xs text-muted-2 hover:bg-transparent hover:text-fg"
							href="/dashboard/pending/{p.id}"
						>
							Open ↗
						</a>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<!-- b) Active grants -->
<section class="mt-8">
	<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
		Apps you've authorized
	</h2>
	{#if data.grants.length === 0}
		<EmptyState
			title="No apps yet"
			description="When you approve an app, it shows up here. You can mute or revoke it any time."
		/>
	{:else}
		<ul class="space-y-3">
			{#each data.grants as g (g.sender)}
				<li class="rounded-card border border-line bg-surface p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="flex items-center gap-2">
							<SenderCard
								sender={g.sender}
								title={g.title}
								description={g.description}
								iconUrl={g.iconUrl}
								senderHandle={g.senderHandle}
								senderBskyDisplayName={g.senderBskyDisplayName}
								senderBskyAvatar={g.senderBskyAvatar}
							/>
							{#if g.muted}
								<span class="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted"
									>muted</span
								>
							{/if}
						</div>
						<span class="text-xs whitespace-nowrap text-muted-2">
							authorized <RelativeTime date={g.grantedAt} />
						</span>
					</div>
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							class={btnGhost}
							disabled={busy[`mute:${g.sender}`]}
							onclick={() =>
								run(`mute:${g.sender}`, () => setMuted({ sender: g.sender, muted: !g.muted }))}
						>
							{g.muted ? 'Unmute' : 'Mute'}
						</button>
						{#if confirming[g.sender]}
							<button
								class={btnDanger}
								disabled={busy[`revoke:${g.sender}`]}
								onclick={() =>
									run(`revoke:${g.sender}`, async () => {
										await revoke({ sender: g.sender });
										confirming[g.sender] = false;
									})}
							>
								Confirm revoke
							</button>
							<button class={btnGhost} onclick={() => (confirming[g.sender] = false)}>Cancel</button
							>
						{:else}
							<button class={btnDanger} onclick={() => (confirming[g.sender] = true)}>Revoke</button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<!-- c) Delivery channels -->
<section class="mt-8">
	<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
		Where your notifications go
	</h2>
	{#if data.channels.length === 0}
		<EmptyState
			title="No channels linked"
			description="Connect Telegram to start receiving notifications in chat."
		>
			{#snippet cta()}
				<button class={btnPrimary} disabled={busy['link']} onclick={connectTelegram}>
					{busy['link'] ? 'Opening Telegram…' : '+ Connect Telegram'}
				</button>
			{/snippet}
		</EmptyState>
	{:else}
		<ul class="space-y-3">
			{#each data.channels as channel (channel.deviceId)}
				<li
					class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4"
				>
					<div>
						<div class="text-sm font-medium text-fg capitalize">{channel.platform}</div>
						<div class="text-xs text-muted">
							{#if channel.displayName}{channel.displayName} ·{/if}
							linked <RelativeTime date={channel.linkedAt} />
						</div>
					</div>
					<button
						class={btnGhost}
						disabled={busy[`unlink:${channel.deviceId}`]}
						onclick={() => run(`unlink:${channel.deviceId}`, () => unlinkChannel({ deviceId: channel.deviceId }))}
					>
						Unlink
					</button>
				</li>
			{/each}
		</ul>
		{#if !telegramChannel}
			<button class="{btnPrimary} mt-3" disabled={busy['link']} onclick={connectTelegram}>
				{busy['link'] ? 'Opening Telegram…' : '+ Connect Telegram'}
			</button>
		{/if}
	{/if}
</section>

<!-- d) Settings -->
<section class="mt-8 mb-4">
	<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Settings</h2>
	<div class="rounded-card border border-line bg-surface p-4">
		<div class="flex items-start justify-between gap-4">
			<label for="notify-pending" class="text-sm font-medium text-fg">
				Notify me on Telegram when an app requests permission
			</label>
			<Toggle
				id="notify-pending"
				checked={data.notifyPendingViaTelegram}
				label="Notify me on Telegram when an app requests permission"
				disabled={busy['setting']}
				onchange={(value) => run('setting', () => setNotifyPending({ value }))}
			/>
		</div>
		<p class="mt-2 text-xs text-muted">
			When on, you'll get a Telegram message with Approve/Deny buttons whenever an app asks to
			notify you. When off (the default), permission requests only appear here.
		</p>
	</div>
</section>
