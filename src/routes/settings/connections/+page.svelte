<script lang="ts">
	import SettingsSkeleton from '#lib/components/SettingsSkeleton.svelte';
	import { getSettings } from '#lib/settings.remote.js';
	import ConnectionsSettings from './ConnectionsSettings.svelte';
</script>

<svelte:head>
	<title>Connections · Settings · Open Work</title>
	<meta property="og:title" content="Connections · Settings · Open Work" />
	<meta name="description" content="Connect Open Collective and find your work on GitHub." />
	<meta property="og:description" content="Connect Open Collective and find your work on GitHub." />
</svelte:head>

<svelte:boundary>
	<ConnectionsSettings settings={await getSettings()} />

	{#snippet pending()}
		<SettingsSkeleton label="Loading connections" heights={['h-23', 'h-64']} />
	{/snippet}
</svelte:boundary>
