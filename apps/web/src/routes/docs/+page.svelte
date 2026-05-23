<script lang="ts">
	import { PROJECT_NAME } from '$lib/config';
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
			atproto rpc?lxm=tools.atmo.notifs.requestPermission&amp;aud=*
		</p>
		<p class="max-w-prose text-sm leading-relaxed text-muted">
			Once the <code class="font-mono text-fg">tools.atmo.notifs.authSender</code> permission set is
			published you can use the tidier
			<code class="font-mono text-fg">include:tools.atmo.notifs.authSender?aud=did:web:notifs.atmo.tools#notif_relay</code>
			instead. Then mint a service-auth JWT on the user's PDS via
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
		<h2 class="text-lg font-semibold text-fg">4. Rate limits</h2>
		<ul class="ml-5 list-disc space-y-1 text-sm text-muted">
			<li>At most <strong class="text-fg">1 outstanding pending request</strong> per (sender, recipient).</li>
			<li><code class="font-mono text-fg">requestPermission</code>: <strong class="text-fg">50 / hour</strong> per recipient and <strong class="text-fg">100 / hour</strong> per sender.</li>
			<li><code class="font-mono text-fg">send</code>: <strong class="text-fg">1 / second</strong> and <strong class="text-fg">100 / day</strong> per (sender, recipient).</li>
		</ul>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-fg">5. Error handling</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted">Common XRPC errors:</p>
		<ul class="ml-5 list-disc space-y-1 text-sm text-muted">
			<li><code class="font-mono text-fg">AuthenticationRequired</code> — missing/invalid JWT.</li>
			<li><code class="font-mono text-fg">NotAuthorized</code> — no active grant for this recipient.</li>
			<li><code class="font-mono text-fg">RateLimitExceeded</code> — slow down (see <code class="font-mono text-fg">Retry-After</code>).</li>
			<li><code class="font-mono text-fg">InvalidRequest</code> — malformed body (e.g. bad <code class="font-mono text-fg">senderDid</code>).</li>
		</ul>
	</section>
</article>
