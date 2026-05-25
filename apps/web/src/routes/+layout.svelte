<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { DESCRIPTION, PROJECT_NAME, TAGLINE } from '$lib/config';

	// Minimal root wrapper. The signed-in app chrome (sidebar / tab bar) lives in
	// the (app) route group's layout; this only frames the public login page.
	// Icons/favicons are declared statically in app.html (see `pnpm icons`).
	let { children }: { children: Snippet } = $props();

	const ogTitle = `${PROJECT_NAME} — ${TAGLINE}`;
	// Absolute URL so scrapers resolve it regardless of the deployed domain.
	const ogImage = $derived(new URL('/og.png', page.url.origin).href);
</script>

<svelte:head>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={PROJECT_NAME} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content={page.url.href} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={ogTitle} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={DESCRIPTION} />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>

<!-- MOBILE: the document is locked (layout.css) so this is the scroll owner — it
     stays put for the app shell (which scrolls its own <main>) and scrolls the
     public pages if they overflow. DESKTOP: plain wrapper (no overflow) so it
     doesn't intercept overscroll — that chains up to the document and lets macOS
     do its native root rubber-band. -->
<div class="max-md:h-dvh max-md:overflow-y-auto">
	{@render children()}
</div>
