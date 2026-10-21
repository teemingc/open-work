<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { waffleCells } from './financials';

	let {
		backers,
		money,
		period
	}: {
		/** Top backers, biggest first, and an "others" row without a slug. */
		backers: { slug: string; name: string; amount: number; channel: boolean }[];
		money: Intl.NumberFormat;
		/** When the contributions were made, like "in the last year". */
		period: string;
	} = $props();

	// Categorical hues in a fixed order for named backers, then pale outlined neutrals for the groups, so the
	// people who can be named carry the most weight. More than four named backers would need more hues than can
	// be told apart, so the rest fold into groups. No pink, so GitHub Sponsors' pink stays its own.
	const NAMED = 4;
	const SWATCHES = ['bg-chart-1', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
	const GROUPED = 'inset-ring inset-ring-chart-other';
	/** Platforms in their own brand colour, so they read as the platform rather than a backer. */
	const CHANNEL_SWATCHES: Record<string, string> = {
		'github-sponsors': 'bg-chart-github-sponsors'
	};

	const groups = $derived.by(() => {
		const people = backers.filter((backer) => backer.slug && !backer.channel);
		const named = people.slice(0, NAMED);
		const rest = people.slice(NAMED);
		const channels = backers.filter((backer) => backer.channel);
		const others = backers.find((backer) => !backer.slug);
		return [
			...named.map((backer, index) => ({
				key: backer.slug,
				label: backer.name,
				amount: backer.amount,
				swatch: SWATCHES[index]
			})),
			...(rest.length
				? [
						{
							key: 'rest',
							label: `${rest.length} more top ${rest.length === 1 ? 'backer' : 'backers'}`,
							amount: rest.reduce((sum, backer) => sum + backer.amount, 0),
							swatch: `bg-chart-more-backers ${GROUPED}`
						}
					]
				: []),
			// Platforms and everyone else, biggest first.
			...[
				...channels.map((channel) => ({
					key: channel.slug,
					label: `Via ${channel.name}`,
					amount: channel.amount,
					swatch: CHANNEL_SWATCHES[channel.slug] ?? 'bg-chart-other'
				})),
				...(others
					? [
							{
								key: 'others',
								label: others.name,
								amount: others.amount,
								swatch: `bg-chart-others ${GROUPED}`
							}
						]
					: [])
			].sort((a, b) => b.amount - a.amount)
		];
	});
	const total = $derived(groups.reduce((sum, group) => sum + group.amount, 0));
	const counts = $derived(waffleCells(groups.map((group) => group.amount)));
	/** One entry per square, in group order, so each group fills a run of squares. */
	const cells = $derived(
		counts.flatMap((count, index) => Array.from({ length: count }, () => index))
	);

	let hovered = $state<number | undefined>();
	/** A touch pointer leaves as soon as the finger lifts, so keep a tapped group picked out. */
	function leave(event: PointerEvent) {
		if (event.pointerType === 'mouse') hovered = undefined;
	}
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
</script>

<Card.Root class="@container lg:col-span-2">
	<Card.Header>
		<Card.Title>Who funds the collective</Card.Title>
		<Card.Description>Each square is 1% of contributions {period}.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		<!--
			A band across the full card width, so each group reads as a run like a stacked bar. Hovering
			a square picks out its group, as hovering its row below does; on touch, tapping does. One
			listener for the band, read from the square under the pointer, rather than one on each of
			the hundred squares.
		-->
		<div
			class="grid aspect-[4/1] w-full grid-cols-20 gap-0.5 select-none [-webkit-touch-callout:none] @xl:aspect-[25/4] @xl:grid-cols-25"
			role="img"
			aria-label={groups.map((group, index) => `${group.label}: ${counts[index]}%`).join(', ')}
			onpointerover={(event) => {
				const group = (event.target as HTMLElement).dataset.group;
				if (group !== undefined) hovered = Number(group);
			}}
			onpointerleave={leave}
		>
			{#each cells as group, index (index)}
				<div
					data-group={group}
					class="rounded-[2px] transition-opacity {groups[group].swatch} {hovered !== undefined &&
					hovered !== group
						? 'opacity-25'
						: ''}"
				></div>
			{/each}
		</div>
		<!-- Two columns on wide cards, still ranked top to bottom. -->
		<ul class="flex flex-col gap-1 text-sm @xl:block @xl:columns-2 @xl:gap-x-12">
			{#each groups as group, index (group.key)}
				<li
					class={[
						'flex break-inside-avoid items-center gap-2 rounded-md px-2 py-1',
						hovered === index && 'bg-muted'
					]}
					onpointerenter={() => (hovered = index)}
					onpointerleave={leave}
				>
					<span class="size-2.5 shrink-0 rounded-[2px] {group.swatch}" aria-hidden="true"></span>
					<span class="min-w-0 flex-1 truncate">{group.label}</span>
					<span class="text-muted-foreground tabular-nums">
						{percent.format(total ? group.amount / total : 0)}
					</span>
					<span class="w-20 text-right tabular-nums">{money.format(group.amount)}</span>
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
