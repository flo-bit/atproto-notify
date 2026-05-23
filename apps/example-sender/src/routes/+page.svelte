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
	import { requestNotifications, sendTest, type SendResult } from '$lib/relay.remote';
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
			authError = err instanceof Error ? err.message : 'Sign-in failed';
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

	const card = 'rounded-card border border-line bg-surface p-5';
	const btnPrimary =
		'rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50';
	const inputCls =
		'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted-2 focus:border-accent';
	const noticeOk = 'mt-3 rounded-md border border-line bg-accent-soft px-3 py-2 text-sm text-fg';
	const noticeWarn = 'mt-3 rounded-md border border-line px-3 py-2 text-sm text-warn';
</script>

<svelte:head><title>{PROJECT_NAME}</title></svelte:head>

<main class="mx-auto w-full max-w-[640px] space-y-8 px-4 py-10">
	<header>
		<h1 class="text-2xl font-semibold tracking-tight text-fg">{PROJECT_NAME}</h1>
		<p class="mt-3 max-w-prose text-sm leading-relaxed text-muted">
			A demo app showing how any AT&nbsp;Protocol app can send notifications through
			notify.atmo.tools. The code is open source — it wires up both auth mechanisms (user-OAuth
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
							rel="noreferrer">notify.atmo.tools</a
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
							>notify.atmo.tools</a
						>.
					</p>
				{:else}
					<p class={noticeWarn}>
						⚠ Approve this app first at
						<a class="underline" href={DASHBOARD_ORIGIN} target="_blank" rel="noreferrer"
							>notify.atmo.tools</a
						>, then try again.
					</p>
				{/if}
			{/if}
			{#if sendError}<p class="mt-3 text-sm text-danger" role="alert">{sendError}</p>{/if}
		</section>
	{/if}

	<footer class="border-t border-line pt-6 text-xs text-muted-2">
		Source:
		<a class="hover:text-fg" href={GITHUB_URL} target="_blank" rel="noreferrer">{GITHUB_URL}</a>.
		Powered by
		<a class="hover:text-fg" href={DASHBOARD_ORIGIN} target="_blank" rel="noreferrer"
			>notify.atmo.tools</a
		>.
	</footer>
</main>
