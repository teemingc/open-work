<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { collectiveLogo, SUGGESTED_COLLECTIVES } from '#lib/collective-suggestions.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { ChevronRight } from '@lucide/svelte';
	import { getSettings } from '#lib/settings.remote.js';
	import CollectiveSearch from './CollectiveSearch.svelte';
	import Dashboard from './Dashboard.svelte';
	import { getCollectiveStats } from './stats.remote';

	/** The collective in the address, else the one you invoice from settings. */
	const slug = $derived(
		page.url.searchParams.get('slug')?.trim().toLowerCase() ||
			(await getSettings()).collectiveSlug ||
			''
	);
</script>

<svelte:head><title>Collective · Open Work</title></svelte:head>

{#if slug}
	<!--
		Your account is awaited with the stats (Svelte runs the two in parallel), so the page appears
		complete. Arriving later, it would add the "Paid to you" card and reshape the charts after the
		page was already on screen.
	-->
	<Dashboard data={await getCollectiveStats(slug)} me={(await getMe())?.slug} />
{:else}
	<!-- One narrow column: the search, then a short list that reads as its first results. -->
	<div class="mx-auto flex max-w-md flex-col gap-6 pt-10 sm:pt-16">
		<div class="space-y-2 text-center">
			<h1>See how a collective is doing</h1>
			<p class="text-muted-foreground">Its balance, runway and who funds it.</p>
		</div>
		<CollectiveSearch name="Search Open Collective" field />
		<nav aria-label="Suggested collectives" class="overflow-hidden rounded-xl border bg-card">
			<ul class="divide-y">
				{#each SUGGESTED_COLLECTIVES as collective (collective.slug)}
					<li>
						<a
							href="{resolve('/collective')}?slug={collective.slug}"
							class="group flex items-center gap-3 px-3.5 py-2.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
						>
							<img
								src={collectiveLogo(collective.slug)}
								alt=""
								class="size-8 shrink-0 rounded-md border bg-card object-contain"
								loading="lazy"
							/>
							<span class="min-w-0 flex-1">
								<span class="block font-medium">{collective.name}</span>
								<span class="block truncate text-sm text-muted-foreground" title={collective.about}>
									{collective.about}
								</span>
							</span>
							<ChevronRight
								class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
{/if}
