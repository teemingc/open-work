<script lang="ts" module>
	export interface Stat {
		label: string;
		value: string;
		note: string;
		/** A text colour class for the value, like `text-destructive`. */
		tone?: string;
		/** Progress towards a goal, drawn as a ring beside the value with its label inside. */
		ring?: { value: number; label: string };
		/** A small badge beside the label: a trend, a warning, or a share. */
		badge?: {
			text: string;
			icon?: 'up' | 'down' | 'hourglass';
			tone?: string;
			/**
			 * What the badge means, opened by hovering with a mouse, or by tapping it on a touch screen,
			 * where there is no hover. An aside, like what a forecast leaves out, goes after it in a paragraph of its own.
			 */
			detail?: string;
			aside?: string;
		};
	}
</script>

<script lang="ts">
	import { Badge, badgeVariants } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { cn } from '#lib/utils.js';
	import { Hourglass, TrendingDown, TrendingUp } from '@lucide/svelte';
	import ProgressRing from '#lib/components/ProgressRing.svelte';

	let { stats }: { stats: Stat[] } = $props();

	const ICONS = { up: TrendingUp, down: TrendingDown, hourglass: Hourglass };

	/**
	 * Columns for the number of figures, by the width of the page's `main` rather than the window, so a short strip leaves no empty cell showing the divider colour.
	 * Three sit in one row, as two columns would leave the fourth cell empty. Five in one row squeezes
	 * the labels onto two lines, so five sit on six columns as two over three, from as soon as a third
	 * fits. Narrower, the first takes a row of its own.
	 */
	const columns = $derived(
		stats.length >= 5
			? '@xl/main:grid-cols-2 @3xl/main:grid-cols-6'
			: stats.length === 4
				? '@xl/main:grid-cols-2 @5xl/main:grid-cols-4'
				: stats.length === 3
					? '@xl/main:grid-cols-3'
					: stats.length === 2
						? '@xl/main:grid-cols-2'
						: ''
	);
	/** A lone figure leads, larger and with its note beside it, rather than sitting in an empty strip. */
	const lone = $derived(stats.length === 1);

	/**
	 * Whether a figure has a row of its own between two and six columns. It is laid out like a lone
	 * figure there, so the row is filled rather than stretched, and its badge stays in line with those below.
	 */
	function leads(index: number) {
		return stats.length === 5 && index === 0;
	}
</script>

<!-- One compact strip of figures. Gaps over a border-coloured background draw even dividers. -->
<Card.Root class="gap-0 overflow-hidden py-0">
	<dl class={['grid grid-cols-1 gap-px bg-border', columns]}>
		{#each stats as stat, index (stat.label)}
			<!--
				With an odd number in two columns, the first takes a row of its own. With five on six columns,
				the first two take half a row each and the rest a third. Each figure's label, value and note
				share rows with its neighbours', so a label that wraps keeps the values in line.
			-->
			<div
				class={[
					'@container/card min-w-0 bg-card',
					stat.ring !== undefined && 'relative pr-24',
					lone
						? 'flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4'
						: 'row-span-3 grid grid-rows-subgrid gap-y-1 px-4 py-3',
					leads(index) &&
						'@xl/main:flex @xl/main:flex-wrap @xl/main:items-baseline @xl/main:gap-x-3 @3xl/main:grid @3xl/main:gap-x-0',
					stats.length === 5 &&
						(index === 0
							? '@xl/main:col-span-2 @3xl/main:col-span-3'
							: index === 1
								? '@3xl/main:col-span-3'
								: '@3xl/main:col-span-2')
				]}
			>
				<!--
					As tall as a badge with or without one, so a badge coming or going moves nothing. A long
					label wraps beside the badge rather than running under it, and labels sit at the top so a
					one-line label lines up with a neighbour that wraps. In a cell too narrow for most labels and
					badges side by side, every badge goes under its label, so one that fits never sits beside a
					neighbour's that didn't. The label measures its own width rather than the cell's, as the grid
					sizes its rows before a cell's width would apply.
				-->
				<dt
					class={[
						'@container text-sm text-muted-foreground',
						lone && 'basis-full',
						leads(index) && '@xl/main:basis-full'
					]}
				>
					<div
						class="flex min-h-5.5 flex-wrap items-start justify-between gap-x-2 gap-y-1 @max-[13rem]:flex-col @max-[13rem]:flex-nowrap"
					>
						<span class="leading-5.5">{stat.label}</span>
						{#if stat.badge}
							{const Icon = $derived(stat.badge.icon && ICONS[stat.badge.icon])}
							{#if stat.badge.detail}
								<Popover.Root>
									<Popover.Trigger openOnHover openDelay={200}>
										{#snippet child({ props })}
											<button
												{...props}
												class={cn(
													badgeVariants({ variant: 'outline' }),
													// A 40px target around a badge too small to tap.
													'relative overflow-visible after:absolute after:-inset-x-1 after:-inset-y-2.5 hover:bg-muted',
													stat.badge?.tone
												)}
											>
												{#if Icon}<Icon aria-hidden="true" />{/if}
												{stat.badge?.text}
											</button>
										{/snippet}
									</Popover.Trigger>
									<Popover.Content class="w-64 space-y-2 p-3 text-sm whitespace-normal" align="end">
										<p>{stat.badge.detail}</p>
										{#if stat.badge.aside}
											<p class="text-muted-foreground">{stat.badge.aside}</p>
										{/if}
									</Popover.Content>
								</Popover.Root>
							{:else}
								<Badge variant="outline" class={stat.badge.tone}>
									{#if Icon}<Icon />{/if}
									{stat.badge.text}
								</Badge>
							{/if}
						{/if}
					</div>
				</dt>
				<dd
					class={[
						'font-display font-medium tabular-nums',
						lone ? 'text-4xl leading-tight' : 'text-2xl @[250px]/card:text-3xl',
						leads(index) && '@xl/main:text-3xl',
						stat.tone
					]}
				>
					{stat.value}
					<!--
						Placed against the whole figure, as tall as its three rows at its right edge, which the
						figure keeps clear. Inside the value, so its label is read with it.
					-->
					{#if stat.ring !== undefined}
						<ProgressRing
							value={stat.ring.value}
							label={stat.ring.label}
							class="absolute top-1/2 right-4 size-16 -translate-y-1/2"
						/>
					{/if}
				</dd>
				<dd class={['text-muted-foreground', lone ? 'text-sm' : 'text-xs']}>{stat.note}</dd>
			</div>
		{/each}
	</dl>
</Card.Root>
