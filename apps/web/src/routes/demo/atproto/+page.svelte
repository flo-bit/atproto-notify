<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
	const emojis = ['👍', '🥰', '🎉', '🚀', '✨'];
</script>

<div
	style="max-width: 32rem; margin: 4rem auto; padding: 0 1rem; font-family: system-ui, sans-serif;"
>
	<h1>What's your status?</h1>
	<p>Hi <strong>{data.handle ?? data.did}</strong>.</p>

	<form
		method="POST"
		action="?/setStatus"
		use:enhance
		style="display: flex; gap: 0.5rem; margin: 1rem 0;"
	>
		{#each emojis as emoji}
			<button type="submit" name="status" value={emoji} style="font-size: 1.5rem;">{emoji}</button>
		{/each}
	</form>

	{#if data.recent?.length}
		<h2 style="margin-top: 2rem;">Recent statuses (firehose)</h2>
		<ul style="list-style: none; padding: 0;">
			{#each data.recent as item}
				<li style="padding: 0.5rem 0;">
					<span style="font-size: 1.25rem;">{item.record.status}</span>
					<span style="color: #444; margin-left: 0.5rem;"
						>@{data.authors[item.did] ?? item.did}</span
					>
					<small style="color: #888; margin-left: 0.5rem;">{item.record.createdAt}</small>
				</li>
			{/each}
		</ul>
	{/if}

	<form method="POST" action="?/signOut" use:enhance style="margin-top: 2rem;">
		<button type="submit">Sign out</button>
	</form>
</div>
