<script lang="ts">
	import SettingsSkeleton from '#lib/components/SettingsSkeleton.svelte';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import HoursSettings from './HoursSettings.svelte';
</script>

<svelte:head>
	<title>Hours and pay · Settings · Open Work</title>
	<meta property="og:title" content="Hours and pay · Settings · Open Work" />
	<meta
		name="description"
		content="The hours you aim to work, the currency earnings show in, and what comes out of them."
	/>
	<meta
		property="og:description"
		content="The hours you aim to work, the currency earnings show in, and what comes out of them."
	/>
</svelte:head>

<!-- The work log lives in this browser's IndexedDB, so the server sends skeletons in its place. -->
<svelte:boundary>
	<HoursSettings data={await openWorkLogWithSettings()} />

	{#snippet pending()}
		<SettingsSkeleton label="Loading hours and pay" heights={['h-48', 'h-14']} />
	{/snippet}
</svelte:boundary>
