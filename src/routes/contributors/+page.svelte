<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowDown, ArrowUp, Minus } from '@lucide/svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { moneyFormat } from '../collective/[handle]/chart-format';
	import { MIN_CONTRIBUTION, standings, yearlyRanks, type RankBy } from './contributors';
	import { getContributors } from './contributors.remote';
	import RankRace from './RankRace.svelte';

	const CHARTED = 10;

	/** `undefined` until the first scan is stored, which takes too long to wait on. */
	const result = $derived(await getContributors());
	const contributors = $derived(result?.contributors ?? []);

	const by: RankBy = $derived(page.url.searchParams.get('by') === 'all-time' ? 'total' : 'recent');
	const table = $derived(standings(contributors, by));
	const ranked = $derived(table.filter((row) => row.rank));
	const sum = $derived(ranked.reduce((total, row) => total + row.contributor[by], 0));
	/**
	 * What those with anything to rank by gave, in either ranking. The sentence for each takes the same
	 * room, so the toggle below it stays under the pointer.
	 */
	const summaries = $derived(
		(['recent', 'total'] as const).map((either) => {
			const giving = contributors.filter((c) => c[either] > 0);
			return {
				by: either,
				count: giving.length,
				sum: giving.reduce((total, c) => total + c[either], 0)
			};
		})
	);
	const most = $derived(ranked[0]?.contributor[by] ?? 0);

	/** The chart follows the top of the table; any more lines and none could be told apart. */
	const charted = $derived(ranked.slice(0, CHARTED).map((row) => row.contributor));
	/**
	 * Those charted in either ranking, so the chart keeps one height as the ranking changes and
	 * nothing below it moves.
	 */
	const chartedEither = $derived(
		(['recent', 'total'] as const).flatMap((either) =>
			standings(contributors, either)
				.filter((row) => row.rank)
				.slice(0, CHARTED)
				.map((row) => row.contributor)
		)
	);

	const thisYear = $derived(new Date(result?.fetchedAt ?? Date.now()).getUTCFullYear());
	const race = $derived(yearlyRanks(contributors, thisYear));

	const money = moneyFormat('USD');
	const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

	let highlighted = $state<string | null>(null);

	const description =
		'The companies and people that fund open source projects on Open Collective, ranked by how much they have contributed.';

	const RANK_BY: { by: RankBy; label: string; search: '' | '?by=all-time' }[] = [
		{ by: 'recent', label: 'Past 12 months', search: '' },
		{ by: 'total', label: 'All time', search: '?by=all-time' }
	];
</script>

<svelte:head>
	<title>Leaderboard · Open Work</title>
	<meta property="og:title" content="Leaderboard · Open Work" />
	<meta name="description" content={description} />
	<meta property="og:description" content={description} />
</svelte:head>

