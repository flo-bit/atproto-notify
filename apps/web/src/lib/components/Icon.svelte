<script lang="ts">
	// Outline glyph set ported from the v2 design (ref/design/project/v2-data.jsx).
	// Strokes use `currentColor`, so color via `text-*` utilities on a parent.
	type IconName =
		| 'inbox'
		| 'apps'
		| 'gear'
		| 'bell'
		| 'bell-off'
		| 'check'
		| 'x'
		| 'plus'
		| 'chevron-right'
		| 'chevron-down'
		| 'search'
		| 'logout'
		| 'tg'
		| 'push'
		| 'sun'
		| 'moon'
		| 'mute'
		| 'arrow-right'
		| 'info'
		| 'send';

	interface Props {
		name: IconName;
		size?: number;
		stroke?: number;
		class?: string;
	}

	let { name, size = 20, stroke = 1.6, class: klass = '' }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={klass}
	aria-hidden="true"
>
	{#if name === 'inbox'}
		<path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
		<path d="M3 13h5l1 3h6l1-3h5" />
	{:else if name === 'apps'}
		<rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
		<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
		<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
		<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
	{:else if name === 'gear'}
		<circle cx="12" cy="12" r="3.2" />
		<path
			d="M19.2 14.8a1.6 1.6 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.4V21a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.7.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.4-1H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.4V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.4 1.6 1.6 0 0 0 1.7-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.4 1H21a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.4 1z"
		/>
	{:else if name === 'bell'}
		<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
		<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
	{:else if name === 'bell-off'}
		<path d="M13.7 21a2 2 0 0 1-3.4 0" />
		<path d="M18.6 13.4A11 11 0 0 1 18 8a6 6 0 0 0-9.9-4.5" />
		<path d="M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h15" />
		<path d="M3 3l18 18" />
	{:else if name === 'check'}
		<path d="M5 12l5 5L20 7" />
	{:else if name === 'x'}
		<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'chevron-right'}
		<path d="M9 6l6 6-6 6" />
	{:else if name === 'chevron-down'}
		<path d="M6 9l6 6 6-6" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="7" />
		<path d="M21 21l-4.3-4.3" />
	{:else if name === 'logout'}
		<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
		<path d="M10 17l-5-5 5-5M5 12h11" />
	{:else if name === 'tg'}
		<circle cx="12" cy="12" r="9" />
		<path d="M8 12.5l2.2 2.2L16 9" />
	{:else if name === 'push'}
		<rect x="6" y="3" width="12" height="18" rx="2" />
		<circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
		<path d="M9 11h6M9 14h4" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4" />
		<path
			d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
		/>
	{:else if name === 'moon'}
		<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
	{:else if name === 'mute'}
		<path d="M9 9H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4l5 4V5L9 9z" />
		<path d="M16 9l5 6M21 9l-5 6" />
	{:else if name === 'arrow-right'}
		<path d="M5 12h14M13 6l6 6-6 6" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 11v5" />
		<circle cx="12" cy="7.75" r="0.6" fill="currentColor" stroke="none" />
	{:else if name === 'send'}
		<path d="M21 4L3 11l7 2 2 7 9-16z" />
		<path d="M21 4l-11 9" />
	{/if}
</svg>
