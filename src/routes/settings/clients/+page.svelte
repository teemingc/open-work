<script lang="ts">
	import SettingsSkeleton from '#lib/components/SettingsSkeleton.svelte';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import ClientsSettings from './ClientsSettings.svelte';
</script>

<svelte:head>
	<title>Clients · Settings · Open Work</title>
	<meta property="og:title" content="Clients · Settings · Open Work" />
	<meta
		name="description"
		content="Who you work for, what they pay an hour, and how often you invoice them."
	/>
	<meta
		property="og:description"
		content="Who you work for, what they pay an hour, and how often you invoice them."
	/>
</svelte:head>

<!-- The work log lives in this browser's IndexedDB, so the server sends skeletons in its place. -->
<svelte:boundary>
	<ClientsSettings data={await openWorkLogWithSettings()} />

	{#snippet pending()}
		<SettingsSkeleton label="Loading clients" heights={['h-96']} />
	{/snippet}
</svelte:boundary>
