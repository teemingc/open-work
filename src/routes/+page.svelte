<script lang="ts">
	import { resolve } from '$app/paths';
	import { collectiveLogo, SUGGESTED_COLLECTIVES } from '#lib/collective-suggestions.js';
	import CollectiveSearch from '#lib/components/CollectiveSearch.svelte';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { ChevronRight } from '@lucide/svelte';
</script>

<svelte:head>
	<title>Collective · Open Work</title>
	<meta property="og:title" content="Collective · Open Work" />
	<meta
		name="description"
		content="Look up a collective on Open Collective and see its balance, runway and who funds it."
	/>
	<meta
		property="og:description"
		content="Look up a collective on Open Collective and see its balance, runway and who funds it."
	/>
</svelte:head>

<!-- One narrow column: the search, then a short list that reads as its first results. -->
<div class="mx-auto flex max-w-md flex-col gap-6 pt-10 sm:pt-16">
	<div class="space-y-2 text-center">
		<h1>Look up a collective</h1>
		<p class="text-muted-foreground">See its balance, runway and who funds it.</p>
	</div>
	<CollectiveSearch name="Look up a collective" nameShown={false} field />
	<nav aria-labelledby="suggested-heading" class="overflow-hidden rounded-xl border bg-card">
		<h2 id="suggested-heading" class="sr-only">Suggested collectives</h2>
		<ul class="divide-y">
			{#each SUGGESTED_COLLECTIVES as collective (collective.slug)}
				<li>
					<!-- The logo stays beside the name when a long description wraps under it. -->
					<a
						href={resolve(`/collective/[handle]${dashboardSearch()}`, {
							handle: collective.slug
						})}
						class="group flex items-start gap-3 px-3.5 py-2.5 [--focus-offset:-2px] hover:bg-accent focus-visible:bg-accent"
					>
						<img
							src={collectiveLogo(collective.slug)}
							alt=""
							class="mt-0.5 size-8 shrink-0 rounded-md border bg-card object-contain"
							loading="lazy"
						/>
						<span class="min-w-0 flex-1">
							<span class="block font-medium">{collective.name}</span>
							<span class="block text-sm text-muted-foreground">
								{collective.about}
							</span>
						</span>
						<ChevronRight
							class="size-4 shrink-0 self-center text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5"
							aria-hidden="true"
						/>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</div>
