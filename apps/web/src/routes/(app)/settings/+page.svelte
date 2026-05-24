<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import ChannelRoutePicker from '$lib/components/ChannelRoutePicker.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import IOSToggle from '$lib/components/IOSToggle.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import RouteChip from '$lib/components/RouteChip.svelte';
	import { currentSubscription, pushSupported, subscribe, unsubscribe } from '$lib/push';
	import {
		addWebhook,
		enableDM,
		linkEmail,
		linkTelegram,
		registerPush,
		removeTarget,
		renameTarget,
		setAutoAllow,
		setDefaultRoute,
		setNotifyPending,
		unregisterPush,
		verifyEmail
	} from '$lib/remote/notifs.remote';
	import { DOCS_URL } from '$lib/config';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let errorMsg = $state('');

	const TABS = [
		{ id: 'channels', label: 'Channels' },
		{ id: 'routing', label: 'Routing' },
		{ id: 'auto-allow', label: 'Auto-allow' },
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'developer', label: 'Developer docs' }
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

	// Rename any delivery target (device / telegram chat / email) inline.
	let renaming = $state<string | null>(null);
	let renameLabel = $state('');
	function startRename(id: string, label: string) {
		renaming = id;
		renameLabel = label;
	}
	async function saveRename(id: string) {
		const label = renameLabel.trim();
		if (!label) {
			renaming = null;
			return;
		}
		await run(`rename:${id}`, () => renameTarget({ id, label }));
		renaming = null;
	}

	// Email: add a new address (+ optional name) + verify pending ones.
	let emailInput = $state('');
	let emailLabel = $state('');
	let codeInputs = $state<Record<string, string>>({});

	function submitEmail() {
		const address = emailInput.trim();
		const label = emailLabel.trim() || undefined;
		if (address)
			run('email', async () => {
				await linkEmail({ address, label });
				emailInput = '';
				emailLabel = '';
			});
	}

	function submitCode(emailId: string) {
		const code = (codeInputs[emailId] ?? '').trim();
		if (!/^\d{6}$/.test(code)) return;
		run(`email-verify:${emailId}`, async () => {
			const { verified } = await verifyEmail({ code });
			if (!verified) throw new Error('That code is invalid or expired.');
			codeInputs[emailId] = '';
		});
	}

	// Webhook: enter a URL + label; the relay POSTs notifications to it.
	let webhookUrl = $state('');
	let webhookLabel = $state('');

	function submitWebhook() {
		const url = webhookUrl.trim();
		const label = webhookLabel.trim();
		if (!url || !label) return;
		run('webhook', async () => {
			await addWebhook({ url, label });
			webhookUrl = '';
			webhookLabel = '';
		});
	}

	// Telegram: optional name typed before linking, carried through the handshake.
	let telegramLabel = $state('');

	async function connectTelegram() {
		busy['link'] = true;
		errorMsg = '';
		try {
			const label = telegramLabel.trim() || undefined;
			const { deepLink } = await linkTelegram({ label });
			telegramLabel = '';
			// Open Telegram in a new tab so the dashboard stays put; the user comes
			// back and the linked chat shows after the next load/invalidate.
			window.open(deepLink, '_blank', 'noopener,noreferrer');
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not start linking';
		} finally {
			busy['link'] = false;
		}
	}

	// Web push for THIS browser. The device list comes from the server; we track
	// this browser's own subscription endpoint to mark it as "this device".
	type PushState = 'loading' | 'unsupported' | 'ready';
	let pushState = $state<PushState>('loading');
	let currentEndpoint = $state<string | null>(null);
	// Optional name for this device, typed before enabling push.
	let deviceName = $state('');

	// This browser counts as connected only if its live subscription is also known
	// server-side. A browser can hold a stale subscription the server no longer has
	// (e.g. after a DB reset); we surface that as "reconnect" rather than hiding it.
	const thisDeviceConnected = $derived(
		currentEndpoint !== null && data.devices.some((d) => d.endpoint === currentEndpoint)
	);

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
			const sub = await subscribe(deviceName.trim() || undefined);
			await registerPush(sub);
			currentEndpoint = sub.endpoint;
			deviceName = '';
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

	const sectionLabel = 'mb-2 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase';
	const card = 'rounded-card border border-line bg-surface p-4';
	const rowBtn = 'text-xs font-medium text-muted hover:text-fg';
	const dangerBtn = 'text-xs font-medium text-danger hover:underline disabled:opacity-50';
