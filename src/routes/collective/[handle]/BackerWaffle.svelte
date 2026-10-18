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
		/** When the contributions were made, like "in the last 12 months". */
		period: string;
	} = $props();

	// Categorical hues in a fixed order for named backers, then neutrals for the groups. More than four named
	// backers would need more hues than can be told apart, so the rest fold into groups.
	const NAMED = 4;
	const SWATCHES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4'];

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
							swatch: 'bg-chart-other'
						}
					]
				: []),
			// Platforms and everyone else, biggest first.
			...[
				...channels.map((channel) => ({
					key: channel.slug,
					label: `Via ${channel.name}`,
					amount: channel.amount,
					swatch: 'bg-muted-foreground/45'
				})),
				...(others
					? [
							{
								key: 'others',
								label: others.name,
								amount: others.amount,
								swatch: 'bg-muted-foreground/20'
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
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
</script>

<Card.Root class="@container lg:col-span-2">
	<Card.Header>
		<Card.Title>Who funds the collective</Card.Title>
		<Card.Description>Each square is 1% of contributions {period}.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		<!-- A square on narrow cards; a band across wide ones, so each group reads as a run like a stacked bar. -->
		<div
			class="grid aspect-square w-full max-w-56 grid-cols-10 gap-0.5 @xl:aspect-[25/4] @xl:max-w-none @xl:grid-cols-25"
			role="img"
			aria-label={groups.map((group, index) => `${group.label}: ${counts[index]}%`).join(', ')}
		>
			{#each cells as group, index (index)}
				<div
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
					class="flex break-inside-avoid items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
					onpointerenter={() => (hovered = index)}
					onpointerleave={() => (hovered = undefined)}
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
