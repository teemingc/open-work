<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { TransitionConfig } from 'svelte/transition';
	import type { Contributor } from './contributors';

	let {
		contributors,
		roomFor,
		years,
		ranks,
		partialYear,
		highlighted = $bindable()
	}: {
		/** In order of place, the first drawn darkest. */
		contributors: Contributor[];
		/** Room is kept for these too, so the chart keeps its height when they replace the others. */
		roomFor: Contributor[];
		years: number[];
		/** Each slug's place in each of `years`, `null` in years it contributed nothing. */
		ranks: Map<string, (number | null)[]>;

		/** The year still in progress, labelled as such. */
		partialYear: number;
		/** The slug followed, from a line here or a row in the table. */
		highlighted: string | null;
	} = $props();

	/*
	 * Nothing here is measured. Years sit at percentages across the plot and each curve stretches to
	 * fit between two of them, so the chart is drawn right on the server, at any width. Phones get
	 * their own layout of the last five years, which CSS picks by the chart's width.
	 */

	const ROW = 26;
	/** Room above the first place for the years. */
	const TOP = 40;
	/** The lowest place drawn. A line below it leaves the chart until it climbs back. */
	const MAX_PLACE = 20;
	/** Years shown on phones, so each still has room. */
	const PHONE_YEARS = 5;

	const y = (rank: number) => TOP + (rank - 0.5) * ROW;

	/**
	 * Open Collective's navy for the first place, through its bright blue, to a pale blue for the last
	 * drawn, so the eye goes to the top of the table first. Passing through the bright blue keeps
	 * neighbouring places apart: straight from navy to pale blue, the top half all reads as dark.
	 */
	function tint(index: number): string {
		const t = index / Math.max(1, contributors.length - 1);
		if (t <= 0.4)
			return `color-mix(in oklab, var(--primary) ${100 - (t / 0.4) * 100}%, var(--ring))`;
		return `color-mix(in oklab, var(--ring) ${100 - ((t - 0.4) / 0.6) * 100}%, #b3cdfa)`;
	}

	/** The first place drawn thickest, the last thinnest, as a second cue to the order. */
	function weight(index: number): number {
		return 3 - (index / Math.max(1, contributors.length - 1)) * 1.75;
	}

	interface Point {
		/** Across the plot, as a percentage. */
		x: number;
		rank: number;
	}

	interface Line {
		contributor: Contributor;
		color: string;
		weight: number;
		points: Point[];
		/** A smooth step between each pair of years both ranked, broken over years with nothing. */
		steps: { from: Point; to: Point }[];
		/** Its last point: beside the last year when ranked then. */
		end: Point | undefined;
		current: boolean;
	}

	interface Layout {
		name: 'wide' | 'phone';
		years: number[];
		x: (i: number) => number;
		rows: number;
		height: number;
		lines: Line[];
	}

	function layout(name: Layout['name'], shown: number): Layout {
		const visible = years.slice(shown);
		const x = (i: number) => (visible.length > 1 ? (i / (visible.length - 1)) * 100 : 50);
		const lines = contributors
			.map((contributor, index): Line => {
				const all = (ranks.get(contributor.slug)?.slice(shown) ?? []).map((rank) =>
					rank !== null && rank <= MAX_PLACE ? rank : null
				);
				const points = all.flatMap((rank, i) => (rank === null ? [] : [{ x: x(i), rank }]));
				const steps = all.flatMap((rank, i) => {
					const before = all[i - 1];
					return rank === null || before === null || before === undefined
						? []
						: [{ from: { x: x(i - 1), rank: before }, to: { x: x(i), rank } }];
				});
				const end = points.at(-1);
				return {
					contributor,
					color: tint(index),
					weight: weight(index),
					points,
					steps,
					end,
					current: all.at(-1) !== null && all.at(-1) !== undefined
				};
			})
			.filter((line) => line.points.length);
		const rows = Math.max(
			1,
			...[...contributors, ...roomFor].flatMap((contributor) =>
				(ranks.get(contributor.slug)?.slice(shown) ?? []).filter(
					(rank): rank is number => rank !== null && rank <= MAX_PLACE
				)
			)
		);
		return { name, years: visible, x, rows, height: TOP + rows * ROW + 8, lines };
	}

	const layouts = $derived([
		layout('wide', 0),
		layout('phone', Math.max(0, years.length - PHONE_YEARS))
	]);

	/**
	 * Follows a line under a mouse or pen. A tap on a touch screen would only flash the highlight on
	 * and off, as it enters and leaves at once.
	 */
	function follow(event: PointerEvent, slug: string) {
		if (event.pointerType !== 'touch') highlighted = slug;
	}
	function unfollow(event: PointerEvent) {
		if (event.pointerType !== 'touch') highlighted = null;
	}

	/**
	 * Until the lines finish opening on the first load. The names wait for them then, and only then:
	 * names that appear when the ranking changes fade in straight away.
	 */
	let intro = $state(true);

	/** A quick fade for what joins the chart, unless motion is reduced. */
	const JOIN = 200;
	const joinDuration = $derived(prefersReducedMotion.current ? 0 : JOIN);

	/**
	 * Fades in what joins the chart. A line fades through the opacity its marks inherit: opacity on
	 * the group would have Chrome paint the stretched curves small and scale them up, blurred.
	 */
	function join(_node: Element, what: 'line' | 'name'): TransitionConfig {
		return {
			duration: joinDuration,
			easing: cubicOut,
			css: (t) => (what === 'line' ? `stroke-opacity: ${t}; fill-opacity: ${t}` : `opacity: ${t}`)
		};
	}

	/** The followed line last, so it is drawn over the others. */
	function inDrawingOrder(lines: Line[]): Line[] {
		return lines.toSorted(
			(a, b) =>
				Number(a.contributor.slug === highlighted) - Number(b.contributor.slug === highlighted)
		);
	}
