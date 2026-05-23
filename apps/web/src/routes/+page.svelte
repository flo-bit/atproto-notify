<script lang="ts">
	import { oauthLogin } from '$lib/atproto/oauth.remote';
	import Icon from '$lib/components/Icon.svelte';
	import Logomark from '$lib/components/Logomark.svelte';
	import { PROJECT_NAME } from '$lib/config';

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
			const { url } = await oauthLogin({ handle: value, returnTo: '/apps' });
			window.location.href = url; // off to the PDS authorize screen
		} catch (err) {
			// Remote-function errors arrive as { body: { message } }, not Error instances.
			const e = err as { body?: { message?: string }; message?: string };
			errorMsg = e?.body?.message ?? e?.message ?? 'Sign-in failed';
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{PROJECT_NAME} — notifications for the atmosphere</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center px-6 py-12">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex flex-col items-center text-center">
			<div
				class="mb-5 grid size-14 place-items-center rounded-card bg-accent-soft text-accent"
				aria-hidden="true"
			>
				<Logomark size={28} />
			</div>
			<h1 class="text-2xl font-bold tracking-tight text-fg">
				Sign in to <span class="font-mono">atmo<span class="text-muted-2">.pub</span></span>
			</h1>
			<p class="mt-2 text-sm text-muted">
				Notifications for the atmosphere — delivered the way you choose.
			</p>
		</div>

		<form onsubmit={signIn} class="rounded-card border border-line bg-surface p-6">
			<label
				for="handle"
				class="mb-2 block font-mono text-[0.7rem] tracking-wide text-muted-2 uppercase"
			>
				Handle
			</label>
			<input
				id="handle"
				name="handle"
				bind:value={handle}
				placeholder="alice.bsky.social"
				autocomplete="off"
				autocapitalize="none"
				autocorrect="off"
				spellcheck="false"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				data-form-type="other"
				required
				class="w-full rounded-md border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg placeholder:text-muted-2 focus:border-accent"
			/>
			<p class="mt-1.5 text-xs text-muted-2">Enter your handle or DID.</p>

			<button
				type="submit"
				disabled={busy}
				class="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-fg px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{busy ? 'Redirecting…' : 'Sign in'}
				{#if !busy}<Icon name="arrow-right" size={16} stroke={2} />{/if}
			</button>

			{#if errorMsg}
				<p class="mt-3 text-sm text-danger" role="alert">{errorMsg}</p>
			{/if}
		</form>
	</div>
</div>
