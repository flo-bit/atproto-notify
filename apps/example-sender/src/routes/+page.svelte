<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { oauthLogin, oauthLogout } from '$lib/atproto/oauth.remote';
	import RoutePicker from '$lib/components/RoutePicker.svelte';
	import {
		APP_DESCRIPTION,
		APP_TITLE,
		DASHBOARD_ORIGIN,
		DEMO_CATEGORIES,
		GITHUB_URL,
		PROJECT_NAME,
		SENDER_DID
	} from '$lib/config';
	import {
		connect,
		markAllRead,
		openInAtmo,
		sendTest,
		setAppRoute,
		setCategoryRoute,
		type SendResult
	} from '$lib/relay.remote';
	import { routeLabel } from '$lib/routes';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let busy = $state<Record<string, boolean>>({});
	let errorMsg = $state('');

	// Remote-command errors arrive as { body: { message } }, not Error instances.
	function errMsg(err: unknown, fallback: string): string {
		const e = err as { body?: { message?: string }; message?: string };
		return e?.body?.message ?? e?.message ?? fallback;
	}

	/** Run a mutation, refresh server data, surface errors. */
	async function run(key: string, fn: () => Promise<unknown>) {
		busy[key] = true;
		errorMsg = '';
		try {
			await fn();
			await invalidateAll();
		} catch (err) {
			errorMsg = errMsg(err, 'Something went wrong');
		} finally {
			busy[key] = false;
		}
	}

	// --- sign in / out -----------------------------------------------------
	let handle = $state('');
	let authBusy = $state(false);
	let authError = $state('');

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		const value = handle.trim();
		if (!value) return;
		authBusy = true;
		authError = '';
		try {
			const { url } = await oauthLogin({ handle: value, returnTo: '/' });
			window.location.href = url;
		} catch (err) {
			authError = errMsg(err, 'Sign-in failed');
			authBusy = false;
		}
	}

	async function signOut() {
		await oauthLogout();
		window.location.href = '/';
	}

	// --- connect (request permission) -------------------------------------
	let pendingApproval = $state(false);

	async function connectApp() {
		busy['connect'] = true;
		errorMsg = '';
		try {
			const { status } = await connect();
			if (status === 'alreadyGranted') await invalidateAll();
			else pendingApproval = true;
		} catch (err) {
			errorMsg = errMsg(err, 'Could not start connecting');
		} finally {
			busy['connect'] = false;
		}
	}

	// --- cross-app login: open atmo.pub already signed in ------------------
	async function openAtmo(redirect: string, key: string) {
		busy[key] = true;
		errorMsg = '';
		// Open synchronously on the click so the browser keeps the user gesture
		// (no popup blocker), then point the tab at the minted link.
		const w = window.open('about:blank');
		try {
			const { url } = await openInAtmo({ redirect });
			if (w) w.location.href = url;
			else window.location.href = url;
		} catch (err) {
			w?.close();
			errorMsg = errMsg(err, 'Failed to open atmo.pub');
		} finally {
			busy[key] = false;
		}
	}

	// --- send a test ------------------------------------------------------
	let title = $state('');
	let body = $state('');
	let testCategory = $state('');
	let sendResult = $state<SendResult | null>(null);

	async function send(event: SubmitEvent) {
		event.preventDefault();
		busy['send'] = true;
		errorMsg = '';
		sendResult = null;
		try {
			sendResult = await sendTest({ title, body, category: testCategory || undefined });
			await invalidateAll();
		} catch (err) {
			errorMsg = errMsg(err, 'Send failed');
		} finally {
			busy['send'] = false;
		}
	}

	const noTargets = $derived(data.connected && (data.routing?.targets.length ?? 0) === 0);
	// Distinct channel types the user actually has a target for (for the pickers).
	const availableTypes = $derived([...new Set((data.routing?.targets ?? []).map((t) => t.type))]);

	const card = 'rounded-card border border-line bg-surface p-5';
	const btnPrimary =
		'rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50';
	const btnGhost =
		'rounded-md border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 disabled:opacity-50';
	const inputCls =
		'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted-2 focus:border-accent';
	const noticeOk = 'mt-3 rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-fg';
	const noticeWarn = 'mt-3 rounded-md border border-line px-3 py-2 text-sm text-warn';
</script>

<svelte:head><title>{PROJECT_NAME}</title></svelte:head>