</script>

<svelte:head><title>Settings · atmo.pub</title></svelte:head>

<div class="px-5 py-6 md:px-9 md:py-7">
	<header>
		<h1 class="text-2xl font-bold tracking-tight text-fg">Settings</h1>
		<nav class="mt-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
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
			Where atmo.pub can reach you. You can connect several of each and give them names; apps and
			categories route to one or more of these — everything also lands in your inbox.
		</p>

		<div
			class="mt-4 flex max-w-2xl items-start gap-2.5 rounded-card border border-line bg-surface-2 px-3 py-2.5"
		>
			<Icon name="info" size={16} stroke={2} class="mt-0.5 shrink-0 text-muted-2" />
			<p class="text-xs text-muted">
				Apps you connect can see the <span class="font-medium text-fg">names</span> you give these channels
				(so they can show you a routing picker) — but never the email address, phone number, or device
				behind them.
			</p>
		</div>

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
						{#each data.devices as d (d.id)}
							<li class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
								{#if renaming === d.id}
									<input
										class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:border-accent"
										bind:value={renameLabel}
										aria-label="Device name"
										onkeydown={(e) => {
											if (e.key === 'Enter') saveRename(d.id);
											else if (e.key === 'Escape') renaming = null;
										}}
									/>
									<div class="flex shrink-0 items-center gap-3">
										<button
											class="text-xs font-medium text-accent"
											onclick={() => saveRename(d.id)}
										>
											Save
										</button>
										<button class={rowBtn} onclick={() => (renaming = null)}>Cancel</button>
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
										<button class={rowBtn} onclick={() => startRename(d.id, d.label)}>Rename</button
										>
										{#if d.endpoint === currentEndpoint}
											<button class={dangerBtn} disabled={busy['push']} onclick={disableCurrent}>
												Disable
											</button>
										{:else}
											<button
												class={dangerBtn}
												disabled={busy[`rm:${d.id}`]}
												onclick={() => run(`rm:${d.id}`, () => removeTarget({ id: d.id }))}
											>
												Remove
											</button>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if pushState === 'loading'}
					<p class="text-xs text-muted-2">Checking this browser…</p>
				{:else if pushState === 'unsupported'}
					<p class="text-xs text-muted">Push isn't available in this browser.</p>
				{:else if !thisDeviceConnected}
					{@const reconnect = currentEndpoint !== null}
					<div class={data.devices.length > 0 ? 'mt-3 border-t border-line-2 pt-3' : ''}>
						<p class="mb-2 text-xs text-muted">
							{#if reconnect}
								This browser was subscribed but isn't linked to your account anymore — reconnect it.
							{:else}
								Get notifications in this browser, even when it's closed.
							{/if}
						</p>
						<div class="flex flex-col gap-2 sm:flex-row">
							{#if !reconnect}
								<input
									bind:value={deviceName}
									placeholder="Device name (optional)"
									class="min-w-0 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent sm:w-52"
									onkeydown={(e) => {
										if (e.key === 'Enter') enablePush();
									}}
								/>
							{/if}
							<button
								class="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
								disabled={busy['push']}
								onclick={enablePush}
							>
								{busy['push']
									? 'Enabling…'
									: reconnect
										? 'Reconnect this device'
										: 'Enable on this device'}
							</button>
						</div>
					</div>
				{/if}
			</div>
		</section>

		<!-- Telegram -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Telegram</h2>
			<div class={card}>
				<div class="mb-3 flex items-center gap-2.5">
					<RouteChip route="telegram" size="md" />
					<span class="text-sm font-semibold text-fg">Telegram DM</span>
				</div>

				{#if data.telegrams.length > 0}
					<ul class="mb-3 divide-y divide-line-2">
						{#each data.telegrams as t (t.id)}
							<li class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
								{#if renaming === t.id}
									<input
										class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:border-accent"
										bind:value={renameLabel}
										aria-label="Chat name"
										onkeydown={(e) => {
											if (e.key === 'Enter') saveRename(t.id);
											else if (e.key === 'Escape') renaming = null;
										}}
									/>
									<div class="flex shrink-0 items-center gap-3">
										<button
											class="text-xs font-medium text-accent"
											onclick={() => saveRename(t.id)}
										>
											Save
										</button>
										<button class={rowBtn} onclick={() => (renaming = null)}>Cancel</button>
									</div>
								{:else}
									<div class="min-w-0 flex-1">
										<div class="truncate text-sm font-medium text-fg">{t.label}</div>
										<div class="mt-0.5 font-mono text-[0.65rem] text-muted-2">
											linked <RelativeTime date={t.createdAt} />
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-3">
										<button class={rowBtn} onclick={() => startRename(t.id, t.label)}>Rename</button
										>
										<button
											class={dangerBtn}
											disabled={busy[`rm:${t.id}`]}
											onclick={() => run(`rm:${t.id}`, () => removeTarget({ id: t.id }))}
										>
											Unlink
										</button>
									</div>
								{/if}
							</li>
						{/each}
					</ul>

					<div class="flex items-start justify-between gap-4 border-t border-line-2 pt-3">
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
				{/if}

				<div class={data.telegrams.length > 0 ? 'mt-3 border-t border-line-2 pt-3' : ''}>
					{#if data.telegrams.length === 0}
						<p class="mb-2 text-xs text-muted">Link a Telegram chat to get notifications there.</p>
					{/if}
					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							bind:value={telegramLabel}
							placeholder="Name (optional)"
							class="min-w-0 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent sm:w-52"
							onkeydown={(e) => {
								if (e.key === 'Enter') connectTelegram();
							}}
						/>
						<button
							class="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
							disabled={busy['link']}
							onclick={connectTelegram}
						>
							{busy['link']
								? 'Opening…'
								: data.telegrams.length > 0
									? 'Link another'
									: 'Link'}
						</button>
					</div>
				</div>
			</div>
		</section>

		<!-- Bluesky DM -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Bluesky DM</h2>
			<div class={card}>
				<div class="mb-3 flex items-center gap-2.5">
					<RouteChip route="dm" size="md" />
					<span class="text-sm font-semibold text-fg">Bluesky DM</span>
				</div>

				{#if data.dms.length > 0}
					{#each data.dms as dm (dm.id)}
						{#if renaming === dm.id}
							<div class="flex items-center justify-between gap-3">
								<input
									class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:border-accent"
									bind:value={renameLabel}
									aria-label="DM name"
									onkeydown={(ev) => {
										if (ev.key === 'Enter') saveRename(dm.id);
										else if (ev.key === 'Escape') renaming = null;
									}}
								/>
								<div class="flex shrink-0 items-center gap-3">
									<button class="text-xs font-medium text-accent" onclick={() => saveRename(dm.id)}>
										Save
									</button>
									<button class={rowBtn} onclick={() => (renaming = null)}>Cancel</button>
								</div>
							</div>
						{:else}
							<div class="flex items-center justify-between gap-3">
								<div class="flex min-w-0 items-center gap-2">
									<Icon name="check" size={16} stroke={2.4} class="shrink-0 text-accent" />
									<span class="truncate text-sm font-medium text-fg">{dm.label}</span>
								</div>
								<div class="flex shrink-0 items-center gap-3">
									<button class={rowBtn} onclick={() => startRename(dm.id, dm.label)}>Rename</button>
									<button
										class={dangerBtn}
										disabled={busy[`rm:${dm.id}`]}
										onclick={() => run(`rm:${dm.id}`, () => removeTarget({ id: dm.id }))}
									>
										Disable
									</button>
								</div>
							</div>
							<p class="mt-2 text-xs text-muted-2">
								The atmo.pub bot will DM you on Bluesky. Make sure your Bluesky chat settings allow
								messages from it.
							</p>
						{/if}
					{/each}
				{:else}
					<p class="mb-2 text-xs text-muted">
						Get notifications as a Bluesky direct message from the atmo.pub bot.
					</p>
					<button
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
						disabled={busy['dm']}
						onclick={() => run('dm', () => enableDM())}
					>
						{busy['dm'] ? 'Enabling…' : 'Enable'}
					</button>
				{/if}
			</div>
		</section>

		<!-- Email -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Email</h2>
			<div class={card}>
				<div class="mb-3 flex items-center gap-2.5">
					<RouteChip route="email" size="md" />
					<span class="text-sm font-semibold text-fg">Email</span>
				</div>

				{#if data.emails.length > 0}
					<ul class="mb-3 divide-y divide-line-2">
						{#each data.emails as e (e.id)}
							<li class="py-3 first:pt-0">
								{#if renaming === e.id}
									<div class="flex items-center justify-between gap-3">
										<input
											class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:border-accent"
											bind:value={renameLabel}
											aria-label="Email name"
											onkeydown={(ev) => {
												if (ev.key === 'Enter') saveRename(e.id);
												else if (ev.key === 'Escape') renaming = null;
											}}
										/>
										<div class="flex shrink-0 items-center gap-3">
											<button
												class="text-xs font-medium text-accent"
												onclick={() => saveRename(e.id)}
											>
												Save
											</button>
											<button class={rowBtn} onclick={() => (renaming = null)}>Cancel</button>
										</div>
									</div>
								{:else}
									<div class="flex items-center justify-between gap-3">
										<div class="flex min-w-0 items-center gap-2">
											{#if e.verified}
												<Icon name="check" size={16} stroke={2.4} class="shrink-0 text-accent" />
											{/if}
											<span class="truncate text-sm font-medium text-fg">{e.label}</span>
										</div>
										<div class="flex shrink-0 items-center gap-3">
											<button class={rowBtn} onclick={() => startRename(e.id, e.label)}
												>Rename</button
											>
											<button
												class={dangerBtn}
												disabled={busy[`rm:${e.id}`]}
												onclick={() => run(`rm:${e.id}`, () => removeTarget({ id: e.id }))}
											>
												Remove
											</button>
										</div>
									</div>
									{#if e.label !== e.address}
										<div class="mt-0.5 truncate font-mono text-[0.65rem] text-muted-2">
											{e.address}
										</div>
									{/if}
									{#if !e.verified}
										<div class="mt-1 text-xs text-warn">
											Pending — enter the 6-digit code we emailed you.
										</div>
										<div class="mt-2 flex gap-2">
											<input
												inputmode="numeric"
												maxlength="6"
												bind:value={codeInputs[e.id]}
												placeholder="123456"
												class="w-28 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm tracking-widest text-fg placeholder:text-muted-2 focus:border-accent"
											/>
											<button
												class="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
												disabled={busy[`email-verify:${e.id}`]}
												onclick={() => submitCode(e.id)}
											>
												{busy[`email-verify:${e.id}`] ? 'Verifying…' : 'Verify'}
											</button>
										</div>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				<div class={data.emails.length > 0 ? 'border-t border-line-2 pt-3' : ''}>
					{#if data.emails.length === 0}
						<p class="mb-2 text-xs text-muted">Get notifications by email.</p>
					{/if}
					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							bind:value={emailLabel}
							placeholder="Name (optional)"
							class="min-w-0 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent sm:w-40"
							onkeydown={(e) => {
								if (e.key === 'Enter') submitEmail();
							}}
						/>
						<input
							type="email"
							bind:value={emailInput}
							placeholder="you@example.com"
							class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent"
							onkeydown={(e) => {
								if (e.key === 'Enter') submitEmail();
							}}
						/>
						<button
							class="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
							disabled={busy['email']}
							onclick={submitEmail}
						>
							{busy['email'] ? 'Sending…' : data.emails.length > 0 ? 'Add' : 'Send code'}
						</button>
					</div>
				</div>
			</div>
		</section>

		<!-- Webhooks -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Webhooks</h2>
			<div class={card}>
				<div class="mb-3 flex items-center gap-2.5">
					<RouteChip route="webhook" size="md" />
					<span class="text-sm font-semibold text-fg">Webhook</span>
				</div>

				{#if data.webhooks.length > 0}
					<ul class="mb-3 divide-y divide-line-2">
						{#each data.webhooks as w (w.id)}
							<li class="py-3 first:pt-0">
								{#if renaming === w.id}
									<div class="flex items-center justify-between gap-3">
										<input
											class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:border-accent"
											bind:value={renameLabel}
											aria-label="Webhook name"
											onkeydown={(ev) => {
												if (ev.key === 'Enter') saveRename(w.id);
												else if (ev.key === 'Escape') renaming = null;
											}}
										/>
										<div class="flex shrink-0 items-center gap-3">
											<button class="text-xs font-medium text-accent" onclick={() => saveRename(w.id)}>
												Save
											</button>
											<button class={rowBtn} onclick={() => (renaming = null)}>Cancel</button>
										</div>
									</div>
								{:else}
									<div class="flex items-center justify-between gap-3">
										<span class="truncate text-sm font-medium text-fg">{w.label}</span>
										<div class="flex shrink-0 items-center gap-3">
											<button class={rowBtn} onclick={() => startRename(w.id, w.label)}>Rename</button>
											<button
												class={dangerBtn}
												disabled={busy[`rm:${w.id}`]}
												onclick={() => run(`rm:${w.id}`, () => removeTarget({ id: w.id }))}
											>
												Remove
											</button>
										</div>
									</div>
									<div class="mt-0.5 truncate font-mono text-[0.65rem] text-muted-2">{w.url}</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				<div class={data.webhooks.length > 0 ? 'border-t border-line-2 pt-3' : ''}>
					{#if data.webhooks.length === 0}
						<p class="mb-2 text-xs text-muted">
							Send notifications to your own server. We POST JSON ({'{'} title, body, uri, sender, sentAt
							{'}'}) to the URL over HTTPS.
						</p>
					{/if}
					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							bind:value={webhookLabel}
							placeholder="Label (e.g. My server)"
							class="min-w-0 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent sm:w-44"
							onkeydown={(e) => {
								if (e.key === 'Enter') submitWebhook();
							}}
						/>
						<input
							type="url"
							inputmode="url"
							bind:value={webhookUrl}
							placeholder="https://example.com/hook"
							class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent"
							onkeydown={(e) => {
								if (e.key === 'Enter') submitWebhook();
							}}
						/>
						<button
							class="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
							disabled={busy['webhook']}
							onclick={submitWebhook}
						>
							{busy['webhook'] ? 'Adding…' : 'Add'}
						</button>
					</div>
				</div>
			</div>
		</section>
	{:else if tab === 'routing'}
		<!-- Default routing -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Default routing</h2>
			<div class={card}>
				<div class="text-sm font-medium text-fg">Where notifications go by default</div>
				<p class="mt-1 text-xs text-muted">
					Pick where notifications go by default. <span class="font-medium text-fg">Inbox only</span
					>
					saves them with no alerts; <span class="font-medium text-fg">Off</span> drops them
					entirely. Apps set to “Account default” use this; override per-app (and per-category) from
					<a href="/apps" class="text-accent hover:underline">Apps</a>.
				</p>
				<div class="mt-3">
					<ChannelRoutePicker
						value={data.defaultRoute}
						instances={data.channels}
						disabled={busy['defaultRoute']}
						onchange={(route) => run('defaultRoute', () => setDefaultRoute({ route }))}
					/>
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
	{:else if tab === 'developer'}
		<!-- Developer docs -->
		<section class="mt-6 max-w-2xl">
			<h2 class={sectionLabel}>Developer docs</h2>
			<div class={card}>
				<p class="text-sm text-muted">
					Building an app? Send notifications through atmo.pub — request permission, send, and let
					users manage routing — over a small XRPC API. The full guide, with code, lives on the docs
					site.
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
	{/if}
</div>
