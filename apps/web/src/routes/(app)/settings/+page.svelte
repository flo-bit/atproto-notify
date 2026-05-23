<script lang="ts">
	import type { AlertRoute } from '@atmo/notifs-lexicons';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import IOSToggle from '$lib/components/IOSToggle.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import RouteChip from '$lib/components/RouteChip.svelte';
	import { currentSubscription, pushSupported, subscribe, unsubscribe } from '$lib/push';
	import {
		linkTelegram,
		registerPush,
		renameDevice,
		setAutoAllow,
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

	const TABS = [
		{ id: 'channels', label: 'Channels' },
		{ id: 'routing', label: 'Routing' },
		{ id: 'auto-allow', label: 'Auto-allow' },
		{ id: 'appearance', label: 'Appearance' }
	] as const;
	const initialTab = page.url.searchParams.get('tab') ?? 'channels';
	let tab = $state(TABS.some((t) => t.id === initialTab) ? initialTab : 'channels');

	const autoAllowOptions = [
		{ value: 'all', label: 'All apps', desc: 'Any app that asks is approved automatically.' },
		{
			value: 'trusted',
			label: 'Trusted apps only',
			desc: 'A small built-in allowlist is auto-approved; everything else waits for you.'
		},
		{ value: 'none', label: 'No apps', desc: 'Every request waits for your approval in Apps.' }
	] as const;

	type Theme = 'system' | 'light' | 'dark';
	let theme = $state<Theme>('system');
	const themeOptions = [
		{ value: 'system', label: 'System', desc: 'Match your device appearance.' },
		{ value: 'light', label: 'Light', desc: 'Always use the light theme.' },
		{ value: 'dark', label: 'Dark', desc: 'Always use the dark theme.' }
	] as const;

	function setTheme(value: Theme) {
		theme = value;
		if (value === 'system') {
			localStorage.removeItem('theme');
			delete document.documentElement.dataset.theme;
		} else {
			localStorage.setItem('theme', value);
			document.documentElement.dataset.theme = value;
		}
	}

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

	// The device list comes from the server (data.devices). We only track this
	// browser's own subscription endpoint to mark it as "this device".
	type PushState = 'loading' | 'unsupported' | 'ready';
	let pushState = $state<PushState>('loading');
	let currentEndpoint = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let renameLabel = $state('');

	onMount(async () => {
		const stored = localStorage.getItem('theme');
		theme = stored === 'light' || stored === 'dark' ? stored : 'system';

		if (!pushSupported()) {
			pushState = 'unsupported';
			return;
		}
		try {
			currentEndpoint = (await currentSubscription())?.endpoint ?? null;
		} catch {
			currentEndpoint = null;
		}
		pushState = 'ready';
	});

	async function enablePush() {
		busy['push'] = true;
		errorMsg = '';
		try {
			const sub = await subscribe();
			await registerPush(sub);
			currentEndpoint = sub.endpoint;
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not enable push';
		} finally {
			busy['push'] = false;
		}
	}

	async function disableCurrent() {
		busy['push'] = true;
		errorMsg = '';
		try {
			const endpoint = await unsubscribe();
			if (endpoint) await unregisterPush({ endpoint });
			currentEndpoint = null;
			await invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not disable push';
		} finally {
			busy['push'] = false;
		}
	}

	function startRename(endpoint: string, label: string) {
		renaming = endpoint;
		renameLabel = label;
	}

	async function saveRename(endpoint: string) {
		const label = renameLabel.trim();
		if (!label) {
			renaming = null;
			return;
		}
		await run(`rename:${endpoint}`, () => renameDevice({ endpoint, label }));
		renaming = null;
	}

	const sectionLabel = 'mb-2 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase';
	const card = 'rounded-card border border-line bg-surface p-4';
</script>

<svelte:head><title>Settings · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<header>
		<h1 class="text-2xl font-bold tracking-tight text-fg">Settings</h1>
		<nav class="mt-4 flex gap-1 overflow-x-auto border-b border-line">
			{#each TABS as t (t.id)}
				<button
					type="button"
					onclick={() => (tab = t.id)}
					aria-current={tab === t.id}
					class="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors {tab ===
					t.id
						? 'border-accent text-fg'
						: 'border-transparent text-muted hover:text-fg'}"
				>
					{t.label}
				</button>
			{/each}
		</nav>
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

	{#if tab === 'channels'}
		<p class="mt-6 max-w-2xl text-sm text-muted">
			Where atmo.pub can reach you. Apps and categories route to one or more of these channels —
			everything also lands in your inbox.
		</p>

		<!-- Push devices -->
		<section class="mt-4 max-w-2xl">
			<div class="flex items-center justify-between">
				<h2 class={sectionLabel}>Push devices</h2>
				{#if data.devices.length > 0}
					<span class="font-mono text-[0.7rem] text-muted-2">
						{data.devices.length} device{data.devices.length === 1 ? '' : 's'}
					</span>
				{/if}
			</div>
			<div class={card}>
				<div class="mb-3 flex items-center gap-2.5">
					<RouteChip route="push" size="md" />
					<span class="text-sm font-semibold text-fg">Web push</span>
				</div>

				{#if data.devices.length > 0}
					<ul class="divide-y divide-line-2">
						{#each data.devices as d (d.endpoint)}
							<li class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
								{#if renaming === d.endpoint}
									<input
										class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:border-accent"
										bind:value={renameLabel}
										aria-label="Device name"
										onkeydown={(e) => {
											if (e.key === 'Enter') saveRename(d.endpoint);
											else if (e.key === 'Escape') renaming = null;
										}}
									/>
									<div class="flex shrink-0 items-center gap-3">
										<button
											class="text-xs font-medium text-accent"
											onclick={() => saveRename(d.endpoint)}
										>
											Save
										</button>
										<button class="text-xs font-medium text-muted" onclick={() => (renaming = null)}>
											Cancel
										</button>
									</div>
								{:else}
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="truncate text-sm font-medium text-fg">{d.label}</span>
											{#if d.endpoint === currentEndpoint}
												<span
													class="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.6rem] font-bold tracking-wide text-accent uppercase"
												>
													This device
												</span>
											{/if}
										</div>
										<div class="mt-0.5 font-mono text-[0.65rem] text-muted-2">
											added <RelativeTime date={d.createdAt} />
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-3">
										<button
											class="text-xs font-medium text-muted hover:text-fg"
											onclick={() => startRename(d.endpoint, d.label)}
										>
											Rename
										</button>
										{#if d.endpoint === currentEndpoint}
											<button
												class="text-xs font-medium text-danger hover:underline disabled:opacity-50"
												disabled={busy['push']}
												onclick={disableCurrent}
											>
												Disable
											</button>
										{:else}
											<button
												class="text-xs font-medium text-danger hover:underline disabled:opacity-50"
												disabled={busy[`revoke:${d.endpoint}`]}
												onclick={() =>
													run(`revoke:${d.endpoint}`, () => unregisterPush({ endpoint: d.endpoint }))}
											>
												Revoke
											</button>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if pushState === 'unsupported'}
					<p class="text-xs text-muted">Push isn't available in this browser.</p>
				{:else if pushState === 'ready' && currentEndpoint === null}
					<div class={data.devices.length > 0 ? 'mt-3 border-t border-line-2 pt-3' : ''}>
						{#if data.devices.length === 0}
							<p class="mb-2 text-xs text-muted">
								Get notifications in this browser, even when it's closed.
							</p>
						{/if}
						<button
							class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
							disabled={busy['push']}
							onclick={enablePush}
						>
							{busy['push'] ? 'Enabling…' : 'Enable on this device'}
						</button>
					</div>
				{/if}
			</div>
		</section>

		<!-- Telegram -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Telegram</h2>
			<div class={card}>
				<div class="flex items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-2.5">
						<RouteChip route="telegram" size="md" />
						<span class="text-sm font-semibold text-fg">Telegram DM</span>
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
				{#if telegram}
					<div
						class="mt-3 flex items-center justify-between rounded-md border border-line-2 bg-surface-2 px-3 py-2"
					>
						<div class="min-w-0">
							<div class="truncate font-mono text-xs text-fg">{telegram.displayName ?? 'Linked'}</div>
							<div class="font-mono text-[0.65rem] text-muted-2">
								linked <RelativeTime date={telegram.linkedAt} />
							</div>
						</div>
					</div>
					<div class="mt-3 flex items-start justify-between gap-4 border-t border-line-2 pt-3">
						<label for="notify-pending" class="text-sm text-fg">
							Telegram me about new permission requests
						</label>
						<IOSToggle
							id="notify-pending"
							checked={data.notifyPendingViaTelegram}
							label="Telegram me about new permission requests"
							disabled={busy['setting']}
							onchange={(value) => run('setting', () => setNotifyPending({ value }))}
						/>
					</div>
				{:else}
					<p class="mt-2 text-xs text-muted">Link a Telegram chat to get notifications there.</p>
				{/if}
			</div>
		</section>
	{:else if tab === 'routing'}
		<!-- Default routing -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Default routing</h2>
			<div class={card}>
				<div class="flex items-center justify-between gap-4">
					<div class="min-w-0">
						<div class="text-sm font-medium text-fg">Where notifications go by default</div>
						<p class="mt-1 text-xs text-muted">
							Apps set to “Account default” use this; everything always lands in your inbox. Override
							per-app (and per-category) from
							<a href="/apps" class="text-accent hover:underline">Apps</a>.
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
	{:else if tab === 'auto-allow'}
		<!-- Automatic approval -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Allow apps automatically</h2>
			<p class="mb-2 text-sm text-muted">
				When an app asks to notify you, decide whether it's approved automatically or waits for you
				in Apps.
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
	{:else if tab === 'appearance'}
		<!-- Appearance -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Theme</h2>
			<div class="overflow-hidden rounded-card border border-line bg-surface">
				{#each themeOptions as opt, i (opt.value)}
					<button
						type="button"
						onclick={() => setTheme(opt.value)}
						class="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-2 {i <
						themeOptions.length - 1
							? 'border-b border-line-2'
							: ''}"
					>
						<div class="min-w-0">
							<div class="text-sm font-semibold text-fg">{opt.label}</div>
							<div class="mt-0.5 text-xs text-muted">{opt.desc}</div>
						</div>
						{#if theme === opt.value}
							<Icon name="check" size={18} stroke={2.4} class="shrink-0 text-accent" />
						{/if}
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>
