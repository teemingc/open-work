<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import WorkLog from './WorkLog.svelte';
</script>

<svelte:head>
	<title>Work log · Open Work</title>
	<meta property="og:title" content="Work log · Open Work" />
	<meta name="description" content="Log your hours and keep track of your pace for the month." />
	<meta
		property="og:description"
		content="Log your hours and keep track of your pace for the month."
	/>
</svelte:head>

<!--
	The log lives in this browser's IndexedDB, and the month shown depends on your time zone, so the
	server sends these skeletons and the browser fills them in.
-->
<svelte:boundary>
	<WorkLog data={await openWorkLogWithSettings()} />

	{#snippet pending()}
		<!--
			The same heights as the page, so the footer stays put when the log arrives. The charts set
			the height of the page whatever is logged.
		-->
		<div class="flex flex-col gap-4 md:gap-6" aria-busy="true">
			<p class="sr-only">Loading your work log</p>
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
			<div class="grid grid-cols-1 items-start gap-4 md:gap-6 @5xl/main:grid-cols-2">
				<Skeleton class="h-80 w-full rounded-xl" />
				<div class="flex flex-col gap-4 md:gap-6">
					<Skeleton class="h-190 w-full rounded-xl" />
					<Skeleton class="h-28 w-full rounded-xl" />
				</div>
			</div>
		</div>
	{/snippet}
</svelte:boundary>
