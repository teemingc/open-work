<script lang="ts">
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { curveBasis } from 'd3-shape';
	import { compactFormat } from './chart-format';

	let {
		stages,
		currency
	}: {
		/** Each step the money took, biggest first, like what came in, then what was given on. */
		stages: { label: string; amount: number }[];
		currency: string;
	} = $props();

	const compact = $derived(compactFormat(currency));
	const percent = new Intl.NumberFormat('en-US', {
		style: 'percent',
		maximumSignificantDigits: 2
	});

	const first = $derived(stages[0]?.amount || 1);
	/**
	 * A point at the start of each step, and one at the end so the last has a stretch of its own.
	 * Never thinner than a sliver, so a small last step still shows.
	 */
	const points = $derived(
		[...stages, stages.at(-1)!].map((stage, index) => ({
			index,
			value: Math.max(3, (stage.amount / first) * 100)
		}))
	);
	/**
	 * Two more points between each pair, just after one and just before the next, so the curve
	 * holds level through each step and narrows between them.
	 */
	const data = $derived(
		points.flatMap((point, i) => {
			const next = points[i + 1];
			if (!next) return [point];
			const step = (point.value - next.value) * 0.03;
			return [
				point,
				{ index: point.index + 0.25, value: point.value - step },
				{ index: next.index - 0.25, value: next.value + step }
			];
		})
	);

	/** Fainter rings around the funnel, like ripples. */
	const RINGS = [
		{ padding: 0, opacity: 0.9 },
		{ padding: 8, opacity: 0.25 },
		{ padding: 16, opacity: 0.12 }
	];
	const uid = $props.id();
</script>

<figure aria-label="How the money dripped down">
	<!-- The steps as text, for screen readers; the funnel draws them. -->
	<ol class="sr-only">
		{#each stages as stage (stage.label)}
			<li>{stage.label}: {compact.format(stage.amount)}</li>
		{/each}
	</ol>
	<div class="h-44" aria-hidden="true">
		<LazyChart class="size-full">
			{#snippet children({ Area, AreaChart, Text })}
				<AreaChart
					{data}
					x="index"
					y={[(d: { value: number }) => d.value + 16, (d: { value: number }) => -d.value - 16]}
					axis={false}
					grid={false}
					tooltipContext={false}
					padding={{ top: 0, bottom: 0, left: 0, right: 0 }}
				>
					{#snippet marks({ context })}
						{@const step = context.width / stages.length}
						<defs>
							<linearGradient id="{uid}-drip" x1="0" x2="1" y1="0" y2="0">
								<stop offset="0%" stop-color="var(--color-chart-income)" />
								<stop offset="100%" stop-color="var(--color-chart-3)" />
							</linearGradient>
						</defs>
						{#each RINGS as ring (ring.padding)}
							<Area
								y0={(d: { value: number }) => d.value + ring.padding}
								y1={(d: { value: number }) => -(d.value + ring.padding)}
								fill="url(#{uid}-drip)"
								fillOpacity={ring.opacity}
								curve={curveBasis}
								line={false}
							/>
						{/each}
						{#each stages as stage, i (stage.label)}
							{@const x = step * i + step / 2}
							{@const y = context.height / 2}
							<!-- On a wide step the label sits inside it; on a thin one, above it. -->
							{@const inside = points[i].value > 30}
							<Text
								{x}
								y={inside ? y - 4 : y - (points[i].value / 100) * (context.height / 2) - 26}
								value={percent.format(stage.amount / first)}
								textAnchor="middle"
								verticalAnchor="end"
								class="text-2xl font-semibold tabular-nums {inside
									? 'fill-white'
									: 'fill-foreground'}"
							/>
							<Text
								{x}
								y={inside ? y + 2 : y - (points[i].value / 100) * (context.height / 2) - 22}
								value="{stage.label} · {compact.format(stage.amount)}"
								textAnchor="middle"
								verticalAnchor="start"
								class="text-xs {inside ? 'fill-white/85' : 'fill-muted-foreground'}"
							/>
						{/each}
					{/snippet}
				</AreaChart>
			{/snippet}
		</LazyChart>
	</div>
</figure>