<article>
	<!--
		The ranking is chosen above the chart, as it changes both. The sentence above the toggle keeps
		the room of its longer version, so the toggle stays under the pointer while the chart and table
		below change height.
	-->
	<header class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
		<div class="max-w-3xl">
			<h1>Top contributors</h1>
			{#if result}
				<!-- Both sentences share one cell, the other one hidden, so the taller sets its height. -->
				<div class="mt-3 grid max-w-2xl text-pretty text-muted-foreground">
					{#each summaries as summary (summary.by)}
						<p class={['col-start-1 row-start-1', { invisible: summary.by !== by }]}>
							These {summary.count} contributors have contributed a total of {money.format(
								summary.sum
							)}
							to other collectives {summary.by === 'recent'
								? 'in the past 12 months'
								: 'since joining Open Collective'}.
						</p>
					{/each}
				</div>
			{:else}
				<p class="mt-3 max-w-2xl text-pretty text-muted-foreground">
					The standings are being gathered from Open Collective. Check back shortly.
				</p>
			{/if}
		</div>
		{#if result}
			<nav aria-label="Rank by" class="flex shrink-0 rounded-md border bg-card p-0.5 text-sm">
				{#each RANK_BY as option (option.by)}
					<a
						href={resolve(`/contributors${option.search}`)}
						data-sveltekit-reset="false"
						data-sveltekit-replacestate
						aria-current={by === option.by ? 'page' : undefined}
						class="rounded-[calc(var(--radius)-2px)] px-3 py-1 text-muted-foreground hover:text-foreground aria-[current]:bg-primary aria-[current]:text-primary-foreground"
					>
						{option.label}
					</a>
				{/each}
			</nav>
		{/if}
	</header>

	{#if result}
		<section
			aria-labelledby="race-heading"
			class="mt-8 rounded-xl border bg-card px-3 pt-4 pb-3 sm:px-6"
		>
			<h2 id="race-heading" class="sr-only">Rank by year</h2>
			<RankRace
				contributors={charted}
				roomFor={chartedEither}
				years={race.years}
				ranks={race.ranks}
				partialYear={thisYear}
				bind:highlighted
			/>
		</section>

		<section aria-labelledby="standings-heading" class="mt-10">
			<!-- The double rule closes the heading, like the masthead and a ledger's totals. -->
			<h2
				id="standings-heading"
				class="border-b-[3px] border-double border-rule pb-3 font-display text-2xl font-semibold text-primary"
			>
				Standings
			</h2>

			<div class="mt-4 overflow-x-auto rounded-xl border bg-card text-sm">
				<table class="ledger">
					<caption class="sr-only">
						Contributions by contributor, ranked by {by === 'recent'
							? 'the past 12 months'
							: 'all time'}, with places moved since a year ago
					</caption>
					<thead class="text-xs">
						<tr>
							<th class="py-2 pr-1 pl-3 sm:pl-4">Rank</th>
							<th class="px-3 py-2">Contributor</th>
							<th class="px-3 py-2 text-right">{by === 'recent' ? 'Past 12 months' : 'All time'}</th
							>
							<th class="hidden w-1/4 px-3 py-2 md:table-cell">Share</th>
							<th class="hidden py-2 pr-4 pl-3 text-right sm:table-cell">
								{by === 'recent' ? 'All time' : 'Past 12 months'}
							</th>
						</tr>
					</thead>
					<tbody>
						<!-- Rows slide to their new places when the ranking changes, so you can see who moved. -->
						{#each table as { contributor, rank, moved } (contributor.slug)}
							{const amount = contributor[by]}
							{const other = by === 'recent' ? contributor.total : contributor.recent}
							<tr
								animate:flip={{
									duration: prefersReducedMotion.current ? 0 : 250,
									easing: cubicOut
								}}
								class={{ followed: highlighted === contributor.slug }}
								onpointerenter={(event) => {
									if (event.pointerType !== 'touch') highlighted = contributor.slug;
								}}
								onpointerleave={(event) => {
									if (event.pointerType !== 'touch') highlighted = null;
								}}
								onfocusin={() => (highlighted = contributor.slug)}
								onfocusout={() => (highlighted = null)}
							>
								<!-- Places moved since a year ago sit beside the place, as in a league table. -->
								<td class="py-2.5 pr-1 pl-3 sm:pl-4">
									<div class="flex items-center gap-2">
										<span class="w-6 text-right font-display text-xl text-primary">
											{#if rank}
												{rank}
											{:else}
												<span class="sr-only">Not placed</span>
											{/if}
										</span>
										<span class="w-8 text-xs">
											{#if moved === null}
												<!-- New to the ranking: marked beside the name. -->
											{:else if moved > 0}
												<span class="inline-flex items-center gap-0.5 text-status-paid">
													<ArrowUp size={12} aria-hidden="true" />
													{moved}
													<span class="sr-only">{moved === 1 ? 'place' : 'places'} up</span>
												</span>
											{:else if moved < 0}
												<span class="inline-flex items-center gap-0.5 text-muted-foreground">
													<ArrowDown size={12} aria-hidden="true" />
													{-moved}
													<span class="sr-only">{moved === -1 ? 'place' : 'places'} down</span>
												</span>
											{:else}
												<span class="inline-flex items-center text-muted-foreground">
													<Minus size={12} aria-hidden="true" />
													<span class="sr-only">Same place as a year ago</span>
												</span>
											{/if}
										</span>
									</div>
								</td>
								<th scope="row" class="px-3 py-2.5 font-normal">
									<div class="flex min-w-0 items-center gap-2">
										<a
											href={resolve('/collective/[handle]', { handle: contributor.slug })}
											class="flex min-w-0 items-center gap-2.5 font-medium hover:underline"
										>
											{#if contributor.imageUrl}
												<img
													src={contributor.imageUrl}
													alt=""
													class="size-6 shrink-0 rounded-full border bg-card object-cover"
													loading="lazy"
												/>
											{:else}
												<span class="size-6 shrink-0 rounded-full border bg-muted"></span>
											{/if}
											<span class="truncate">{contributor.name}</span>
										</a>
										{#if rank && moved === null}
											<span class="shrink-0 rounded-sm bg-accent px-1.5 text-xs text-primary"
												>New</span
											>
										{/if}
									</div>
								</th>
								<td
									class={['px-3 py-2.5 text-right', rank ? 'font-medium' : 'text-muted-foreground']}
								>
									{money.format(amount)}
								</td>
								<td class="hidden px-3 py-2.5 md:table-cell">
									{#if rank}
										<div class="flex items-center gap-2">
											<!-- As long as the leader's is full, so the gaps between places show. -->
											<div class="h-1.5 flex-1">
												<div
													class="h-full rounded-full bg-primary"
													style:width="{(amount / most) * 100}%"
												></div>
											</div>
											<span class="w-9 text-right text-muted-foreground">
												{percent.format(amount / sum)}
											</span>
										</div>
									{/if}
								</td>
								<td class="hidden py-2.5 pr-4 pl-3 text-right text-muted-foreground sm:table-cell">
									{money.format(other)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="mt-3 max-w-2xl text-xs text-pretty text-muted-foreground">
				Includes those who have contributed {money.format(MIN_CONTRIBUTION)} or more in the past two years
				directly through Open Source Collective, Open Source Europe and NumFOCUS: the {contributors.length}
				who gave the most.
			</p>
		</section>
	{/if}
</article>

<style>
	/*
	 * Following a contributor from the chart or the table marks its row, over the ledger's banding. At
	 * once, with no transition: it tracks the pointer down the rows. Not on a tap, which would only
	 * flash it.
	 */
	tr.followed {
		background-color: var(--accent);
	}
</style>
