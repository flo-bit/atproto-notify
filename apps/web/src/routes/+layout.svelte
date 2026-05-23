<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';

	// Minimal root wrapper. The signed-in app chrome (sidebar / tab bar) lives in
	// the (app) route group's layout; this only frames the public login page.
	// Icons/favicons are declared statically in app.html (see `pnpm icons`).
	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
