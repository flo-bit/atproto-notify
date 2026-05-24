<script lang="ts">
	import {
		CHANNELS,
		formatRoute,
		routeChannels,
		routeSelection,
		type Channel,
		type RouteInstances,
		type RouteToken
	} from '@atmo/notifs-lexicons';
	import { channelLabel } from '$lib/routes';
	import Icon from '$lib/components/Icon.svelte';

	let {
		value,
		inherit,
		instances,
		allowInbox = true,
		disabled = false,
		onchange
	}: {
		/** Current route string: an inherit sentinel, 'off', 'inbox', or a token set. */
		value: string;
		/** Optional inherit choice (account default for apps, app-wide for categories). */
		inherit?: { token: 'default' | 'app'; label: string };
		/** Routable instances per channel, listed as targets under each channel. */
		instances?: RouteInstances;
		/** Offer the "Inbox only" mode (off for contexts like pending requests). */
		allowInbox?: boolean;
		disabled?: boolean;
		onchange: (route: string) => void;
	} = $props();

	// When inbox-only isn't offered, an empty custom selection collapses to 'off'.
	const emptyValue = $derived(allowInbox ? 'inbox' : 'off');

	// Local: did the user explicitly open the Custom tree? An empty custom selection
	// stores 'inbox', so without this the tree would collapse back to "Inbox only".
	let customOpen = $state(false);

	const inheriting = $derived(inherit !== undefined && value === inherit.token);
	const selected = $derived(routeSelection(value));
	const hasChannels = $derived(routeChannels(value).length > 0);

	type Mode = 'inherit' | 'inbox' | 'off' | 'custom';
	const mode = $derived<Mode>(
		inheriting
			? 'inherit'
			: value === 'off'
				? 'off'
				: hasChannels || customOpen
					? 'custom'
					: 'inbox'
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
		// Entering Custom from a non-custom value starts empty until a box is checked.
		if (!hasChannels) onchange(emptyValue);
	}

	function instancesFor(c: Channel): { id: string; label: string }[] {
		return instances?.[c] ?? [];
	}

	type Sel = 'all' | string[];
	type Selection = Partial<Record<Channel, Sel>>;

	/** Build the current per-channel selection from the route value. */
	function currentSelection(): Selection {
		const m: Selection = {};
		for (const c of CHANNELS) {
			const s = selected[c];
			if (s === undefined) continue;
			if (s.all) m[c] = 'all';
			else if (s.ids.length > 0) {
				const total = instancesFor(c).length;
				m[c] = total > 0 && s.ids.length >= total ? 'all' : [...s.ids];
			}
		}
		return m;
	}

	/** Emit a route from a per-channel selection ('all' → bare token, so newly added
	 *  targets of that channel are automatically included). Empty = inbox only. */
	function emit(m: Selection) {
		const tokens: RouteToken[] = [];
		for (const c of CHANNELS) {
			const s = m[c];
			if (s === undefined) continue;
			if (s === 'all') tokens.push({ channel: c });
			else for (const id of s) tokens.push({ channel: c, instance: id });
		}
		const route = formatRoute(tokens);
		onchange(route === 'off' ? emptyValue : route);
	}

	function parentState(c: Channel): 'on' | 'partial' | 'off' {
		const s = selected[c];
		if (s === undefined) return 'off';
		if (s.all) return 'on';
		const total = instancesFor(c).length;
		if (total > 0 && s.ids.length >= total) return 'on';
		return s.ids.length > 0 ? 'partial' : 'off';
	}

	function childChecked(c: Channel, id: string): boolean {
		const s = selected[c];
		return s !== undefined && (s.all || s.ids.includes(id));
	}

	function toggleParent(c: Channel) {
		const m = currentSelection();
		if (parentState(c) === 'on') delete m[c];
		else m[c] = 'all';
		emit(m);
	}

	function toggleChild(c: Channel, id: string) {
		const m = currentSelection();
		const cur = m[c];
		const total = instancesFor(c).length;
		let ids: string[];
		if (cur === 'all')
			ids = instancesFor(c)
				.map((i) => i.id)
				.filter((x) => x !== id);
		else if (cur === undefined) ids = [id];
		else ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
		if (ids.length === 0) delete m[c];
		else if (total > 0 && ids.length >= total) m[c] = 'all';
		else m[c] = ids;
		emit(m);
	}

	const modeBtn =
		'rounded-md border px-2.5 py-1 text-sm font-medium transition-colors disabled:opacity-50';
	const on = 'border-accent bg-accent-soft text-accent';
	const off = 'border-line text-muted hover:bg-surface-2 hover:text-fg';
	const rowBtn =
		'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-surface disabled:opacity-50';
</script>

{#snippet box(state: 'on' | 'partial' | 'off')}
	<span
		class="flex size-4 shrink-0 items-center justify-center rounded border {state === 'off'
			? 'border-line'
			: 'border-accent bg-accent'}"
	>
		{#if state === 'on'}
			<Icon name="check" size={11} stroke={3} class="text-accent-fg" />
		{:else if state === 'partial'}
			<span class="h-0.5 w-2 rounded-full bg-accent-fg"></span>
		{/if}
	</span>
{/snippet}

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
		{#if allowInbox}
			<button
				type="button"
				{disabled}
				onclick={pickInbox}
				aria-pressed={mode === 'inbox'}
				class="{modeBtn} {mode === 'inbox' ? on : off}"
			>
				Inbox only
			</button>
		{/if}
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
		{@const available = CHANNELS.filter((c) => instancesFor(c).length > 0)}
		<div class="rounded-md border border-line-2 bg-surface-2 p-2">
			{#if available.length === 0}
				<p class="px-1 py-0.5 text-xs text-muted">
					No channels connected.
					<a href="/settings?tab=channels" class="text-accent hover:underline"
						>Add one in settings</a
					>.
				</p>
			{:else}
				<div class="flex flex-col gap-0.5">
					{#each available as c (c)}
						{@const pstate = parentState(c)}
						{@const kids = instancesFor(c)}
						<div>
							<button
								type="button"
								{disabled}
								role="checkbox"
								aria-checked={pstate === 'on' ? 'true' : pstate === 'partial' ? 'mixed' : 'false'}
								onclick={() => toggleParent(c)}
								class="{rowBtn} font-medium text-fg"
							>
								{@render box(pstate)}
								{channelLabel(c)}
							</button>
							{#if kids.length > 1}
								<div class="ml-5 flex flex-col gap-0.5">
									{#each kids as k (k.id)}
										<button
											type="button"
											{disabled}
											role="checkbox"
											aria-checked={childChecked(c, k.id)}
											onclick={() => toggleChild(c, k.id)}
											class="{rowBtn} text-muted"
										>
											{@render box(childChecked(c, k.id) ? 'on' : 'off')}
											<span class="truncate">{k.label}</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
