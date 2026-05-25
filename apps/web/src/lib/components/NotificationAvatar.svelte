<script lang="ts">
	// The leading visual for an inbox notification.
	// - No actors: the sending app's icon (real icon, else a colored initial).
	// - With actors: a small overlapping stack of the people's avatars, with the
	//   app's icon as a badge in the bottom-right corner so you still know the app.
	// An actor with a `url` becomes a link to its profile (rendered as a sibling of
	// the notification's own link in the inbox row, so no nested anchors).
	import type { NotificationActor } from '@atmo/notifs-lexicons';

	import AppMark from './AppMark.svelte';

	interface Props {
		/** Sending app's DID (fallback id for the colored initial). */
		sender: string;
		/** Sending app's display name (alt text + the initial). */
		senderTitle: string;
		/** Sending app's icon, when we have one. */
		iconUrl?: string;
		actors?: NotificationActor[];
		dim?: boolean;
		/** Installed-PWA flag: drop `target` so out-of-scope actor links hand off to
		 *  the default browser (same as the inbox's own notification links). */
		standalone?: boolean;
	}

	let { sender, senderTitle, iconUrl, actors = [], dim = false, standalone = false }: Props =
		$props();

	// Cap the visible stack; any extras collapse into a trailing "+N" circle.
	const stack = $derived(actors.slice(0, 3));
	const hasActors = $derived(stack.length > 0);
	const overflow = $derived(actors.length - stack.length);

	const hue = (s: string) => [...s].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
	const initial = (s: string) => (s.trim()[0] ?? '?').toUpperCase();
</script>

<!-- One actor's circular avatar (image, else a colored initial). -->
{#snippet face(a: NotificationActor)}
	{#if a.avatar}
		<img
			src={a.avatar}
			alt={a.handle ?? ''}
			class="size-9 rounded-full bg-surface-2 object-cover {dim ? 'opacity-60' : ''}"
		/>
	{:else}
		<div
			class="grid size-9 place-items-center rounded-full text-sm font-bold text-white {dim
				? 'opacity-60'
				: ''}"
			style="background: oklch(0.7 0.13 {hue(a.handle ?? a.did)});"
			aria-hidden="true"
		>
			{initial(a.handle ?? a.did)}
		</div>
	{/if}
{/snippet}

{#if hasActors}
	<div class="relative shrink-0 self-start">
		<div class="flex">
			{#each stack as a, i (a.did)}
				{@const overlap = `margin-left: ${i === 0 ? '0' : '-0.55rem'}; z-index: ${stack.length - i};`}
				{#if a.url}
					<a
						href={a.url}
						target={standalone ? undefined : '_blank'}
						rel="noopener noreferrer"
						class="relative block rounded-full ring-2 ring-bg transition-opacity hover:opacity-80"
						style={overlap}
						aria-label={a.handle ? `@${a.handle}` : a.did}
					>
						{@render face(a)}
					</a>
				{:else}
					<div class="relative rounded-full ring-2 ring-bg" style={overlap}>
						{@render face(a)}
					</div>
				{/if}
			{/each}
			{#if overflow > 0}
				<div
					class="relative grid size-9 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted ring-2 ring-bg {dim
						? 'opacity-60'
						: ''}"
					style="margin-left: -0.55rem; z-index: 0;"
					title="{overflow} more"
				>
					+{overflow}
				</div>
			{/if}
		</div>

		<!-- App-icon badge, overlapping the bottom-right of the stack (above all avatars). -->
		<span
			class="pointer-events-none absolute -right-1 -bottom-1 z-10 block overflow-hidden rounded-[0.4rem] ring-2 ring-bg"
		>
			{#if iconUrl}
				<img
					src={iconUrl}
					alt={senderTitle}
					class="size-[1.15rem] bg-surface-2 object-cover {dim ? 'opacity-60' : ''}"
				/>
			{:else}
				<AppMark id={senderTitle || sender} size={18} {dim} />
			{/if}
		</span>
	</div>
{:else if iconUrl}
	<img
		src={iconUrl}
		alt={senderTitle}
		class="size-8 shrink-0 self-start rounded-[0.5rem] bg-surface-2 object-cover {dim
			? 'opacity-60'
			: ''}"
	/>
{:else}
	<div class="shrink-0 self-start">
		<AppMark id={senderTitle || sender} size={32} {dim} />
	</div>
{/if}
