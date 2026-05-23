<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { oauthLogout } from '$lib/atproto/oauth.remote';
	import Logomark from '$lib/components/Logomark.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { GITHUB_URL, PROJECT_NAME } from '$lib/config';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	let signingOut = $state(false);
	async function signOut() {
		signingOut = true;
		try {
			await oauthLogout();
			window.location.href = '/';
		} catch {
			signingOut = false;
		}
	}

	const navLink =
		'rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg';
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
		<div class="mx-auto flex h-14 max-w-[760px] items-center justify-between px-4">
			<a href="/" class="flex items-center gap-2 font-mono text-sm font-semibold text-fg">
				<Logomark size={20} class="text-accent" />
				<span>{PROJECT_NAME}</span>
			</a>
			<nav class="flex items-center gap-1">
				{#if data.did}
					<a href="/dashboard" class={navLink}>Dashboard</a>
				{/if}
				<a href="/docs" class={navLink}>Docs</a>
				<ThemeToggle />
				{#if data.did}
					<button
						type="button"
						onclick={signOut}
						disabled={signingOut}
						class="{navLink} disabled:opacity-50"
					>
						{signingOut ? 'Signing out…' : 'Sign out'}
					</button>
				{:else}
					<a
						href="/"
						class="rounded-md bg-fg px-3 py-1.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
					>
						Sign in
					</a>
				{/if}
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
