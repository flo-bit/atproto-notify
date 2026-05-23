<script lang="ts">
	import Logomark from '$lib/components/Logomark.svelte';
	import { PROJECT_NAME } from '$lib/config';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let handle = $state('');
	let busy = $state(false);
	let errorMsg = $state('');

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		const value = handle.trim();
		if (!value) return;
		busy = true;
		errorMsg = '';
		try {
			const { login } = await import('@svelte-atproto/oauth/client');
			await login(value); // navigates to the PDS on success
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Sign-in failed';
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{PROJECT_NAME} — notifications for the atmosphere</title>
</svelte:head>

{#if data.did}
	<div
		class="mb-8 flex items-center justify-between gap-3 rounded-card border border-line bg-accent-soft px-4 py-3 text-sm"
	>
		<span class="text-fg">You're signed in.</span>
		<a
			href="/dashboard"
			class="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90"
		>
			Go to dashboard →
		</a>
	</div>
{/if}

<section class="py-8 sm:py-12">
	<div class="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
		<Logomark size={26} />
	</div>

	<h1 class="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
		{PROJECT_NAME}
	</h1>
	<p class="mt-4 max-w-prose text-base leading-relaxed text-muted">
		Lets any AT&nbsp;Protocol app send you notifications via Telegram (and soon more). You stay in
		control: every app must ask permission, and you can revoke any time.
	</p>

	{#if !data.did}
		<form onsubmit={signIn} class="mt-8 max-w-md">
			<label for="handle" class="mb-1.5 block text-sm font-medium text-fg">
				Sign in with Bluesky
			</label>
			<div class="flex flex-col gap-2 sm:flex-row">
				<input
					id="handle"
					name="handle"
					bind:value={handle}
					placeholder="alice.bsky.social"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					required
					class="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted-2 focus:border-accent"
				/>
				<button
					type="submit"
					disabled={busy}
					class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{busy ? 'Redirecting…' : 'Sign in'}
				</button>
			</div>
			<p class="mt-2 text-xs text-muted-2">
				Enter your handle or DID. You'll approve access on your own server.
			</p>
			{#if errorMsg}
				<p class="mt-2 text-sm text-danger" role="alert">{errorMsg}</p>
			{/if}
		</form>
	{/if}

	<div class="mt-8 flex flex-wrap gap-3">
		{#if data.did}
			<a
				href="/dashboard"
				class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
			>
				Dashboard
			</a>
		{/if}
		<a
			href="/docs"
			class="rounded-md border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2"
		>
			Developer docs
		</a>
	</div>
</section>

<section class="grid gap-4 border-t border-line py-10 sm:grid-cols-3">
	{#each [{ t: 'Permission first', d: 'Apps request access; nothing is sent until you approve.' }, { t: 'Delivered to Telegram', d: 'Link your Telegram once and get notifications in chat.' }, { t: 'Revoke anytime', d: 'Mute or revoke any app from your dashboard.' }] as item (item.t)}
		<div class="rounded-card border border-line bg-surface p-4">
			<h2 class="text-sm font-semibold text-fg">{item.t}</h2>
			<p class="mt-1 text-sm text-muted">{item.d}</p>
		</div>
	{/each}
</section>
