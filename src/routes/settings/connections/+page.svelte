<script lang="ts">
	import SettingsSkeleton from '#lib/components/SettingsSkeleton.svelte';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import ConnectionsSettings from './ConnectionsSettings.svelte';
</script>

<svelte:head>
	<title>Connections · Settings · Open Work</title>
	<meta property="og:title" content="Connections · Settings · Open Work" />
	<meta
		name="description"
		content="Find your work on GitHub and keep the work log in Google Drive."
	/>
	<meta
		property="og:description"
		content="Find your work on GitHub and keep the work log in Google Drive."
	/>
</svelte:head>

<!-- The work log lives in this browser's IndexedDB, so the server sends skeletons in its place. -->
<svelte:boundary>
	<ConnectionsSettings data={await openWorkLogWithSettings()} />

	{#snippet pending()}
		<SettingsSkeleton label="Loading connections" heights={['h-64', 'h-23']} />
	{/snippet}
</svelte:boundary>
