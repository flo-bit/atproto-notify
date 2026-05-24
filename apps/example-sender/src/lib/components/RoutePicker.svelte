<script lang="ts">
	// A compact channel-set route picker, modelled on atmo.pub's own picker but
	// self-contained and channel-level (no per-instance pinning). Modes:
	//   inherit (optional) · Inbox only · Off · Custom (channel checkboxes)
	import { CHANNELS, channelLabel, channelsRoute, routeChannels } from '$lib/routes';

	let {
		value,
		inherit,
		available,
		disabled = false,
		onchange
	}: {
		/** Current route: an inherit sentinel, 'off', 'inbox', or a channel set. */
		value: string;
		/** Optional inherit choice (account default for the app, app default for categories). */
		inherit?: { token: 'default' | 'app'; label: string };
		/** Channel types the user has a target for; omitted = show all. */
		available?: string[];
		disabled?: boolean;
		onchange: (route: string) => void;
	} = $props();

	// Did the user explicitly open Custom? An empty custom selection stores 'inbox',
	// so without this the tree would collapse back to "Inbox only".
	let customOpen = $state(false);

	const inheriting = $derived(inherit !== undefined && value === inherit.token);
	const selected = $derived(routeChannels(value));
	const hasChannels = $derived(selected.length > 0);

	// Only offer channels the user has a target for — but keep showing one that's
	// already in the route (so it can still be turned off after the target is gone).
	const visibleChannels = $derived(
		CHANNELS.filter((c) => available === undefined || available.includes(c) || selected.includes(c))
	);

	type Mode = 'inherit' | 'inbox' | 'off' | 'custom';
	const mode = $derived<Mode>(
		inheriting ? 'inherit' : value === 'off' ? 'off' : hasChannels || customOpen ? 'custom' : 'inbox'
	);

	function pickInherit() {
		customOpen = false;
		if (inherit) onchange(inherit.token);
	}
	function pickInbox() {
		customOpen = false;
		onchange('inbox');
	}
	function pickOff() {
		customOpen = false;
		onchange('off');
	}
	function pickCustom() {
		customOpen = true;
		if (!hasChannels) onchange('inbox');
	}

	function toggle(channel: string) {
		const next = selected.includes(channel)
			? selected.filter((c) => c !== channel)
			: [...selected, channel];
		// channelsRoute returns 'off' for an empty set; in Custom mode we mean
		// "inbox only" (recorded, no alerts) instead.
		const route = channelsRoute(next);
		onchange(route === 'off' ? 'inbox' : route);
	}

	const modeBtn =
		'rounded-md border px-2.5 py-1 text-sm font-medium transition-colors disabled:opacity-50';
	const on = 'border-accent bg-accent-soft text-accent';
	const off = 'border-line text-muted hover:bg-surface-2 hover:text-fg';
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap gap-1.5">
		{#if inherit}
			<button
				type="button"
				{disabled}
				onclick={pickInherit}
				aria-pressed={mode === 'inherit'}
				class="{modeBtn} {mode === 'inherit' ? on : off}"
			>
				{inherit.label}
			</button>
		{/if}
		<button
			type="button"
			{disabled}
			onclick={pickInbox}
			aria-pressed={mode === 'inbox'}
			class="{modeBtn} {mode === 'inbox' ? on : off}"
		>
			Inbox only
		</button>
		<button
			type="button"
			{disabled}
			onclick={pickOff}
			aria-pressed={mode === 'off'}
			class="{modeBtn} {mode === 'off' ? on : off}"
		>
			Off
		</button>
		<button
			type="button"
			{disabled}
			onclick={pickCustom}
			aria-pressed={mode === 'custom'}
			class="{modeBtn} {mode === 'custom' ? on : off}"
		>
			Custom
		</button>
	</div>

	{#if mode === 'custom'}
		<div class="flex flex-col gap-0.5 rounded-md border border-line bg-surface-2 p-2">
			{#each visibleChannels as c (c)}
				{@const checked = selected.includes(c)}
				<button
					type="button"
					{disabled}
					role="checkbox"
					aria-checked={checked}
					onclick={() => toggle(c)}
					class="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm text-fg transition-colors hover:bg-surface disabled:opacity-50"
				>
					<span
						class="flex size-4 shrink-0 items-center justify-center rounded border {checked
							? 'border-accent bg-accent'
							: 'border-line'}"
					>
						{#if checked}
							<svg
								width="11"
								height="11"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="text-accent-fg"
								aria-hidden="true"
							>
								<path d="M5 12l5 5L20 7" />
							</svg>
						{/if}
					</span>
					{channelLabel(c)}
				</button>
			{:else}
				<p class="px-1.5 py-1 text-xs text-muted-2">No channels connected.</p>
			{/each}
		</div>
	{/if}
</div>
