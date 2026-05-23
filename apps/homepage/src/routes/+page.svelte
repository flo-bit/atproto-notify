<script lang="ts">
	import Logomark from '$lib/components/Logomark.svelte';
	import { PROJECT_NAME, WEBAPP_URL } from '$lib/config';

	const features = [
		{ t: 'Permission first', d: 'Apps request access; nothing is sent until you approve.' },
		{ t: 'Delivered to Telegram', d: 'Link your Telegram once and get notifications in chat.' },
		{ t: 'Revoke anytime', d: 'Mute or revoke any app from your dashboard.' }
	];
</script>

<svelte:head>
	<title>{PROJECT_NAME} — notifications for the atmosphere</title>
</svelte:head>

<section class="py-8 sm:py-12">
	<div class="mb-5 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
		<Logomark size={26} />
	</div>

	<h1 class="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
		{PROJECT_NAME}
	</h1>
	<p class="mt-4 max-w-prose text-base leading-relaxed text-muted">
		Lets any AT&nbsp;Protocol app send you notifications via Telegram (and soon more). You stay in
		control: every app must ask permission, and you can revoke any time.
	</p>

	<div class="mt-8 flex flex-wrap gap-3">
		<a
			href={WEBAPP_URL}
			class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
		>
			Sign in
		</a>
		<a
			href="/docs"
			class="rounded-md border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2"
		>
			Developer docs
		</a>
	</div>
</section>

<section class="grid gap-4 border-t border-line py-10 sm:grid-cols-3">
	{#each features as item (item.t)}
		<div class="rounded-card border border-line bg-surface p-4">
			<h2 class="text-sm font-semibold text-fg">{item.t}</h2>
			<p class="mt-1 text-sm text-muted">{item.d}</p>
		</div>
	{/each}
</section>
