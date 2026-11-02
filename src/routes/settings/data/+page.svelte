<script lang="ts">
	import SettingsSkeleton from '#lib/components/SettingsSkeleton.svelte';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import DataSettings from './DataSettings.svelte';
</script>

<svelte:head>
	<title>Data · Settings · Open Work</title>
	<meta property="og:title" content="Data · Settings · Open Work" />
	<meta
		name="description"
		content="Back up the work log and your settings, or delete everything."
	/>
	<meta
		property="og:description"
		content="Back up the work log and your settings, or delete everything."
	/>
</svelte:head>

<!-- The work log lives in this browser's IndexedDB, so the server sends skeletons in its place. -->
<svelte:boundary>
	<DataSettings store={(await openWorkLogWithSettings()).store} />

	{#snippet pending()}
		<SettingsSkeleton label="Loading data" heights={['h-23', 'h-23', 'h-9']} />
	{/snippet}
</svelte:boundary>
