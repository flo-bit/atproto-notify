<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import Icon from '$lib/components/Icon.svelte';
	import { dismiss, toasts, type ToastType } from '$lib/toast.svelte';

	const ICON: Record<ToastType, 'check' | 'x' | 'info'> = {
		success: 'check',
		error: 'x',
		info: 'info'
	};
	// Accent ring for the icon per type (the card itself stays neutral/surface).
	const TONE: Record<ToastType, string> = {
		success: 'bg-accent-soft text-accent',
		error: 'bg-danger/10 text-danger',
		info: 'bg-surface-2 text-muted'
	};
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
	aria-live="polite"
>
	{#each toasts as t (t.id)}
		<div
			role="status"
			animate:flip={{ duration: 200 }}
			in:fly={{ y: 16, duration: 200 }}
			out:fly={{ y: 16, duration: 150 }}
			class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border border-line bg-surface px-3 py-2.5 shadow-lg"
		>
			<span class="flex size-5 shrink-0 items-center justify-center rounded-full {TONE[t.type]}">
				<Icon name={ICON[t.type]} size={12} stroke={2.6} />
			</span>
			<span class="min-w-0 flex-1 text-sm text-fg">{t.message}</span>
			<button
				type="button"
				onclick={() => dismiss(t.id)}
				aria-label="Dismiss"
				class="-mr-1 shrink-0 text-muted-2 transition-colors hover:text-fg"
			>
				<Icon name="x" size={15} stroke={2} />
			</button>
		</div>
	{/each}
</div>
