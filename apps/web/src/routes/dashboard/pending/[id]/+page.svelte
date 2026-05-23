<script lang="ts">
	import { goto } from '$app/navigation';
	import RelativeTime from '$lib/components/RelativeTime.svelte';
	import SenderCard from '$lib/components/SenderCard.svelte';
	import { approve, deny } from '$lib/remote/notifs.remote';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state(false);
	let errorMsg = $state('');
	let showAbout = $state(false);
	let copiedDid = $state(false);

	async function act(fn: () => Promise<unknown>) {
		busy = true;
		errorMsg = '';
		try {
			await fn();
			await goto('/dashboard');
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Something went wrong';
			busy = false;
		}
	}

	async function copyDid(did: string) {
		try {
			await navigator.clipboard.writeText(did);
			copiedDid = true;
			setTimeout(() => (copiedDid = false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	/** Where the sender's DID document can be inspected. */
	function didDocUrl(did: string): string | null {
		if (did.startsWith('did:web:')) {
			const host = did.slice('did:web:'.length).replaceAll(':', '/');
			return `https://${host}/.well-known/did.json`;
		}
		if (did.startsWith('did:plc:')) {
			return `https://plc.directory/${did}`;
		}
		return null;
	}

	const btnBase = 'rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50';
</script>

<svelte:head><title>Permission request</title></svelte:head>

<a href="/dashboard" class="text-sm text-muted hover:text-fg">← Dashboard</a>

{#if !data.request}
	<div class="mt-6 rounded-card border border-line bg-surface p-8 text-center">
		<h1 class="text-lg font-semibold text-fg">This request is no longer available</h1>
		<p class="mx-auto mt-1 max-w-sm text-sm text-muted">
			It may have expired, been approved, or been denied already.
		</p>
		<a
			href="/dashboard"
			class="{btnBase} mt-5 inline-block bg-accent text-accent-fg hover:opacity-90"
		>
			Back to dashboard
		</a>
	</div>
{:else}
	{@const request = data.request}
	{@const docUrl = didDocUrl(request.sender)}
	<div class="mt-6 rounded-card border border-line bg-surface p-6">
		<p class="mb-4 text-sm text-muted">An app is asking to send you notifications.</p>

		<SenderCard
			sender={request.sender}
			title={request.title}
			description={request.description}
			iconUrl={request.iconUrl}
			senderHandle={request.senderHandle}
			senderBskyDisplayName={request.senderBskyDisplayName}
			senderBskyAvatar={request.senderBskyAvatar}
			size="lg"
		/>

		<p class="mt-4 text-xs text-muted-2">
			Requested <RelativeTime date={request.createdAt} /> · expires
			<RelativeTime date={request.expiresAt} />
		</p>

		<!-- About this sender: verify the exact DID being approved. -->
		<div class="mt-4 rounded-md border border-line-2">
			<button
				type="button"
				class="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-muted hover:text-fg"
				aria-expanded={showAbout}
				onclick={() => (showAbout = !showAbout)}
			>
				<span>About this sender</span>
				<span aria-hidden="true">{showAbout ? '▲' : '▼'}</span>
			</button>
			{#if showAbout}
				<div class="space-y-2 border-t border-line-2 px-3 py-3">
					<p class="text-xs text-muted-2">
						You're approving this exact DID. Only its key can send you notifications.
					</p>
					<code class="block font-mono text-xs break-all text-fg">{request.sender}</code>
					<div class="flex gap-2">
						<button
							type="button"
							class="rounded-md border border-line px-2 py-1 text-xs text-fg hover:bg-surface-2"
							onclick={() => copyDid(request.sender)}
						>
							{copiedDid ? 'Copied' : 'Copy DID'}
						</button>
						{#if docUrl}
							<a
								href={docUrl}
								target="_blank"
								rel="noreferrer"
								class="rounded-md border border-line px-2 py-1 text-xs text-fg hover:bg-surface-2"
							>
								View DID document ↗
							</a>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		{#if errorMsg}
			<p class="mt-4 text-sm text-danger" role="alert">{errorMsg}</p>
		{/if}

		<div class="mt-6 flex gap-2">
			<button
				class="{btnBase} bg-accent text-accent-fg hover:opacity-90"
				disabled={busy}
				onclick={() => act(() => approve({ sender: request.sender, requestId: request.id }))}
			>
				Approve
			</button>
			<button
				class="{btnBase} border border-line text-fg hover:bg-surface-2"
				disabled={busy}
				onclick={() => act(() => deny({ requestId: request.id }))}
			>
				Deny
			</button>
		</div>
	</div>
{/if}
