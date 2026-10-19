<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { getSettings } from '#lib/settings.remote.js';
	import { openWorkLog } from '#lib/worklog-store.svelte.js';
	import WorkLog from './WorkLog.svelte';

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

<svelte:head><title>Work log · Open Work</title></svelte:head>

<!--
	The log lives in this browser's IndexedDB, and the month shown depends on your time zone, so the
	server sends these skeletons and the browser fills them in.
-->
<svelte:boundary>
	<WorkLog data={await open()} />

	{#snippet pending()}
		<!--
			The same heights as the page, so the footer stays put when the log arrives. The charts set
			the height of the page whatever is logged.
		-->
		<div class="space-y-6" aria-busy="true" aria-label="Loading your work log">
			<div class="space-y-2">
				<!-- As tall as the month name or its buttons, whichever is taller. -->
				<div
					class="flex h-[1.2em] min-h-9.5 items-center justify-between gap-3 text-(length:--h1-size)"
				>
					<Skeleton class="h-9 w-48" />
					<Skeleton class="h-9 w-36" />
				</div>
				<div class="flex h-8 items-center justify-between gap-2">
					<Skeleton class="h-5 w-32" />
					<Skeleton class="h-8 w-64 max-w-[50%]" />
				</div>
			</div>
			<Skeleton class="h-26 w-full rounded-xl" />
			<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
				<div class="space-y-3">
					<Skeleton class="h-7 w-24" />
					<Skeleton class="h-64 w-full rounded-xl" />
				</div>
				<div class="space-y-6">
					<Skeleton class="h-190 w-full rounded-xl" />
					<Skeleton class="h-28 w-full rounded-xl" />
				</div>
			</div>
		</div>
	{/snippet}
</svelte:boundary>
