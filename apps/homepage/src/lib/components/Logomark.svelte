<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		size?: number;
		class?: string;
	}

	let { size = 20, class: klass = '' }: Props = $props();

	// Shake on mount and on hover. Pure CSS animation (no motion lib); the class
	// is removed on `animationend` so each hover can re-trigger it.
	let shaking = $state(false);

	onMount(() => {
		shaking = true;
	});
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class="bell {klass} {shaking ? 'shake' : ''}"
	onmouseenter={() => (shaking = true)}
	onanimationend={() => (shaking = false)}
>
	<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
	<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
</svg>

<style>
	.bell {
		transform-origin: center;
	}
	.shake {
		animation: bell-shake 0.5s ease-in-out;
	}
	@keyframes bell-shake {
		0% {
			transform: rotate(0);
		}
		25% {
			transform: rotate(-10deg);
		}
		50% {
			transform: rotate(10deg);
		}
		75% {
			transform: rotate(-10deg);
		}
		100% {
			transform: rotate(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.shake {
			animation: none;
		}
	}
</style>
