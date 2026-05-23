<script lang="ts">
	import { oauthLogin, oauthLogout } from '$lib/atproto/oauth.remote';
	import {
		APP_DESCRIPTION,
		APP_TITLE,
		DASHBOARD_ORIGIN,
		GITHUB_URL,
		PROJECT_NAME,
		SENDER_DID
	} from '$lib/config';
	import {
		getRouting,
		listNotifications,
		markAllRead,
		openInAtmo,
		requestNotifications,
		sendTest,
		setRouting,
		type SendResult
	} from '$lib/relay.remote';
	import type { AppRoute, NotificationView, RoutingView } from '$lib/types';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

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
			// Remote-function errors arrive as { body: { message } }, not Error instances.
			const e = err as { body?: { message?: string }; message?: string };
			authError = e?.body?.message ?? e?.message ?? 'Sign-in failed';
			authBusy = false;
		}
	}

	async function signOut() {
		await oauthLogout();
		window.location.href = '/';
	}

	// --- step 1: request permission ---------------------------------------
	let reqBusy = $state(false);
	let reqResult = $state<{ id: string; status: string } | null>(null);
	let reqError = $state('');

	async function request() {
		reqBusy = true;
		reqError = '';
		try {
			reqResult = await requestNotifications();
		} catch (err) {
			reqError = err instanceof Error ? err.message : 'Request failed';
		} finally {
			reqBusy = false;
		}
	}

	// --- cross-app login: jump into atmo.pub already signed in -------------
	let openBusy = $state(false);
	let openError = $state('');

	async function openAtmo() {
		openBusy = true;
		openError = '';
		// Open the tab synchronously on the click so the browser keeps the user
		// gesture (no popup blocker), then point it at the link once minted.
		const w = window.open('about:blank');
		try {
			const { url } = await openInAtmo();
			if (w) w.location.href = url;
			else window.location.href = url;
		} catch (err) {
			w?.close();
			openError = err instanceof Error ? err.message : 'Failed to open atmo.pub';
		} finally {
			openBusy = false;
		}
	}

	// --- step 2: send a test ----------------------------------------------
	let title = $state('');
	let body = $state('');
	let sendBusy = $state(false);
	let sendResult = $state<SendResult | null>(null);
	let sendError = $state('');

	async function send(event: SubmitEvent) {
		event.preventDefault();
		sendBusy = true;
		sendError = '';
		try {
			sendResult = await sendTest({ title, body });
		} catch (err) {
			sendError = err instanceof Error ? err.message : 'Send failed';
		} finally {
			sendBusy = false;
		}
	}

	// --- step 3: manage routing + inbox (dual-auth) -----------------------
	let manageBusy = $state(false);
	let manageError = $state('');
	let routing = $state<RoutingView | null>(null);
	let notifs = $state<NotificationView[]>([]);
	let routeChoice = $state<AppRoute>('default');
	let loaded = $state(false);

	// Remote-command errors arrive as { body: { message } }, not Error instances.
	function errMsg(err: unknown, fallback: string): string {
		const e = err as { body?: { message?: string }; message?: string };
		return e?.body?.message ?? e?.message ?? fallback;
	}

	async function loadSettings() {
		manageBusy = true;
		manageError = '';
		try {
			const [r, list] = await Promise.all([getRouting(), listNotifications()]);
			routing = r;
			routeChoice = r.route;
			notifs = list.notifications;
			loaded = true;
		} catch (err) {
			manageError = errMsg(err, 'Failed to load settings');
		} finally {
			manageBusy = false;
		}
	}

	async function changeRoute() {
		manageBusy = true;
		manageError = '';
		try {
			await setRouting({ route: routeChoice });
			routing = await getRouting();
		} catch (err) {
			manageError = errMsg(err, 'Failed to update routing');
		} finally {
			manageBusy = false;
		}
	}

	async function markRead() {
		manageBusy = true;
		manageError = '';
		try {
			await markAllRead();
			notifs = (await listNotifications()).notifications;
		} catch (err) {
			manageError = errMsg(err, 'Failed to mark read');
		} finally {
			manageBusy = false;
		}
	}

	const card = 'rounded-card border border-line bg-surface p-5';
	const btnPrimary =
		'rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50';
	const inputCls =
		'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted-2 focus:border-accent';
	const selectCls =
		'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent';
	const noticeOk = 'mt-3 rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-fg';
	const noticeWarn = 'mt-3 rounded-md border border-line px-3 py-2 text-sm text-warn';
