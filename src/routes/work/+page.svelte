<script lang="ts" module>
	/** Whether this page has opened since the app loaded: only the first time can be the app starting. */
	let opened = false;
</script>

<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import Year from './Year.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	// The installed app opens on the work log. iOS keeps the address an app was added to the home
	// screen with, so one added while this page was the first to open still starts here, and is
	// sent on: only as the app starts, which comes from no other page, not on a reload or a link.
	onMount(() => {
		const [navigation] = performance.getEntriesByType(
			'navigation'
		) as PerformanceNavigationTiming[];
		const first = !opened;
		opened = true;
		if (
			first &&
			matchMedia('(display-mode: standalone)').matches &&
			navigation?.type === 'navigate' &&
			navigation.name === location.href &&
			!document.referrer &&
			!location.search
		) {
			void goto(resolve('/worklog'), { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>Year · Open Work</title>
	<meta property="og:title" content="Year · Open Work" />
	<meta name="description" content="How your year is going, month by month." />
	<meta property="og:description" content="How your year is going, month by month." />
</svelte:head>

<!-- The log lives in this browser's IndexedDB, so the server sends these skeletons. -->
<svelte:boundary>
	<Year store={(await openWorkLogWithSettings()).store} />

	{#snippet pending()}
		<div class="flex flex-col gap-4 md:gap-6" aria-busy="true">
			<p class="sr-only">Loading your year</p>
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
