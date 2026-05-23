<script lang="ts">
	import { GITHUB_URL, PROJECT_NAME } from '$lib/config';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Block = { lang: string; raw: string; html: string };

	let copied = $state('');
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = text;
			setTimeout(() => {
				if (copied === text) copied = '';
			}, 1500);
		} catch {
			/* clipboard unavailable */
		}
	}
</script>

<svelte:head><title>Developer docs — {PROJECT_NAME}</title></svelte:head>

{#snippet codeblock(block: Block)}
	<div class="overflow-hidden rounded-card border border-line bg-surface">
		<div class="flex items-center justify-between border-b border-line-2 bg-surface-2 px-3 py-1.5">
			<span class="font-mono text-[11px] tracking-wide text-muted-2 uppercase">{block.lang}</span>
			<button
				type="button"
				class="font-mono text-[11px] text-muted-2 transition-colors hover:text-fg"
				onclick={() => copy(block.raw)}
			>
				{copied === block.raw ? 'copied' : 'copy'}
			</button>
		</div>
		<div class="codeblock overflow-x-auto p-4 text-xs leading-relaxed">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html block.html}
		</div>
	</div>
{/snippet}

<article class="space-y-10">
	<header>
		<h1 class="text-2xl font-semibold tracking-tight text-fg">Developer docs</h1>
		<p class="mt-2 max-w-prose text-sm leading-relaxed text-muted">
			Any atproto app can ask users to receive notifications via {PROJECT_NAME}. Users approve in
			the dashboard; the relay delivers via Telegram.
		</p>
		<p class="mt-3 max-w-prose rounded-card border border-line bg-surface p-3 text-sm text-muted">
			<strong class="text-fg">Two endpoints, two auth mechanisms.</strong>
			<code class="font-mono text-fg">requestPermission</code> proves
			<em>the user authorized this request</em> (user OAuth);
			<code class="font-mono text-fg">send</code> proves
			<em>the sender identity</em> (your app's own DID key).
		</p>
		<p class="mt-3 max-w-prose rounded-card border border-line bg-accent-soft p-3 text-sm text-muted">
			<strong class="text-fg">Prefer a working example?</strong> A complete, ~300-line app wiring up
			both flows is live at
			<a
				class="text-accent hover:underline"
				href="https://example.atmo.pub"
				target="_blank"
				rel="noreferrer">example.atmo.pub</a
			>
			— try it, then read the
			<a
				class="text-accent hover:underline"
				href={`${GITHUB_URL}/tree/main/apps/example-sender`}
				target="_blank"
				rel="noreferrer">source ↗</a
			>.
		</p>
	</header>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">1. Get a DID for your app</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Needed for <code class="font-mono text-fg">send</code>. The simplest option is
			<code class="font-mono text-fg">did:web</code>:
		</p>
		<ul class="ml-5 list-disc space-y-1 text-sm text-muted">
			<li>Host <code class="font-mono text-fg">/.well-known/did.json</code> on your app's domain.</li>
			<li>
				Generate a P-256 keypair and put the public key in the DID document as a
				<code class="font-mono text-fg">verificationMethod</code> whose id ends in
				<code class="font-mono text-fg">#atproto</code>.
			</li>
			<li>
				Reference:
				<a class="text-accent hover:underline" href="https://atproto.com/specs/did" target="_blank" rel="noreferrer">atproto DID spec ↗</a>
			</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">2. Request permission (user OAuth)</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			The user signs into your app via atproto OAuth. Add just the
			<code class="font-mono text-fg">requestPermission</code> method to your app's OAuth scope —
			<code class="font-mono text-fg">send</code> uses your app's own key, not the user's session,
			so it doesn't belong here:
		</p>
		<p class="max-w-prose rounded-card border border-line bg-surface px-3 py-2 font-mono text-xs break-all text-fg">
			atproto rpc?lxm=pub.atmo.notify.requestPermission&amp;aud=*
		</p>
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Then mint a service-auth JWT on the user's PDS via
			<code class="font-mono text-fg">com.atproto.server.getServiceAuth</code> and call:
		</p>
		{@render codeblock(data.code.request)}
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Returns <code class="font-mono text-fg">&#123; id, status &#125;</code>
			(<code class="font-mono text-fg">pending</code> or
			<code class="font-mono text-fg">alreadyGranted</code>). The user approves in their dashboard or
			via Telegram. <code class="font-mono text-fg">title</code> ≤ 50 chars,
			<code class="font-mono text-fg">description</code> ≤ 200 chars, optional
			<code class="font-mono text-fg">iconUrl</code>.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">3. Send a notification (your app's key)</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Once granted, sign with your app's own key (no user involved) and send. Field limits:
			<code class="font-mono text-fg">title</code> ≤ 100, <code class="font-mono text-fg">body</code>
			≤ 500, optional <code class="font-mono text-fg">uri</code> and
			<code class="font-mono text-fg">threadKey</code>.
		</p>
		{@render codeblock(data.code.sendJwt)}
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Easiest with <code class="font-mono text-fg">@atcute/client</code> (pass the JWT per call):
		</p>
		{@render codeblock(data.code.sendAtcute)}
		<p class="max-w-prose text-sm leading-relaxed text-muted">…or any HTTP client:</p>
		{@render codeblock(data.code.sendCurl)}
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">4. Cross-app login (optional)</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Let users jump from your app into {PROJECT_NAME} <em>already signed in</em>, with no login form
			— handy for a “Configure notifications” link that lands on your app's settings page. Your app
			mints a single-use, short-lived identity token on the user's PDS; {PROJECT_NAME} verifies the
			signature against their DID and starts a session. It's an identity proof only — it grants no
			access to the user's data.
		</p>
		{@render codeblock(data.code.appLogin)}
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			The token is single-use and expires in ~60s; <code class="font-mono text-fg">redirect</code>
			must be a relative path. It's a bearer link, so don't log it.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">5. Let users enable you from atmo.pub (optional)</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Users can turn on notifications for your app from inside {PROJECT_NAME} — without visiting your
			app first. When they do, the relay POSTs a <strong class="text-fg">relay-signed</strong>
			<code class="font-mono text-fg">subscriberChanged</code> callback to
			<code class="font-mono text-fg">/xrpc/pub.atmo.notify.subscriberChanged</code> on your service:
			<code class="font-mono text-fg">&#123; recipient, enabled, changedAt &#125;</code>. Verify it's
			really the relay, then start (or stop) sending to that user with
			<code class="font-mono text-fg">send</code>.
		</p>
		{@render codeblock(data.code.enableCallback)}
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			You trust the relay's word that the user consented (the same trust you already place in it to
			deliver). Callbacks are idempotent state, so safe to retry; treat them as such. Apps are
			curated for now — <a
				class="text-accent hover:underline"
				href={GITHUB_URL}
				target="_blank"
				rel="noreferrer">get in touch</a
			> to be listed.
		</p>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">6. Rate limits</h2>
		<ul class="ml-5 list-disc space-y-1 text-sm text-muted">
			<li>At most <strong class="text-fg">1 outstanding pending request</strong> per (sender, recipient).</li>
			<li><code class="font-mono text-fg">requestPermission</code>: <strong class="text-fg">50 / hour</strong> per recipient and <strong class="text-fg">100 / hour</strong> per sender.</li>
			<li><code class="font-mono text-fg">send</code>: <strong class="text-fg">1 / second</strong> and <strong class="text-fg">100 / day</strong> per (sender, recipient).</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">7. Error handling</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted">Common XRPC errors:</p>
		<ul class="ml-5 list-disc space-y-1 text-sm text-muted">
			<li><code class="font-mono text-fg">AuthenticationRequired</code> — missing/invalid JWT.</li>
			<li><code class="font-mono text-fg">NotAuthorized</code> — no active grant for this recipient.</li>
			<li><code class="font-mono text-fg">RateLimitExceeded</code> — slow down (see <code class="font-mono text-fg">Retry-After</code>).</li>
			<li><code class="font-mono text-fg">InvalidRequest</code> — malformed body (e.g. bad <code class="font-mono text-fg">senderDid</code>).</li>
		</ul>
	</section>
</article>
