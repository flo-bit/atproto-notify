<script lang="ts">
	import { oauthLogout, setStatus } from '$lib/atproto/oauth.remote';
	import { invalidateAll } from '$app/navigation';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
	let pending = $state<string | null>(null);
	const emojis = ['👍', '🥰', '🎉', '🚀', '✨'];

	async function pick(emoji: string) {
		pending = emoji;
		try {
			await setStatus(emoji);
			await invalidateAll();
		} finally {
			pending = null;
		}
	}

	async function signOut() {
		await oauthLogout();
		window.location.href = '/demo/atproto/login';
	}
</script>

<div
	style="max-width: 32rem; margin: 4rem auto; padding: 0 1rem; font-family: system-ui, sans-serif;"
>
	<h1>What's your status?</h1>
	<p>Hi <strong>{data.handle ?? data.did}</strong>.</p>

	<div style="display: flex; gap: 0.5rem; margin: 1rem 0;">
		{#each emojis as emoji}
			<button onclick={() => pick(emoji)} disabled={pending !== null} style="font-size: 1.5rem;">
				{pending === emoji ? '…' : emoji}
			</button>
		{/each}
	</div>

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

	<button onclick={signOut} style="margin-top: 2rem;">Sign out</button>
</div>
