<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 20, class: klass = '' }: Props = $props();
</script>

<!-- Stacked-dot signal glyph. -->
<svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" class={klass}>
	<circle cx="5" cy="10" r="2" fill="currentColor" />
	<circle cx="11" cy="6" r="2" fill="currentColor" opacity="0.55" />
	<circle cx="11" cy="14" r="2" fill="currentColor" opacity="0.55" />
	<circle cx="17" cy="10" r="2" fill="currentColor" opacity="0.25" />
</svg>
