<script lang="ts">
	import { page } from '$app/state';
	import { signInWithGoogle } from '#lib/auth-client.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import type { DriveSync } from '#lib/drive-sync.svelte.js';
	import { CloudAlert, CloudCheck, CloudOff, RefreshCw } from '@lucide/svelte';

	let {
		sync,
		action = false
	}: {
		sync: DriveSync;
		/** Offer to sync now beside the status. The button then says so itself while a sync runs. */
		action?: boolean;
	} = $props();

	const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });

	const busy = $derived(
		sync.state === 'checking' ? 'Checking Google Drive' : sync.state === 'syncing' ? 'Syncing' : ''
	);
	const expired = $derived(sync.state === 'error' && sync.expired);
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
	<!-- Still read out while the button shows it, as a disabled button is not announced. -->
	<p
		role="status"
		class={['flex items-center gap-1.5 text-sm text-muted-foreground', action && busy && 'sr-only']}
	>
		{#if busy}
			<Spinner class="size-4" /> {busy}
		{:else if sync.state === 'synced'}
			<CloudCheck size={16} class="text-status-paid" aria-hidden="true" />
			Saved to Google Drive{#if sync.lastSynced}&nbsp;at {time.format(sync.lastSynced)}{/if}
		{:else if sync.state === 'error'}
			<CloudAlert size={16} class="shrink-0 text-destructive" aria-hidden="true" />
			<span class="text-destructive">{sync.error}</span>
		{:else}
			<CloudOff size={16} aria-hidden="true" /> Only in this browser
		{/if}
	</p>
	<!-- Outside the status, so the button is not read out with every change of it. -->
	{#if expired}
		<Button variant="outline" size="sm" onclick={() => signInWithGoogle(page.url.pathname)}>
			Sign in
		</Button>
	{:else if action && busy}
		<Button variant="outline" size="sm" disabled aria-hidden="true"><Spinner /> {busy}</Button>
	{:else if action && sync.account}
		<Button variant="outline" size="sm" onclick={() => sync.syncNow()}>
			<RefreshCw /> Sync now
		</Button>
	{/if}
</div>
