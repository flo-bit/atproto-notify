<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div
	style="max-width: 24rem; margin: 4rem auto; padding: 0 1rem; font-family: system-ui, sans-serif;"
>
	<h1>Sign in with atproto</h1>

	<form
		method="POST"
		action="?/signIn"
		use:enhance
		style="display: flex; flex-direction: column; gap: 0.5rem;"
	>
		<label>
			<span>Handle or DID</span>
			<input name="handle" placeholder="alice.bsky.social" required />
		</label>

		<input type="hidden" name="returnTo" value={data.returnTo ?? ''} />

		{#if form?.message}
			<p style="color: #c00;">{form.message}</p>
		{/if}

		<button type="submit">Sign in</button>
	</form>
</div>
