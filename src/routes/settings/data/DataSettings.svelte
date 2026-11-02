<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { downloadJson } from '#lib/download.js';
	import { forgetDriveSync } from '#lib/drive-sync.svelte.js';
	import { forgetRecentCollectives } from '#lib/recent-collectives.js';
	import { clearAllData } from '#lib/settings.remote.js';
	import { parseBackup } from '#lib/settings.js';
	import {
		forgetWorkLog,
		WorkLogParseError,
		type WorkLogStore
	} from '#lib/worklog-store.svelte.js';
	import { CircleAlert, Download, Upload } from '@lucide/svelte';
	import { untrack } from 'svelte';

	let { store: storeProp }: { store: WorkLogStore } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => storeProp);

	function downloadWorkLog() {
		downloadJson({
			text: store.exportJson(),
			name: `work-log-${new Date().toISOString().slice(0, 10)}.json`
		});
	}

	/** The backup picked, waiting for you to confirm it replaces the log. */
	let pendingBackup = $state<File | undefined>();
	let backupMessage = $state<{ tone: 'ok' | 'error'; text: string } | undefined>();

	function pickBackup(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		pendingBackup = input.files?.[0];
		input.value = '';
	}

	async function restoreBackup(file: File) {
		pendingBackup = undefined;
		const text = await file.text();
		try {
			store.importJson(text);
			backupMessage = {
				tone: 'ok',
				text: `Restored ${store.data.entries.length} entries for ${store.data.clients.length} clients.`
			};
		} catch (error) {
			if (restoreOldSettingsBackup(text)) return;
			backupMessage = {
				tone: 'error',
				text: error instanceof WorkLogParseError ? error.message : 'Could not read that file.'
			};
		}
	}

	/** A settings-only backup from before settings were part of the work log's. */
	function restoreOldSettingsBackup(text: string): boolean {
		let settings;
		try {
			// These backups left the GitHub token out.
			settings = { ...parseBackup(text), githubToken: store.settings.githubToken };
		} catch {
			return false;
		}
		store.setSettings(settings);
		backupMessage = { tone: 'ok', text: 'Settings restored. Your GitHub token was kept.' };
		return true;
	}

	let clearDialogOpen = $state(false);
	let clearError = $state<string>();

	const clearEnhanced = clearAllData.enhance(async ({ submit }) => {
		clearError = undefined;
		await submit();
		forgetDriveSync();
		forgetRecentCollectives();
		try {
			await forgetWorkLog();
		} catch {
			clearError = 'Could not delete the work log in this browser. Clear this site’s data instead.';
			return;
		}
		clearDialogOpen = false;
	});
</script>

<SettingsSection
	title="Backup"
	description="A copy of the work log and your settings as a file, to keep or to move to a browser without Google Drive."
>
	<div class="flex flex-wrap gap-2">
		<Button variant="outline" onclick={downloadWorkLog}><Download /> Download backup</Button>
		<Button variant="outline" onclick={() => document.getElementById('restore-file')?.click()}>
			<Upload /> Restore a backup
		</Button>
		<input
			id="restore-file"
			type="file"
			accept=".json,application/json"
			class="sr-only"
			aria-label="Backup file"
			tabindex="-1"
			onchange={pickBackup}
		/>
	</div>
	<Dialog.Root
		bind:open={() => pendingBackup !== undefined, (open) => !open && (pendingBackup = undefined)}
	>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Replace your work log and settings?</Dialog.Title>
				<Dialog.Description>
					Your work log and settings are replaced with what is in {pendingBackup?.name}.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (pendingBackup = undefined)}>Keep my log</Button>
				<Button variant="destructive" onclick={() => pendingBackup && restoreBackup(pendingBackup)}>
					Replace
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
	{#if backupMessage}
		<p
			role={backupMessage.tone === 'error' ? 'alert' : 'status'}
			class="text-sm {backupMessage.tone === 'error' ? 'text-destructive' : 'text-status-paid'}"
		>
			{backupMessage.text}
		</p>
	{/if}
</SettingsSection>

<SettingsSection title="Delete all data">
	<div>
		<Button variant="destructive" onclick={() => (clearDialogOpen = true)}>Delete all data</Button>
	</div>
</SettingsSection>

<Dialog.Root bind:open={clearDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete all data?</Dialog.Title>
			<Dialog.Description>
				This removes every setting and the work log kept in this browser, and signs you out of Open
				Collective and Google. Expenses on Open Collective and the work log copy in your Google
				Drive are not touched.
			</Dialog.Description>
		</Dialog.Header>
		{#if clearError}
			<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
				<CircleAlert size={15} class="mt-0.5 shrink-0" />{clearError}
			</p>
		{/if}
		<form {...clearEnhanced}>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (clearDialogOpen = false)}>
					Keep my data
				</Button>
				<Button type="submit" variant="destructive" disabled={clearAllData.pending > 0}>
					{#if clearAllData.pending > 0}<Spinner />{/if}
					Delete everything
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
