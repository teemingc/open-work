<script lang="ts">
	import { resolve } from '$app/paths';
	import DriveSyncStatus from '#lib/components/DriveSyncStatus.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { downloadJson } from '#lib/download.js';
	import { driveSync, forgetDriveSync } from '#lib/drive-sync.svelte.js';
	import { forgetRecentCollectives } from '#lib/recent-collectives.js';
	import { clearAllData } from '#lib/settings.remote.js';
	import { exportSettingsBackup, parseBackup, type Settings } from '#lib/settings.js';
	import {
		forgetWorkLog,
		validateWorkLog,
		WorkLogParseError,
		type WorkLogStore
	} from '#lib/worklog-store.svelte.js';
	import type { WorkLogData } from '#lib/worklog.js';
	import { CircleAlert, Cloud, Download, LogOut, RefreshCw, Upload } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { signInWithGoogle, signOutOfGoogle } from './auth-client';

	let { store: storeProp }: { store: WorkLogStore } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => storeProp);
	const sync = driveSync(store);

	/** Which parts the next download holds. */
	const exportParts = $state({ workLog: true, settings: true });

	function downloadBackup() {
		const date = new Date().toISOString().slice(0, 10);
		if (!exportParts.workLog) {
			downloadJson({
				text: exportSettingsBackup(store.settings),
				name: `open-work-settings-${date}.json`
			});
			return;
		}
		const data = $state.snapshot(store.data);
		if (!exportParts.settings) {
			delete data.settings;
			delete data.settingsUpdatedAt;
		}
		downloadJson({
			text: JSON.stringify(data, null, '\t'),
			name: `open-work-${exportParts.settings ? 'backup' : 'work-log'}-${date}.json`
		});
	}

	/** The backup picked and what it holds, waiting for you to choose what replaces what is here. */
	let pendingBackup = $state<
		{ name: string; settings?: Settings; workLog?: WorkLogData } | undefined
	>();
	const restoreParts = $state({ workLog: false, settings: false });
	let backupMessage = $state<{ tone: 'ok' | 'error'; text: string } | undefined>();

	/** A work log backup, which may hold settings, or a settings-only backup from before they joined it. */
	function readBackup(text: string): { settings?: Settings; workLog?: WorkLogData } {
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			throw new WorkLogParseError('That file is not JSON.');
		}
		try {
			const workLog = validateWorkLog(raw);
			return { workLog, settings: workLog.settings };
		} catch (error) {
			try {
				// These backups left the GitHub token out, so the one you have is kept.
				return { settings: { ...parseBackup(text), githubToken: store.settings.githubToken } };
			} catch {
				throw error;
			}
		}
	}

	async function pickBackup(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		backupMessage = undefined;
		let backup: ReturnType<typeof readBackup>;
		try {
			backup = readBackup(await file.text());
		} catch (error) {
			const text =
				error instanceof WorkLogParseError ? error.message : 'That file is not a backup.';
			backupMessage = { tone: 'error', text };
			return;
		}
		restoreParts.workLog = backup.workLog !== undefined;
		restoreParts.settings = backup.settings !== undefined;
		pendingBackup = { name: file.name, ...backup };
	}

	const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

	function workLogSummary(data: WorkLogData) {
		return [
			count(data.entries.length, 'entry', 'entries'),
			count(data.clients.length, 'client', 'clients'),
			count(data.invoices.length, 'invoice', 'invoices')
		].join(', ');
	}

	function settingsSummary(settings: Settings) {
		const parts = [
			settings.collectiveSlug && `collective ${settings.collectiveSlug}`,
			settings.payoutMethodLabel && `paid to ${settings.payoutMethodLabel}`,
			settings.githubUsername && `GitHub ${settings.githubUsername}`
		].filter(Boolean);
		return parts.length ? parts.join(', ') : 'Nothing set';
	}

	function restoreBackup({ settings, workLog }: { settings?: Settings; workLog?: WorkLogData }) {
		pendingBackup = undefined;
		const restored: string[] = [];
		if (workLog && restoreParts.workLog) {
			// Without settings, the backup keeps the ones you have.
			store.restore(
				restoreParts.settings
					? workLog
					: { ...workLog, settings: undefined, settingsUpdatedAt: undefined }
			);
			restored.push('the work log');
		} else if (settings && restoreParts.settings) {
			store.setSettings(settings);
		}
		if (settings && restoreParts.settings) restored.push('your settings');
		backupMessage = { tone: 'ok', text: `Restored ${restored.join(' and ')}.` };
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
	title="Google Drive"
	description="Sign in with Google to sync app data to your Google Drive."
>
	{#if sync.state === 'unavailable'}
		<p class="text-sm text-muted-foreground">
			Google sign-in is not set up on this server, so the work log stays in this browser.
		</p>
	{:else}
		{#if sync.account}
			<p class="text-sm">
				Signed in as <span class="font-medium">{sync.account.email}</span>
			</p>
		{/if}
		<!-- Signed out, the sign-in button already says the log is not in Drive. -->
		{#if sync.state !== 'signed-out'}<DriveSyncStatus {sync} />{/if}
		<div class="flex flex-wrap gap-2">
			{#if sync.account}
				<Button
					variant="outline"
					disabled={sync.state === 'syncing'}
					onclick={() => sync.syncNow()}
				>
					<RefreshCw /> Sync now
				</Button>
				<Button
					variant="ghost"
					onclick={async () => {
						await signOutOfGoogle();
						sync.stop();
					}}
				>
					<LogOut /> Sign out
				</Button>
			{:else if sync.state === 'signed-out' || sync.state === 'error'}
				<Button variant="outline" onclick={() => signInWithGoogle(resolve('/settings/data'))}>
					<Cloud /> Sign in with Google
				</Button>
			{/if}
		</div>
	{/if}
</SettingsSection>

{#snippet part({
	id,
	label,
	checked,
	disabled = false,
	detail,
	onchange
}: {
	id: string;
	label: string;
	checked: boolean;
	disabled?: boolean;
	detail?: string;
	onchange: (checked: boolean) => void;
})}
	<div class="flex items-start gap-2.5">
		<Checkbox {id} {checked} {disabled} onCheckedChange={onchange} class="mt-0.5" />
		<div class="grid gap-0.5">
			<Label for={id} class={disabled ? 'text-muted-foreground' : ''}>{label}</Label>
			{#if detail}<p class="text-xs text-muted-foreground">{detail}</p>{/if}
		</div>
	</div>
{/snippet}

<SettingsSection
	title="Backup"
	description="Your work log and settings as a file, to keep or to move to another browser."
>
	<div class="flex flex-wrap gap-x-6 gap-y-2">
		{@render part({
			id: 'export-work-log',
			label: 'Work log',
			checked: exportParts.workLog,
			detail: workLogSummary(store.data),
			onchange: (checked) => (exportParts.workLog = checked)
		})}
		{@render part({
			id: 'export-settings',
			label: 'Settings',
			checked: exportParts.settings,
			onchange: (checked) => (exportParts.settings = checked)
		})}
	</div>
	<div class="flex flex-wrap gap-2">
		<Button
			variant="outline"
			disabled={!exportParts.workLog && !exportParts.settings}
			onclick={downloadBackup}
		>
			<Download /> Download backup
		</Button>
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
				<Dialog.Title>Restore from {pendingBackup?.name}?</Dialog.Title>
				<Dialog.Description>What you tick replaces what is here.</Dialog.Description>
			</Dialog.Header>
			{#if pendingBackup}
				<div class="grid gap-3">
					{@render part({
						id: 'restore-work-log',
						label: 'Work log',
						checked: restoreParts.workLog,
						disabled: !pendingBackup.workLog,
						detail: pendingBackup.workLog
							? workLogSummary(pendingBackup.workLog)
							: 'Not in this file',
						onchange: (checked) => (restoreParts.workLog = checked)
					})}
					{@render part({
						id: 'restore-settings',
						label: 'Settings',
						checked: restoreParts.settings,
						disabled: !pendingBackup.settings,
						detail: pendingBackup.settings
							? settingsSummary(pendingBackup.settings)
							: 'Not in this file',
						onchange: (checked) => (restoreParts.settings = checked)
					})}
				</div>
			{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (pendingBackup = undefined)}>Cancel</Button>
				<Button
					variant="destructive"
					disabled={!restoreParts.workLog && !restoreParts.settings}
					onclick={() => pendingBackup && restoreBackup(pendingBackup)}
				>
					Restore
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
	title="Delete all data"
	description="Removes your settings and work log from this browser and signs you out of Open Collective and Google. The copy in your Google Drive and your expenses on Open Collective stay."
>
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
