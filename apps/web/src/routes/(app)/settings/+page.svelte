<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import IOSToggle from '$lib/components/IOSToggle.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import type { AlertRoute } from '@atmo/notifs-lexicons';
	import { currentSubscription, pushSupported, subscribe, unsubscribe } from '$lib/push';
	import {
		linkTelegram,
		registerPush,
		setDefaultRoute,
		setNotifyPending,
		unlinkTelegram,
		unregisterPush
	} from '$lib/remote/notifs.remote';
	import { ALERT_ROUTES, ROUTE_LABELS } from '$lib/routes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let errorMsg = $state('');

	const telegram = $derived(data.channels.find((c) => c.platform === 'telegram'));

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

	// Web push is per-browser: check this device's subscription on mount.
	type PushState = 'loading' | 'unsupported' | 'on' | 'off';
	let pushState = $state<PushState>('loading');

	onMount(async () => {
		if (!pushSupported()) {
			pushState = 'unsupported';
			return;
		}
		try {
			pushState = (await currentSubscription()) ? 'on' : 'off';
		} catch {
			pushState = 'off';
		}
	});

	async function enablePush() {
		busy['push'] = true;
		errorMsg = '';
		try {
			await registerPush(await subscribe());
			pushState = 'on';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not enable push';
		} finally {
			busy['push'] = false;
		}
	}

	async function disablePush() {
		busy['push'] = true;
		errorMsg = '';
		try {
			const endpoint = await unsubscribe();
			if (endpoint) await unregisterPush({ endpoint });
			pushState = 'off';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not disable push';
		} finally {
			busy['push'] = false;
		}
	}
</script>

<svelte:head><title>Settings · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<header class="border-b border-line pb-4">
		<h1 class="text-2xl font-bold tracking-tight text-fg">Settings</h1>
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

	<!-- Channels -->
	<section class="mt-6 max-w-2xl">
		<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Channels</h2>
		<div class="overflow-hidden rounded-card border border-line bg-surface">
			<!-- Telegram -->
			<div class="flex items-center gap-3 border-b border-line-2 p-4">
				<div
					class="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
					aria-hidden="true"
				>
					<Icon name="tg" size={20} />
				</div>
				<div class="min-w-0 flex-1">
					<div class="text-sm font-semibold text-fg">Telegram</div>
					{#if telegram}
						<div class="truncate font-mono text-xs text-muted-2">
							{#if telegram.displayName}{telegram.displayName} · {/if}linked
							<RelativeTime date={telegram.linkedAt} />
						</div>
					{:else}
						<div class="text-xs text-muted">Get notifications in a Telegram chat.</div>
					{/if}
				</div>
				{#if telegram}
					<button
						class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
						disabled={busy['unlink']}
						onclick={() => run('unlink', () => unlinkTelegram())}
					>
						Unlink
					</button>
				{:else}
					<button
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
						disabled={busy['link']}
						onclick={connectTelegram}
					>
						{busy['link'] ? 'Opening…' : 'Link'}
					</button>
				{/if}
			</div>

			<!-- Push -->
			<div class="flex items-center gap-3 p-4" class:opacity-60={pushState === 'unsupported'}>
				<div
					class="grid size-10 shrink-0 place-items-center rounded-full {pushState === 'on'
						? 'bg-accent-soft text-accent'
						: 'bg-surface-2 text-muted'}"
					aria-hidden="true"
				>
					<Icon name="push" size={20} />
				</div>
				<div class="min-w-0 flex-1">
					<div class="text-sm font-semibold text-fg">Push</div>
					<div class="text-xs text-muted">
						{#if pushState === 'unsupported'}
							Not available in this browser.
						{:else if pushState === 'on'}
							Enabled on this device.
						{:else}
							Get notifications in this browser, even when it's closed.
						{/if}
					</div>
				</div>
				{#if pushState === 'on'}
					<button
						class="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
						disabled={busy['push']}
						onclick={disablePush}
					>
						{busy['push'] ? '…' : 'Disable'}
					</button>
				{:else if pushState === 'off'}
					<button
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
						disabled={busy['push']}
						onclick={enablePush}
					>
						{busy['push'] ? 'Enabling…' : 'Enable'}
					</button>
				{:else if pushState === 'loading'}
					<span class="font-mono text-xs text-muted-2">…</span>
				{:else}
					<span class="font-mono text-xs text-muted-2">Unavailable</span>
				{/if}
			</div>
		</div>
	</section>

	<!-- Notifications -->
	<section class="mt-8 max-w-2xl">
		<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Notifications</h2>
		<div class="rounded-card border border-line bg-surface p-4">
			<div class="flex items-start justify-between gap-4">
				<label for="notify-pending" class="text-sm font-medium text-fg">
					Notify me on Telegram about new permission requests
				</label>
				<IOSToggle
					id="notify-pending"
					checked={data.notifyPendingViaTelegram}
					label="Notify me on Telegram about new permission requests"
					disabled={busy['setting']}
					onchange={(value) => run('setting', () => setNotifyPending({ value }))}
				/>
			</div>
			<p class="mt-2 text-xs text-muted">
				When on, you'll get a Telegram message with Approve/Deny buttons whenever an app asks to
				notify you. When off (the default), permission requests only appear in Apps.
			</p>
		</div>
	</section>

	<!-- Default routing -->
	<section class="mt-8 max-w-2xl">
		<h2 class="mb-3 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase">Default routing</h2>
		<div class="rounded-card border border-line bg-surface p-4">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<div class="text-sm font-medium text-fg">Where notifications go by default</div>
					<p class="mt-1 text-xs text-muted">
						Apps and categories set to “Default” use this. Everything always lands in your inbox.
					</p>
				</div>
				<select
					class="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg disabled:opacity-50"
					value={data.defaultRoute}
					disabled={busy['defaultRoute']}
					onchange={(e) =>
						run('defaultRoute', () =>
							setDefaultRoute({ route: e.currentTarget.value as AlertRoute })
						)}
				>
					{#each ALERT_ROUTES as r (r)}
						<option value={r}>{ROUTE_LABELS[r]}</option>
					{/each}
				</select>
			</div>
		</div>
	</section>
</div>
