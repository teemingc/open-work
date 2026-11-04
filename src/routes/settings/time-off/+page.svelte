<script lang="ts">
	import SettingsSkeleton from '#lib/components/SettingsSkeleton.svelte';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import TimeOffSettings from './TimeOffSettings.svelte';
</script>

<svelte:head>
	<title>Time off · Settings · Open Work</title>
	<meta property="og:title" content="Time off · Settings · Open Work" />
	<meta
		name="description"
		content="Public holidays, the days you took off, and how many you have a year."
	/>
	<meta
		property="og:description"
		content="Public holidays, the days you took off, and how many you have a year."
	/>
</svelte:head>

<!-- The work log lives in this browser's IndexedDB, so the server sends skeletons in its place. -->
<svelte:boundary>
	<TimeOffSettings data={await openWorkLogWithSettings()} />

	{#snippet pending()}
		<SettingsSkeleton label="Loading time off" heights={['h-30', 'h-29', 'h-14']} />
	{/snippet}
</svelte:boundary>