<main class="mx-auto w-full max-w-[640px] space-y-6 px-4 py-10">
	<header>
		<h1 class="text-2xl font-semibold tracking-tight text-fg">{APP_TITLE}</h1>
		<p class="mt-3 max-w-prose text-sm leading-relaxed text-muted">
			{APP_DESCRIPTION} A demo of how any AT&nbsp;Protocol app integrates with atmo.pub: connect,
			let the user route notifications per category, and send.
		</p>

		{#if data.did}
			<div class="mt-4 flex flex-wrap items-center gap-3 text-sm">
				<span class="text-muted">
					Signed in as
					<span class="font-medium text-fg">{data.handle ? `@${data.handle}` : data.did}</span>
				</span>
				<button onclick={signOut} class={btnGhost}>Sign out</button>
			</div>
		{:else}
			<form onsubmit={signIn} class="mt-5 flex max-w-sm flex-col gap-2 sm:flex-row">
				<input
					bind:value={handle}
					placeholder="you.bsky.social"
					autocomplete="off"
					autocapitalize="none"
					autocorrect="off"
					spellcheck="false"
					data-1p-ignore
					data-lpignore="true"
					required
					class={inputCls}
				/>
				<button type="submit" disabled={authBusy} class="{btnPrimary} whitespace-nowrap">
					{authBusy ? 'Redirecting…' : 'Sign in'}
				</button>
			</form>
			{#if authError}<p class="mt-2 text-sm text-danger" role="alert">{authError}</p>{/if}
		{/if}
	</header>

	{#if errorMsg}
		<p class="rounded-card border border-line bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
			{errorMsg}
		</p>
	{/if}

	{#if data.did}
		<!-- Connection status -->
		<section class={card}>
			{#if data.connected}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-2 text-sm font-medium text-fg">
						<span
							class="flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg
							>
						</span>
						Connected to atmo.pub
					</div>
					<button
						class={btnGhost}
						disabled={busy['manage']}
						onclick={() => openAtmo(`/apps/${SENDER_DID}`, 'manage')}
					>
						{busy['manage'] ? 'Opening…' : 'Manage in atmo.pub ↗'}
					</button>
				</div>
			{:else}
				<h2 class="text-base font-semibold text-fg">Connect to atmo.pub</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted">
					Ask for permission to send <span class="font-medium text-fg">{APP_TITLE}</span>
					notifications. You approve it once in atmo.pub, then choose how they reach you.
				</p>
				{#if !pendingApproval}
					<button onclick={connectApp} disabled={busy['connect']} class="{btnPrimary} mt-4">
						{busy['connect'] ? 'Requesting…' : 'Connect to atmo.pub'}
					</button>
				{:else}
					<p class={noticeOk}>✓ Request sent — approve it in atmo.pub, then come back.</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							class={btnPrimary}
							disabled={busy['approve']}
							onclick={() => openAtmo('/apps', 'approve')}
						>
							{busy['approve'] ? 'Opening…' : 'Allow app in atmo.pub ↗'}
						</button>
						<button class={btnGhost} disabled={busy['recheck']} onclick={() => run('recheck', async () => {})}>
							{busy['recheck'] ? 'Checking…' : "I've approved — refresh"}
						</button>
					</div>
				{/if}
			{/if}
		</section>

		{#if data.connected && data.routing}
			{#if noTargets}
				<!-- No delivery channels: route changes wouldn't go anywhere yet. -->
				<section class={card}>
					<h2 class="text-base font-semibold text-fg">Set up where notifications go</h2>
					<p class="mt-2 text-sm leading-relaxed text-muted">
						You haven't connected any delivery channels yet (push, Telegram, email, …). Add one in
						atmo.pub, then come back to route this app's notifications.
					</p>
					<button
						class="{btnPrimary} mt-4"
						disabled={busy['settings']}
						onclick={() => openAtmo('/settings?tab=channels', 'settings')}
					>
						{busy['settings'] ? 'Opening…' : 'Set up channels in atmo.pub ↗'}
					</button>
				</section>
			{:else}
				<!-- App-wide routing -->
				<section class={card}>
					<h2 class="text-base font-semibold text-fg">App defaults</h2>
					<p class="mt-2 text-sm leading-relaxed text-muted">
						Where everything from {APP_TITLE} goes.
						<span class="font-medium text-fg">Account default</span> follows your atmo.pub default ({routeLabel(
							data.routing.defaultRoute
						)}).
					</p>
					<div class="mt-3">
						<RoutePicker
							value={data.routing.route}
							inherit={{ token: 'default', label: 'Account default' }}
							available={availableTypes}
							disabled={busy['__app']}
							onchange={(route) => run('__app', () => setAppRoute({ route }))}
						/>
					</div>
				</section>

				<!-- Per-category routing -->
				<section class={card}>
					<h2 class="text-base font-semibold text-fg">Categories</h2>
					<p class="mt-2 text-sm leading-relaxed text-muted">
						This app declares the kinds of notifications it sends. Route each one separately, or let
						it follow the app default.
					</p>
					{#if data.categoriesError}
						<p class={noticeWarn}>
							⚠ Couldn't declare categories: {data.categoriesError}. If this mentions a permission
							or token, sign out and back in to refresh this app's access.
						</p>
					{/if}
					<ul class="mt-4 space-y-5">
						{#each data.routing.categories as c (c.id)}
							<li class="border-t border-line pt-4 first:border-t-0 first:pt-0">
								<div class="text-sm font-medium text-fg">{c.title ?? c.id}</div>
								{#if c.description}<div class="text-xs text-muted">{c.description}</div>{/if}
								<div class="mt-2">
									<RoutePicker
										value={c.route}
										inherit={{ token: 'app', label: 'App default' }}
										available={availableTypes}
										disabled={busy[c.id]}
										onchange={(route) => run(c.id, () => setCategoryRoute({ id: c.id, route }))}
									/>
								</div>
							</li>
						{:else}
							<li class="text-sm text-muted-2">No categories declared yet.</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Debug: send a test notification -->
			<section class={card}>
				<h2 class="text-base font-semibold text-fg">Send a test notification</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted">
					Debug tool — calls <code class="font-mono text-fg">send</code> with this app's own key. Pick
					a category to test per-category routing.
				</p>
				<form onsubmit={send} class="mt-4 space-y-2">
					<input bind:value={title} placeholder="Title" class={inputCls} />
					<input bind:value={body} placeholder="Body" class={inputCls} />
					<select bind:value={testCategory} class={inputCls}>
						<option value="">General (no category)</option>
						{#each DEMO_CATEGORIES as c (c.id)}
							<option value={c.id}>{c.title}</option>
						{/each}
					</select>
					<button type="submit" disabled={busy['send']} class={btnPrimary}>
						{busy['send'] ? 'Sending…' : 'Send test notification'}
					</button>
				</form>
				{#if sendResult}
					{#if sendResult.ok && sendResult.delivered > 0}
						<p class={noticeOk}>✓ Sent — delivered to {sendResult.delivered} channel{sendResult.delivered === 1 ? '' : 's'}.</p>
					{:else if sendResult.ok}
						<p class={noticeWarn}>
							⚠ Recorded in your inbox, but it fired no alert channels (routed to inbox/off, or no
							matching targets).
						</p>
					{:else}
						<p class={noticeWarn}>⚠ Not approved yet — connect the app first.</p>
					{/if}
				{/if}
			</section>

			<!-- Debug: recent notifications -->
			<section class={card}>
				<div class="flex items-center justify-between">
					<h2 class="text-base font-semibold text-fg">Recent notifications</h2>
					<button
						onclick={() => run('__read', () => markAllRead())}
						disabled={busy['__read'] || data.notifications.length === 0}
						class={btnGhost}
					>
						Mark all read
					</button>
				</div>
				<p class="mt-1 text-xs text-muted-2">The 10 most recent we've sent you (debug view).</p>
				{#if data.notifications.length === 0}
					<p class="mt-3 text-sm text-muted">None yet — send one above.</p>
				{:else}
					<ul class="mt-3 divide-y divide-line text-sm">
						{#each data.notifications as n (n.id)}
							<li class="flex items-start justify-between gap-3 py-2">
								<div class="min-w-0">
									<div class="truncate text-fg">
										{#if !n.read}<span class="text-accent">•</span> {/if}{n.title}
									</div>
									<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-2">
										<span>{n.createdAt.slice(0, 10)}</span>
										{#if n.category}
											<span class="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{n.category}</span>
										{/if}
									</div>
								</div>
								<span class="shrink-0 text-xs text-muted-2">
									→ {n.delivered ?? 0} · {n.read ? 'read' : 'unread'}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<!-- Subscribers from atmo.pub's "enable apps" flow (debug) -->
		<section class={card}>
			<h2 class="text-base font-semibold text-fg">Subscribers from atmo.pub</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Users who enabled this app from inside atmo.pub. The relay tells us via a signed
				<code class="font-mono text-fg">subscriberChanged</code> callback. Demo store is in-memory.
			</p>
			{#if data.subscribers.length === 0}
				<p class="mt-3 text-sm text-muted-2">None yet.</p>
			{:else}
				<ul class="mt-3 space-y-1">
					{#each data.subscribers as sub (sub)}
						<li class="font-mono text-xs break-all text-fg">{sub}</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<footer class="border-t border-line pt-6 text-xs text-muted-2">
		Source:
		<a class="hover:text-fg" href={GITHUB_URL} target="_blank" rel="noreferrer">{GITHUB_URL}</a>.
		Powered by
		<a class="hover:text-fg" href={DASHBOARD_ORIGIN} target="_blank" rel="noreferrer">atmo.pub</a>.
	</footer>
</main>
