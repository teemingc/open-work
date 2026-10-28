<script lang="ts">
	import { getMe } from '#lib/opencollective.remote.js';
	import Dashboard from './Dashboard.svelte';
	import { getCachedIncomeSources, getCollectiveStats } from '#lib/collective-stats.remote.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const slug = $derived(params.handle.toLowerCase());
</script>

<!--
	Your account is awaited with the stats (Svelte runs them in parallel), so the page appears
	complete. Arriving later, it would add the "Paid to you" card and reshape the charts after the
	page was already on screen. So are the contributions, when the server already has them.

	A new dashboard for each collective. Reused, the last collective's contributions stayed mounted
	while this one's loaded, read as missing, and the error stopped every navigation after it.
-->
{#key slug}
	<Dashboard
		data={await getCollectiveStats(slug)}
		me={(await getMe())?.slug}
		income={await getCachedIncomeSources(slug)}
	/>
{/key}
