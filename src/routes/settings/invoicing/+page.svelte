<script lang="ts">
	import SettingsSkeleton from '#lib/components/SettingsSkeleton.svelte';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import InvoicingSettings from './InvoicingSettings.svelte';
</script>

<svelte:head>
	<title>Invoicing · Settings · Open Work</title>
	<meta property="og:title" content="Invoicing · Settings · Open Work" />
	<meta
		name="description"
		content="Connect Open Collective, and set who the invoices you email are from and how you are paid."
	/>
	<meta
		property="og:description"
		content="Connect Open Collective, and set who the invoices you email are from and how you are paid."
	/>
</svelte:head>

<!-- The work log lives in this browser's IndexedDB, so the server sends skeletons in its place. -->
<svelte:boundary>
	<InvoicingSettings store={(await openWorkLogWithSettings()).store} />

	{#snippet pending()}
		<SettingsSkeleton label="Loading invoicing" heights={['h-96', 'h-28', 'h-96']} />
	{/snippet}
</svelte:boundary>
