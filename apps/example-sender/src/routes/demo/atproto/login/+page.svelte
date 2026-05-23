<script lang="ts">
	import { oauthLogin } from '$lib/atproto/oauth.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let handle = $state('');
	let error = $state<string | null>(null);
	let pending = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		pending = true;
		try {
			const { url } = await oauthLogin({ handle: handle.trim(), returnTo: data.returnTo });
			window.location.assign(url);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Sign-in failed';
			pending = false;
		}
	}
</script>

<div
	style="max-width: 24rem; margin: 4rem auto; padding: 0 1rem; font-family: system-ui, sans-serif;"
>
	<h1>Sign in with atproto</h1>

	<form onsubmit={submit} style="display: flex; flex-direction: column; gap: 0.5rem;">
		<label>
			<span>Handle or DID</span>
			<input bind:value={handle} placeholder="alice.bsky.social" required />
		</label>

		{#if error}
			<p style="color: #c00;">{error}</p>
		{/if}

		<button type="submit" disabled={pending}>
			{pending ? 'Signing in…' : 'Sign in'}
		</button>
	</form>
</div>