</script>

<div
	class={['race', { intro }]}
	role="img"
	aria-label="Each top contributor's place by the year, from {years[0]} to {partialYear}. The table below has the figures."
>
	{#each layouts as { name, years: shownYears, x, rows, height, lines } (name)}
		<div class={['layout', name, { following: highlighted !== null }]} style:height="{height}px">
			<div class="places">
				{#each { length: rows }, r (r)}
					<span class="place" style:top="{y(r + 1)}px">{r + 1}</span>
				{/each}
			</div>

			<div class="plot">
				{#each shownYears as year, i (year)}
					<span class="year" style:left="{x(i)}%">
						{year}
						{#if year === partialYear}<span class="note">so far</span>{/if}
					</span>
				{/each}

				<svg
					class="lines"
					width="100%"
					{height}
					aria-hidden="true"
					onanimationend={(event) => {
						if (event.target === event.currentTarget) intro = false;
					}}
				>
					{#each shownYears as year, i (year)}
						<line x1="{x(i)}%" x2="{x(i)}%" y1={TOP - 4} y2={height - 8} class="grid" />
					{/each}
					{#each inDrawingOrder(lines) as line (line.contributor.slug)}
						{const slug = line.contributor.slug}
						<g
							in:join={'line'}
							role="presentation"
							class={['line', { followed: highlighted === slug }]}
							style:--tint={line.color}
							style:--weight="{line.weight}px"
							onpointerenter={(event) => follow(event, slug)}
							onpointerleave={unfollow}
						>
							{#each line.steps as { from, to } (from.x)}
								<!-- Stretched across the gap between two years; the stroke keeps its width. -->
								<svg
									x="{from.x}%"
									width="{to.x - from.x}%"
									{height}
									viewBox="0 0 1 {height}"
									preserveAspectRatio="none"
									overflow="visible"
								>
									{#each ['hit', 'stroke'] as kind (kind)}
										<path
											d="M0,{y(from.rank)} C0.5,{y(from.rank)} 0.5,{y(to.rank)} 1,{y(to.rank)}"
											class={kind}
										/>
									{/each}
								</svg>
							{/each}
							{#each line.points as point (point.x)}
								<circle cx="{point.x}%" cy={y(point.rank)} class="dot" />
								<text
									x="{point.x}%"
									y={y(point.rank)}
									text-anchor="middle"
									dominant-baseline="central"
									class="dot-rank">{point.rank}</text
								>
							{/each}
						</g>
					{/each}
				</svg>

				{#each lines as line (line.contributor.slug)}
					{const slug = line.contributor.slug}
					{#if line.end}
						<span
							in:join={'name'}
							role="presentation"
							class={[
								'label',
								{
									current: line.current,
									followed: highlighted === slug,
									faded: highlighted !== null && highlighted !== slug
								}
							]}
							style:left="{line.end.x}%"
							style:top="{y(line.end.rank)}px"
							style:--room="{x(1) - x(0)}%"
							style:--tint={line.color}
							title={line.contributor.name}
							onpointerenter={(event) => follow(event, slug)}
							onpointerleave={unfollow}
						>
							{#if line.current}
								<!-- Its logo where the line reaches this year, a disc in its colour without one. -->
								<span class="logo">
									{#if line.contributor.imageUrl}
										<img src={line.contributor.imageUrl} alt="" loading="lazy" />
									{/if}
								</span>
							{/if}
							<span class="name">{line.contributor.name}</span>
						</span>
					{/if}
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	/* The chart's own width picks the layout, whatever the page around it does. */
	.race {
		container-type: inline-size;
		font-variant-numeric: tabular-nums lining-nums;
	}
	.layout {
		--places: 28px;
		/* Room for names at the end of the lines. */
		--names: 140px;
		position: relative;
		display: grid;
		grid-template-columns: var(--places) 1fr var(--names);
		column-gap: 12px;
	}
	.layout.phone {
		--names: 116px;
		display: none;
	}
	@container (width < 520px) {
		.layout.wide {
			display: none;
		}
		.layout.phone {
			display: grid;
		}
	}

	.places,
	.plot {
		position: relative;
	}
	.place,
	.year,
	.label {
		position: absolute;
		white-space: nowrap;
	}
	.place {
		right: 6px;
		translate: 0 -50%;
		font-family: var(--font-display);
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.year {
		top: 6px;
		translate: -50% 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		font-family: var(--font-display);
		font-size: 13px;
		line-height: 1.1;
		color: var(--heading);
	}
	.note {
		font-family: var(--font-serif);
		font-size: 11px;
		color: var(--muted-foreground);
	}

	.lines {
		position: absolute;
		inset: 0;
		overflow: visible;
	}
	.grid {
		stroke: var(--border);
		stroke-dasharray: 2 3;
	}

	/* Following a line changes at once, with no transition: it tracks the pointer across lines. */
	.line {
		cursor: default;
	}
	.hit,
	.stroke {
		fill: none;
		vector-effect: non-scaling-stroke;
	}
	.hit {
		stroke: transparent;
		stroke-width: 12;
	}
	.stroke {
		stroke: var(--tint);
		stroke-width: var(--weight);
	}
	.dot {
		r: 3.5;
		fill: var(--tint);
		stroke: var(--card);
		stroke-width: 1.5;
	}
	.dot-rank {
		font-family: var(--font-display);
		font-size: 10px;
		fill: var(--primary-foreground);
		opacity: 0;
		pointer-events: none;
	}

	/* Following one line fades the rest, and labels its dots with its place. */
	/*
	 * Faded through each mark's own opacity, not the line's: opacity on the group has Chrome paint a
	 * stretched curve at its tiny internal size and scale it up, blurred.
	 */
	.following .line:not(.followed) .stroke {
		stroke-opacity: 0.25;
	}
	.following .line:not(.followed) .dot {
		fill-opacity: 0.25;
		stroke-opacity: 0.25;
	}
	.followed .stroke {
		stroke-width: 4;
	}
	.followed .dot {
		r: 9;
	}
	.followed .dot-rank {
		opacity: 1;
	}

	/*
	 * A name sits beside its line's last point; one ranked this year also has its logo on the point,
	 * and one that ended in an earlier year is muted, as it is no longer in the race.
	 */
	.label {
		display: flex;
		align-items: center;
		gap: 8px;
		translate: 14px -50%;
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.label.current,
	.label.followed {
		color: var(--foreground);
	}
	/* One that ended in an earlier year stops short of the next year's points. */
	.label:not(.current) {
		max-width: calc(var(--room) - 34px);
	}
	.label.current {
		/* Centres the logo on the point, and lets the name run into the room kept for it. */
		translate: -10.5px -50%;
		max-width: calc(var(--names) + 22px);
	}
	.label.followed {
		max-width: none;
		font-weight: 600;
	}
	.label.faded {
		opacity: 0.35;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.logo {
		flex: none;
		width: 21px;
		height: 21px;
		overflow: hidden;
		border: 2px solid var(--tint);
		border-radius: 50%;
		background: var(--tint);
	}
	.logo:has(img) {
		background: var(--card);
	}
	.logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/*
	 * The lines open left to right as the page loads, so the years play out in order, and the names
	 * fade in as the reveal reaches the last column. Only while the page loads: CSS animations replay
	 * whenever an element moves, and lines and names move as the ranking or the followed line changes.
	 * After that, lines and names that join fade in through `in:` transitions, which play only when
	 * they are added, and lines that stay ease to their new colour.
	 */
	@media (prefers-reduced-motion: no-preference) {
		.lines {
			/* Ease in and out, so the years pass at an even pace rather than rushing out and crawling in. */
			animation: reveal 1200ms cubic-bezier(0.45, 0, 0.25, 1) both;
		}
		.intro .label {
			animation: appear 200ms cubic-bezier(0.19, 1, 0.22, 1) 850ms backwards;
		}
		.stroke,
		.dot {
			transition:
				stroke 200ms ease,
				fill 200ms ease;
		}
		.logo {
			transition:
				border-color 200ms ease,
				background-color 200ms ease;
		}
	}
	/* Wider than the plot, so dots on the first and last years are not cut. */
	@keyframes reveal {
		from {
			clip-path: inset(-20px calc(100% + 20px) -20px -20px);
		}
		to {
			clip-path: inset(-20px -20px -20px -20px);
		}
	}
	@keyframes appear {
		from {
			opacity: 0;
		}
	}
</style>
