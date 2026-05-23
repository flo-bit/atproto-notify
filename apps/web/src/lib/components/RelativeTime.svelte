<script lang="ts">
	interface Props {
		/** ISO-8601 datetime string. */
		date: string;
		class?: string;
	}

	let { date, class: klass = '' }: Props = $props();

	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 31_536_000_000],
		['month', 2_592_000_000],
		['week', 604_800_000],
		['day', 86_400_000],
		['hour', 3_600_000],
		['minute', 60_000],
		['second', 1_000]
	];

	// Re-render every minute so relative times stay fresh.
	let nowMs = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (nowMs = Date.now()), 60_000);
		return () => clearInterval(id);
	});

	const parsed = $derived(new Date(date).getTime());
	const label = $derived.by(() => {
		if (!Number.isFinite(parsed)) return '';
		const diff = parsed - nowMs;
		const abs = Math.abs(diff);
		for (const [unit, ms] of units) {
			if (abs >= ms || unit === 'second') {
				return rtf.format(Math.round(diff / ms), unit);
			}
		}
		return '';
	});
	const fullTitle = $derived(Number.isFinite(parsed) ? new Date(date).toLocaleString() : '');
</script>

<time datetime={date} title={fullTitle} class={klass}>{label}</time>
