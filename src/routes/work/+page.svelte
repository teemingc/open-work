<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import Overview from './Overview.svelte';
</script>

<svelte:head>
	<title>Overview · Open Work</title>
	<meta property="og:title" content="Overview · Open Work" />
	<meta name="description" content="How your year is going, month by month." />
	<meta property="og:description" content="How your year is going, month by month." />
</svelte:head>

<!-- The log lives in this browser's IndexedDB, so the server sends these skeletons. -->
<svelte:boundary>
	<Overview store={(await openWorkLogWithSettings()).store} />

	{#snippet pending()}
		<div class="space-y-6" aria-busy="true">
			<p class="sr-only">Loading your overview</p>
			<div
				class="flex h-[1.2em] min-h-9.5 items-center justify-between gap-3 text-(length:--h1-size)"
			>
				<Skeleton class="h-9 w-24" />
				<Skeleton class="h-9 w-40" />
			</div>
			<Skeleton class="h-196 w-full rounded-xl" />
		</div>
	{/snippet}
</svelte:boundary>
