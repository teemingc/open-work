<script lang="ts">
	import { resolve } from '$app/paths';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { getSettings } from '#lib/settings.remote.js';
	import { openWorkLog } from '#lib/worklog-store.svelte.js';
	import { ArrowLeft } from '@lucide/svelte';
	import WorkLogSetup from './WorkLogSetup.svelte';

	async function open() {
		const settings = await getSettings();
		const store = await openWorkLog({
			rate: settings.hourlyRate,
			currency: settings.currency,
			collective: settings.collectiveSlug
		});
		return { settings, store };
	}
</script>

<svelte:head>
	<title>Clients and days off · Open Work</title>
	<meta property="og:title" content="Clients and days off · Open Work" />
	<meta
		name="description"
		content="Set the clients you log hours for and the days you’ve taken off."
	/>
	<meta
		property="og:description"
		content="Set the clients you log hours for and the days you’ve taken off."
	/>
</svelte:head>

<a
	href={resolve('/worklog')}
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
>
	<ArrowLeft size={15} /> Work log
</a>
<h1 class="mb-8">Clients and days off</h1>

<!--
	The log lives in this browser's IndexedDB, so the server sends skeletons in its place: one per
	section, each as tall as the section, so the footer stays put when the log arrives.
-->
<svelte:boundary>
	<WorkLogSetup data={await open()} />

	{#snippet pending()}
		<div aria-busy="true" aria-label="Loading your clients and days off">
			{#each ['h-36', 'h-48', 'h-14', 'h-30', 'h-29', 'h-28', 'h-23'] as height, index (index)}
				<div class="grid gap-6 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-[14rem_1fr]">
					<div class="space-y-2">
						<Skeleton class="h-6 w-28" />
						<Skeleton class="h-4 w-48 max-w-full" />
					</div>
					<Skeleton class={[height, 'w-full rounded-lg']} />
				</div>
			{/each}
		</div>
	{/snippet}
</svelte:boundary>