</script>

<svelte:head><title>{PROJECT_NAME}</title></svelte:head>

<main class="mx-auto w-full max-w-[640px] space-y-8 px-4 py-10">
	<header>
		<h1 class="text-2xl font-semibold tracking-tight text-fg">{PROJECT_NAME}</h1>
		<p class="mt-3 max-w-prose text-sm leading-relaxed text-muted">
			A demo app showing how any AT&nbsp;Protocol app can send notifications through
			atmo.pub. The code is open source — it wires up both auth mechanisms (user-OAuth
			for requesting permission, sender-DID for sending) in ~300 lines.
		</p>

		{#if data.did}
			<div class="mt-4 flex flex-wrap items-center gap-3 text-sm">
				<span class="text-muted">
					Signed in as
					<span class="font-medium text-fg">{data.handle ? `@${data.handle}` : data.did}</span>
				</span>
				<button
					onclick={signOut}
					class="rounded-md border border-line px-3 py-1.5 font-medium text-fg hover:bg-surface-2"
				>
					Sign out
				</button>
			</div>
		{:else}
			<form onsubmit={signIn} class="mt-5 flex max-w-sm flex-col gap-2 sm:flex-row">
				<input
					bind:value={handle}
					placeholder="jcsalterego.bsky.social"
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

	{#if data.did}
		<section class={card}>
			<h2 class="text-base font-semibold text-fg">Step 1 — Request permission</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Calls <code class="font-mono text-fg">requestPermission</code> on the relay using a
				service-auth token minted by your PDS (proves you authorized this app). The request names
				this app's own DID (<code class="font-mono break-all text-fg">{SENDER_DID}</code>) as the
				sender — “{APP_TITLE}”, {APP_DESCRIPTION}
			</p>
			<button onclick={request} disabled={reqBusy} class="{btnPrimary} mt-4">
				{reqBusy ? 'Requesting…' : 'Request notifications'}
			</button>
			{#if reqResult}
				{#if reqResult.status === 'alreadyGranted'}
					<p class={noticeOk}>✓ You've already approved this app. Skip to Step 2.</p>
				{:else}
					<p class={noticeOk}>
						✓ Request sent. Approve it at
						<a
							class="text-accent hover:underline"
							href={DASHBOARD_ORIGIN}
							target="_blank"
							rel="noreferrer">atmo.pub</a
						>, where you can also connect Telegram. Already approved? Skip to Step 2.
					</p>
				{/if}
			{/if}
			{#if reqError}<p class="mt-3 text-sm text-danger" role="alert">{reqError}</p>{/if}
		</section>

		<section class={card}>
			<h2 class="text-base font-semibold text-fg">Step 2 — Send a test</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Calls <code class="font-mono text-fg">send</code> using a JWT signed by this app's own
				private key — no user OAuth involved. The recipient (you) is in the body.
			</p>
			<form onsubmit={send} class="mt-4 space-y-2">
				<input bind:value={title} placeholder="Hello from the example sender" class={inputCls} />
				<input
					bind:value={body}
					placeholder="If you can read this, the integration works end to end."
					class={inputCls}
				/>
				<button type="submit" disabled={sendBusy} class={btnPrimary}>
					{sendBusy ? 'Sending…' : 'Send test notification'}
				</button>
			</form>
			{#if sendResult}
				{#if sendResult.ok && sendResult.delivered > 0}
					<p class={noticeOk}>✓ Sent — check your Telegram.</p>
				{:else if sendResult.ok}
					<p class={noticeWarn}>
						⚠ Sent, but you have no delivery channels linked. Connect Telegram at
						<a class="underline" href={DASHBOARD_ORIGIN} target="_blank" rel="noreferrer"
							>atmo.pub</a
						>.
					</p>
				{:else}
					<p class={noticeWarn}>
						⚠ Approve this app first at
						<a class="underline" href={DASHBOARD_ORIGIN} target="_blank" rel="noreferrer"
							>atmo.pub</a
						>, then try again.
					</p>
				{/if}
			{/if}
			{#if sendError}<p class="mt-3 text-sm text-danger" role="alert">{sendError}</p>{/if}
		</section>

		<section class={card}>
			<h2 class="text-base font-semibold text-fg">Step 3 — Manage your settings (dual-auth)</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Read and change how <em>this app's</em> notifications reach you — from inside this app. Each
				call carries <strong class="text-fg">two</strong> service-auth tokens: one signed by this app
				(proves which app), and a fresh one minted by your PDS (proves you consented). The relay
				scopes every change to you&nbsp;+&nbsp;this app — it can't touch your account default or
				other apps. Requires an approved grant (Step&nbsp;1).
			</p>
			<button onclick={loadSettings} disabled={manageBusy} class="{btnPrimary} mt-4">
				{manageBusy ? 'Working…' : loaded ? 'Refresh' : 'Load my settings'}
			</button>

			{#if routing}
				<div class="mt-5 space-y-5">
					<label class="block text-sm">
						<span class="font-medium text-fg">Route all of this app's notifications to</span>
						<select
							bind:value={routeChoice}
							onchange={changeRoute}
							disabled={manageBusy}
							class="{selectCls} mt-1"
						>
							<option value="default">Account default ({routing.defaultRoute})</option>
							<option value="push">Push</option>
							<option value="telegram">Telegram</option>
							<option value="push+telegram">Push + Telegram</option>
							<option value="off">Off</option>
						</select>
					</label>

					<div>
						<div class="flex items-center justify-between">
							<h3 class="text-sm font-medium text-fg">Notifications we've sent you</h3>
							<button
								onclick={markRead}
								disabled={manageBusy || notifs.length === 0}
								class="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
							>
								Mark all read
							</button>
						</div>
						{#if notifs.length === 0}
							<p class="mt-2 text-sm text-muted">None yet — send one in Step 2, then Refresh.</p>
						{:else}
							<ul class="mt-2 divide-y divide-line text-sm">
								{#each notifs as n (n.id)}
									<li class="flex items-center justify-between gap-3 py-2">
										<span class="min-w-0 truncate text-fg">{n.read ? '' : '• '}{n.title}</span>
										<span class="shrink-0 text-xs text-muted-2">
											delivered to {n.delivered ?? 0} · {n.read ? 'read' : 'unread'}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{/if}
			{#if manageError}<p class="mt-3 text-sm text-danger" role="alert">{manageError}</p>{/if}
		</section>

		<section class={card}>
			<h2 class="text-base font-semibold text-fg">Cross-app login</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Mints a one-time <code class="font-mono text-fg">pub.atmo.auth</code> token on your PDS and
				opens
				<a class="text-accent hover:underline" href={DASHBOARD_ORIGIN} target="_blank" rel="noreferrer"
					>atmo.pub</a
				>
				<em>already signed in</em> — deep-linked to this app's settings. No login form.
			</p>
			<button onclick={openAtmo} disabled={openBusy} class="{btnPrimary} mt-4">
				{openBusy ? 'Opening…' : 'Open in atmo.pub'}
			</button>
			{#if openError}<p class="mt-3 text-sm text-danger" role="alert">{openError}</p>{/if}
		</section>
	{/if}

	<footer class="border-t border-line pt-6 text-xs text-muted-2">
		Source:
		<a class="hover:text-fg" href={GITHUB_URL} target="_blank" rel="noreferrer">{GITHUB_URL}</a>.
		Powered by
		<a class="hover:text-fg" href={DASHBOARD_ORIGIN} target="_blank" rel="noreferrer"
			>atmo.pub</a
		>.
	</footer>
</main>
