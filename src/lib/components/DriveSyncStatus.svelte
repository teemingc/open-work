<script lang="ts">
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import type { DriveSync } from '#lib/drive-sync.svelte.js';
	import { CloudAlert, CloudCheck, CloudOff } from '@lucide/svelte';

	let { sync }: { sync: DriveSync } = $props();

	const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });
</script>

<p role="status" class="flex items-center gap-1.5 text-sm text-muted-foreground">
	{#if sync.state === 'checking' || sync.state === 'syncing'}
		<Spinner class="size-4" /> {sync.state === 'checking' ? 'Checking Google Drive' : 'Syncing'}
	{:else if sync.state === 'synced'}
		<CloudCheck size={16} class="text-status-paid" aria-hidden="true" />
		Saved to Google Drive{#if sync.lastSynced}&nbsp;at {time.format(sync.lastSynced)}{/if}
	{:else if sync.state === 'error'}
		<CloudAlert size={16} class="text-destructive" aria-hidden="true" />
		<span class="text-destructive">{sync.error}</span>
	{:else if sync.state === 'signed-out'}
		<CloudOff size={16} aria-hidden="true" /> Only in this browser
	{:else}
		<CloudOff size={16} aria-hidden="true" /> Only in this browser
	{/if}
</p>
