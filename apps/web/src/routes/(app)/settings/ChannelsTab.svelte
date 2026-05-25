<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import DefaultRoutePrompt from './DefaultRoutePrompt.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import RouteChip from '$lib/components/RouteChip.svelte';
	import {
		currentSubscription,
		iosNeedsInstallForPush,
		pushSupported,
		subscribe,
		unsubscribe
	} from '$lib/push';
	import {
		addWebhook,
		enableDM,
		linkEmail,
		linkTelegram,
		registerPush,
		removeTarget,
		renameTarget,
		sendTest,
		unregisterPush,
		verifyEmail
	} from '$lib/remote/notifs.remote';
	import { channelLabel } from '$lib/routes';
	import { toast } from '$lib/toast.svelte';
	import type { Channel } from '@atmo/notifs-lexicons';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<Record<string, boolean>>({});

	/** Send a test notification to one channel's verified targets. */
	async function testChannel(channel: Channel) {
		busy[`test:${channel}`] = true;
		try {
			const { delivered } = await sendTest({ channel });
			if (delivered > 0) toast.success(`Test sent to ${channelLabel(channel)} — check it.`);
			else toast.info(`No connected ${channelLabel(channel)} target to test yet.`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not send test');
		} finally {
			busy[`test:${channel}`] = false;
		}
	}

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

	// Rename any delivery target (device / chat / email / webhook) inline.
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
		try {
			const label = telegramLabel.trim() || undefined;
			const { deepLink } = await linkTelegram({ label });
			telegramLabel = '';
			window.open(deepLink, '_blank', 'noopener,noreferrer');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not start linking');
		} finally {
			busy['link'] = false;
		}
	}

	// Web push for THIS browser. The device list comes from the server; we track
	// this browser's own subscription endpoint to mark it as "this device".
	type PushState = 'loading' | 'unsupported' | 'ready';
	let pushState = $state<PushState>('loading');
	let currentEndpoint = $state<string | null>(null);
	let deviceName = $state('');
	// iOS Safari tab: push needs the app installed to the Home Screen first.
	let iosNeedsInstall = $state(false);

	const thisDeviceConnected = $derived(
		currentEndpoint !== null && data.devices.some((d) => d.endpoint === currentEndpoint)
	);

	onMount(async () => {
		if (!pushSupported()) {
			iosNeedsInstall = iosNeedsInstallForPush();
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
		try {
			const sub = await subscribe(deviceName.trim() || undefined);
			await registerPush(sub);
			currentEndpoint = sub.endpoint;
			deviceName = '';
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not enable push');
		} finally {
			busy['push'] = false;
		}
	}

	async function disableCurrent() {
		busy['push'] = true;
		try {
			const endpoint = await unsubscribe();
			if (endpoint) await unregisterPush({ endpoint });
			currentEndpoint = null;
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not disable push');
		} finally {
			busy['push'] = false;
		}
	}

	const sectionLabel = 'mb-2 font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase';
	const card = 'rounded-card border border-line bg-surface p-4';
	const rowBtn = 'text-xs font-medium text-muted hover:text-fg';
	const dangerBtn = 'text-xs font-medium text-danger hover:underline disabled:opacity-50';
	const nameInput =
		'min-w-0 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent';
	const addBtn =
		'shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50';
</script>

<!-- A reusable inline-rename row: shows the rename editor for `id`, else `display`. -->
{#snippet renameEditor(id: string, ariaLabel: string)}
	<input
		class="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-fg focus:border-accent"
		bind:value={renameLabel}
		aria-label={ariaLabel}
		onkeydown={(e) => {
			if (e.key === 'Enter') saveRename(id);
			else if (e.key === 'Escape') renaming = null;
		}}
	/>
	<div class="flex shrink-0 items-center gap-3">
		<button class="text-xs font-medium text-accent" onclick={() => saveRename(id)}>Save</button>
		<button class={rowBtn} onclick={() => (renaming = null)}>Cancel</button>
	</div>
{/snippet}

<!-- "Send test" button for a channel's header row (shown only when it has a usable target). -->
{#snippet testButton(channel: Channel, enabled: boolean)}
	{#if enabled}
		<button
			class="ml-auto shrink-0 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
			disabled={busy[`test:${channel}`]}
			onclick={() => testChannel(channel)}
		>
			{busy[`test:${channel}`] ? 'Sending…' : 'Send test'}
		</button>
	{/if}
{/snippet}

<DefaultRoutePrompt defaultRoute={data.defaultRoute} channels={data.channels} />

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
		(so they can show you a routing picker) — but never the email address, phone number, or device behind
		them.
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
			{@render testButton('push', data.devices.length > 0)}
		</div>

		{#if data.devices.length > 0}
			<ul class="divide-y divide-line-2">
				{#each data.devices as d (d.id)}
					<li class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
						{#if renaming === d.id}
							{@render renameEditor(d.id, 'Device name')}
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
								<button class={rowBtn} onclick={() => startRename(d.id, d.label)}>Rename</button>
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
			{#if iosNeedsInstall}
				<div class="rounded-md border border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
					<p class="font-medium text-fg">Add atmo.pub to your Home Screen to enable push</p>
					<p class="mt-1 leading-relaxed">
						On iPhone &amp; iPad, web push only works from an installed app. In Safari, tap
						<span class="inline-flex translate-y-0.5 items-center text-fg"
							><Icon name="share" size={13} /></span
						>
						<span class="font-medium text-fg">Share</span>, then
						<span class="font-medium text-fg">Add to Home Screen</span> — scroll down, or tap
						<span class="font-medium text-fg">More</span> if you don't see it. Then open atmo.pub
						from your Home Screen and turn on push here.
					</p>
				</div>
			{:else}
				<p class="text-xs text-muted">Push isn't available in this browser.</p>
			{/if}
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
							class="{nameInput} sm:w-52"
							onkeydown={(e) => {
								if (e.key === 'Enter') enablePush();
							}}
						/>
					{/if}
					<button class={addBtn} disabled={busy['push']} onclick={enablePush}>
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
			{@render testButton('telegram', data.telegrams.length > 0)}
		</div>

		{#if data.telegrams.length > 0}
			<ul class="mb-3 divide-y divide-line-2">
				{#each data.telegrams as t (t.id)}
					<li class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
						{#if renaming === t.id}
							{@render renameEditor(t.id, 'Chat name')}
						{:else}
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-fg">{t.label}</div>
								<div class="mt-0.5 font-mono text-[0.65rem] text-muted-2">
									linked <RelativeTime date={t.createdAt} />
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-3">
								<button class={rowBtn} onclick={() => startRename(t.id, t.label)}>Rename</button>
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
		{/if}

		<div class={data.telegrams.length > 0 ? 'border-t border-line-2 pt-3' : ''}>
			{#if data.telegrams.length === 0}
				<p class="mb-2 text-xs text-muted">Link a Telegram chat to get notifications there.</p>
			{/if}
			<div class="flex flex-col gap-2 sm:flex-row">
				<input
					bind:value={telegramLabel}
					placeholder="Name (optional)"
					class="{nameInput} sm:w-52"
					onkeydown={(e) => {
						if (e.key === 'Enter') connectTelegram();
					}}
				/>
				<button class={addBtn} disabled={busy['link']} onclick={connectTelegram}>
					{busy['link'] ? 'Opening…' : data.telegrams.length > 0 ? 'Link another' : 'Link'}
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
			{@render testButton('dm', data.dms.length > 0)}
		</div>

		{#if data.dms.length > 0}
			{#each data.dms as dm (dm.id)}
				{#if renaming === dm.id}
					<div class="flex items-center justify-between gap-3">
						{@render renameEditor(dm.id, 'DM name')}
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
			<button class={addBtn} disabled={busy['dm']} onclick={() => run('dm', () => enableDM())}>
				{busy['dm'] ? 'Enabling…' : 'Enable'}
			</button>
		{/if}
	</div>
</section>

<!-- Email (allowlisted — hidden unless the user's DID is whitelisted) -->
{#if data.emailEnabled}
<section class="mt-6 max-w-2xl">
	<h2 class={sectionLabel}>Email</h2>
	<div class={card}>
		<div class="mb-3 flex items-center gap-2.5">
			<RouteChip route="email" size="md" />
			<span class="text-sm font-semibold text-fg">Email</span>
			{@render testButton('email', data.emails.some((e) => e.verified))}
		</div>

		{#if data.emails.length > 0}
			<ul class="mb-3 divide-y divide-line-2">
				{#each data.emails as e (e.id)}
					<li class="py-3 first:pt-0">
						{#if renaming === e.id}
							<div class="flex items-center justify-between gap-3">
								{@render renameEditor(e.id, 'Email name')}
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
									<button class={rowBtn} onclick={() => startRename(e.id, e.label)}>Rename</button>
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
								<div class="mt-0.5 truncate font-mono text-[0.65rem] text-muted-2">{e.address}</div>
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
										class={addBtn}
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
					class="{nameInput} sm:w-40"
					onkeydown={(e) => {
						if (e.key === 'Enter') submitEmail();
					}}
				/>
				<input
					type="email"
					bind:value={emailInput}
					placeholder="you@example.com"
					class="{nameInput} flex-1"
					onkeydown={(e) => {
						if (e.key === 'Enter') submitEmail();
					}}
				/>
				<button class={addBtn} disabled={busy['email']} onclick={submitEmail}>
					{busy['email'] ? 'Sending…' : data.emails.length > 0 ? 'Add' : 'Send code'}
				</button>
			</div>
		</div>
	</div>
</section>
{/if}

<!-- Webhooks -->
<section class="mt-6 max-w-2xl">
	<h2 class={sectionLabel}>Webhooks</h2>
	<div class={card}>
		<div class="mb-3 flex items-center gap-2.5">
			<RouteChip route="webhook" size="md" />
			<span class="text-sm font-semibold text-fg">Webhook</span>
			{@render testButton('webhook', data.webhooks.length > 0)}
		</div>

		{#if data.webhooks.length > 0}
			<ul class="mb-3 divide-y divide-line-2">
				{#each data.webhooks as w (w.id)}
					<li class="py-3 first:pt-0">
						{#if renaming === w.id}
							<div class="flex items-center justify-between gap-3">
								{@render renameEditor(w.id, 'Webhook name')}
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
					class="{nameInput} sm:w-44"
					onkeydown={(e) => {
						if (e.key === 'Enter') submitWebhook();
					}}
				/>
				<input
					type="url"
					inputmode="url"
					bind:value={webhookUrl}
					placeholder="https://example.com/hook"
					class="{nameInput} flex-1"
					onkeydown={(e) => {
						if (e.key === 'Enter') submitWebhook();
					}}
				/>
				<button class={addBtn} disabled={busy['webhook']} onclick={submitWebhook}>
					{busy['webhook'] ? 'Adding…' : 'Add'}
				</button>
			</div>
		</div>
	</div>
</section>
