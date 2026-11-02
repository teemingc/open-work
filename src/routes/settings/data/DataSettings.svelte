<script lang="ts">
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { downloadJson } from '#lib/download.js';
	import { forgetDriveSync } from '#lib/drive-sync.svelte.js';
	import { forgetRecentCollectives } from '#lib/recent-collectives.js';
	import { clearAllData, getSettings, restoreSettings } from '#lib/settings.remote.js';
	import { exportBackup, parseBackup } from '#lib/settings.js';
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
		try {
			store.importJson(await file.text());
			backupMessage = {
				tone: 'ok',
				text: `Restored ${store.data.entries.length} entries for ${store.data.clients.length} clients.`
			};
		} catch (error) {
			backupMessage = {
				tone: 'error',
				text: error instanceof WorkLogParseError ? error.message : 'Could not read that file.'
			};
		}
	}

	let settingsMessage = $state<{ ok: boolean; text: string } | undefined>();

	async function downloadSettings() {
		downloadJson({
			text: exportBackup(await getSettings()),
			name: `invoice-settings-${new Date().toISOString().slice(0, 10)}.json`
		});
	}

	async function importBackup(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const { githubToken } = await getSettings();
			await restoreSettings({
				...parseBackup(await file.text()),
				githubToken
			});
			settingsMessage = { ok: true, text: 'Backup restored. Your GitHub token was kept.' };
		} catch {
			settingsMessage = { ok: false, text: 'That file is not a valid backup.' };
		}
		input.value = '';
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
	title="Work log backup"
	description="A copy of the work log as a file, to keep or to move to a browser without Google Drive."
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
				<Dialog.Title>Replace your work log?</Dialog.Title>
				<Dialog.Description>
					Everything in the work log is replaced with what is in {pendingBackup?.name}.
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

<SettingsSection
	title="Settings backup"
	description="Download your settings to move them to another browser."
>
	<div class="flex flex-wrap gap-2">
		<Button type="button" variant="outline" onclick={downloadSettings}>
			<Download /> Download backup
		</Button>
		<Button type="button" variant="outline" class="relative">
			<Upload /> Restore backup
			<input
				type="file"
				accept="application/json"
				class="absolute inset-0 cursor-pointer opacity-0"
				aria-label="Restore backup file"
				onchange={importBackup}
			/>
		</Button>
	</div>
	{#if settingsMessage}
		<Alert.Root variant={settingsMessage.ok ? 'default' : 'destructive'}>
			<Alert.Description>{settingsMessage.text}</Alert.Description>
		</Alert.Root>
	{/if}
	<p class="text-xs text-muted-foreground">Backups never include your tokens.</p>
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
