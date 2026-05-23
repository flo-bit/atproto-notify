<script lang="ts">
	interface Props {
		/** Sender DID — the thing the user actually approves. */
		sender: string;
		/** User-supplied display name from the request. */
		title: string;
		description?: string;
		iconUrl?: string;
		/** Best-effort Bluesky profile (informational "verified on Bluesky"). */
		senderHandle?: string;
		senderBskyDisplayName?: string;
		senderBskyAvatar?: string;
		size?: 'sm' | 'lg';
	}

	let {
		sender,
		title,
		description,
		iconUrl,
		senderHandle,
		senderBskyAvatar,
		size = 'sm'
	}: Props = $props();

	const icon = $derived(iconUrl ?? senderBskyAvatar);
	const initial = $derived((title.trim()[0] ?? '?').toUpperCase());
	const shortDid = $derived(
		sender.length > 30 ? `${sender.slice(0, 18)}…${sender.slice(-6)}` : sender
	);
	const iconClass = $derived(size === 'lg' ? 'size-12 text-lg' : 'size-10 text-sm');
	const titleClass = $derived(size === 'lg' ? 'text-base' : 'text-sm');
</script>

<div class="flex min-w-0 items-start gap-3">
	{#if icon}
		<img src={icon} alt="" class="{iconClass} shrink-0 rounded-lg bg-surface-2 object-cover" />
	{:else}
		<div
			class="{iconClass} grid shrink-0 place-items-center rounded-lg bg-accent-soft font-semibold text-accent"
			aria-hidden="true"
		>
			{initial}
		</div>
	{/if}
	<div class="min-w-0">
		<div class="truncate font-medium text-fg {titleClass}">{title}</div>
		<div class="truncate font-mono text-xs text-muted" title={sender}>{shortDid}</div>
		{#if description}
			<p class="mt-1 text-sm text-muted italic">{description}</p>
		{/if}
		{#if senderHandle}
			<p class="mt-1 flex items-center gap-1 text-xs text-muted-2">
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-success"
					aria-hidden="true"
				>
					<path d="M20 6 9 17l-5-5" />
				</svg>
				Verified on Bluesky: @{senderHandle}
			</p>
		{/if}
	</div>
</div>
