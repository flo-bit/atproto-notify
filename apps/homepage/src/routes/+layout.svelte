<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Logomark from '$lib/components/Logomark.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import {
		DESCRIPTION,
		GITHUB_URL,
		PROJECT_NAME,
		SITE_URL,
		TAGLINE,
		WEBAPP_URL
	} from '$lib/config';

	let { children }: { children: Snippet } = $props();

	const navLink =
		'rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg';

	const ogTitle = `${PROJECT_NAME} — ${TAGLINE}`;
	const ogImage = `${SITE_URL}/og.png`;
	// Prerendered: `page.url.origin` is a build placeholder, so pin the origin and
	// keep only the per-page path for the canonical URL.
	const ogUrl = $derived(new URL(page.url.pathname, SITE_URL).href);
</script>

<svelte:head>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={PROJECT_NAME} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content={ogUrl} />
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

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
		<div class="mx-auto flex h-14 max-w-[760px] items-center justify-between px-4">
			<a href="/" class="flex items-center gap-2 font-mono text-sm font-semibold text-fg">
				<Logomark size={20} class="text-accent" />
				<span>{PROJECT_NAME}</span>
			</a>
			<nav class="flex items-center gap-1">
				<a href="/docs" class={navLink}>Docs</a>
				<ThemeToggle />
				<a
					href={WEBAPP_URL}
					class="rounded-md bg-fg px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
				>
					Sign in
				</a>
			</nav>
		</div>
	</header>

	<main class="mx-auto w-full max-w-[760px] flex-1 px-4 py-8">
		{@render children()}
	</main>

	<footer class="border-t border-line">
		<div class="mx-auto max-w-[760px] px-4 py-6 text-sm text-muted">
			<a href={GITHUB_URL} target="_blank" rel="noreferrer" class="hover:text-fg">
				{PROJECT_NAME} on GitHub ↗
			</a>
		</div>
	</footer>
</div>
