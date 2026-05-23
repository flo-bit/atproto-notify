<script lang="ts">
	interface Props {
		checked: boolean;
		/** Accessible label (also used as aria-label). */
		label: string;
		onchange: (value: boolean) => void;
		id?: string;
		disabled?: boolean;
	}

	let { checked, label, onchange, id, disabled = false }: Props = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{id}
	{disabled}
	onclick={() => onchange(!checked)}
	class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full
		transition-colors disabled:cursor-not-allowed disabled:opacity-50
		{checked ? 'bg-accent' : 'bg-line'}"
>
	<span
		class="inline-block size-5 transform rounded-full bg-surface shadow-sm transition-transform
			{checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}"
	></span>
</button>
