<script lang="ts">
	// iOS-style toggle ported from `IOSToggle` in ref/design/project/v2-data.jsx.
	// Implemented as an accessible switch button using runes.
	interface Props {
		checked: boolean;
		onchange: (value: boolean) => void;
		/** Accessible label (used as aria-label). */
		label?: string;
		id?: string;
		disabled?: boolean;
	}

	let { checked, onchange, label, id, disabled = false }: Props = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{id}
	{disabled}
	onclick={() => onchange(!checked)}
	class="relative inline-flex h-5 w-[2.125rem] shrink-0 cursor-pointer items-center rounded-full
		transition-colors disabled:cursor-not-allowed disabled:opacity-50
		{checked ? 'bg-success' : 'bg-line'}"
>
	<span
		class="inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform
			{checked ? 'translate-x-[1.0625rem]' : 'translate-x-0.5'}"
	></span>
</button>
