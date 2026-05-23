<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';

	// Minimal root wrapper. The signed-in app chrome (sidebar / tab bar) lives in
	// the (app) route group's layout; this only frames the public login page.
	let { children }: { children: Snippet } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}
