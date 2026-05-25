<script lang="ts">
	import './layout.css';
	import type { Snippet } from 'svelte';

	// Minimal root wrapper. The signed-in app chrome (sidebar / tab bar) lives in
	// the (app) route group's layout; this only frames the public login page.
	// Icons/favicons are declared statically in app.html (see `pnpm icons`).
	let { children }: { children: Snippet } = $props();
</script>

<!-- MOBILE: the document is locked (layout.css) so this is the scroll owner — it
     stays put for the app shell (which scrolls its own <main>) and scrolls the
     public pages if they overflow. DESKTOP: plain wrapper (no overflow) so it
     doesn't intercept overscroll — that chains up to the document and lets macOS
     do its native root rubber-band. -->
<div class="max-md:h-dvh max-md:overflow-y-auto">
	{@render children()}
</div>
