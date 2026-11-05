<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import {
		driveSync,
		googleAccount,
		loadGoogleAccount,
		type DriveSync
	} from '#lib/drive-sync.svelte.js';
	import { forgetThisBrowser } from '#lib/forget-browser.js';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import { clearAllData } from '#lib/settings.remote.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { hasSession } from '#lib/session.remote.js';
	import { CircleAlert, LogOut } from '@lucide/svelte';
	import { onMount } from 'svelte';

	const meQuery = getMe();
	const openCollective = $derived(!!meQuery.current);

	onMount(loadGoogleAccount);

	const google = $derived(!!googleAccount());

	const form = clearAllData.for('sign-out');

	let open = $state(false);
	let error = $state<string>();
	/** Drive could not take your latest changes, and you were told so. */
	let unsynced = $state(false);
	/** Signed out of Google here, which still leaves you signed in to Google itself. */
	let signedOutOfGoogle = $state(false);
	let syncing = $state(false);
	const busy = $derived(syncing || form.pending > 0);

	const enhanced = form.enhance(async ({ submit }) => {
		error = undefined;
		const wasGoogle = google;
		if (wasGoogle && !unsynced) {
			// So nothing you changed is lost with this browser's copy.
			syncing = true;
			let sync: DriveSync;
			try {
				sync = driveSync((await openWorkLogWithSettings()).store);
				await sync.syncNow();
			} finally {
				syncing = false;
			}
			if (sync.state !== 'synced') {
				unsynced = true;
				error = sync.error ?? 'Could not reach Google Drive.';
				return;
			}
		}
		try {
			await submit();
		} catch (err) {
			error = (err as { body?: { message?: string } }).body?.message ?? 'Could not sign out.';
			return;
		}
		try {
			await forgetThisBrowser();
		} catch {
			error = 'Could not delete the work log in this browser. Clear this site’s data instead.';
			return;
		}
		unsynced = false;
		if (wasGoogle) signedOutOfGoogle = true;
		else open = false;
	});

	function close() {
		open = false;
		error = undefined;
		unsynced = false;
		signedOutOfGoogle = false;
	}
</script>

<!-- The cookies say so in the first render, before Open Collective or Google answer. -->
{#if (await hasSession()) || openCollective || google}
	<SettingsSection
		title="Sign out"
		description="Signs you out of Open Collective and Google and removes your work log and settings from this browser."
	>
		<div>
			<Button variant="outline" class="w-full @md/settings:w-auto" onclick={() => (open = true)}>
				<LogOut /> Sign out
			</Button>
		</div>
	</SettingsSection>
{/if}

<Dialog.Root bind:open={() => open, (value) => !value && close()}>
	<Dialog.Content>
		{#if signedOutOfGoogle}
			<Dialog.Header>
				<Dialog.Title>Signed out of Open Work</Dialog.Title>
				<Dialog.Description
					>This browser is still signed in to your Google account.</Dialog.Description
				>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="outline" onclick={close}>Done</Button>
				<Button href="https://accounts.google.com/Logout">Sign out of Google too</Button>
			</Dialog.Footer>
		{:else}
			<Dialog.Header>
				<Dialog.Title>Sign out and clear this browser?</Dialog.Title>
				<Dialog.Description>
					{#if google}
						Signs you out of Open Collective and Google and removes your work log and settings from
						this browser. The copy in your Google Drive stays.
					{:else}
						Signs you out of Open Collective and removes your work log and settings from this
						browser. They are not in Google Drive, so they will be gone.
					{/if}
				</Dialog.Description>
			</Dialog.Header>
			{#if error}
				<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
					<CircleAlert size={15} class="mt-0.5 shrink-0" />
					{unsynced ? `Your latest changes may not be in Google Drive: ${error}` : error}
				</p>
			{/if}
			<form {...enhanced}>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={close}>Cancel</Button>
					<Button type="submit" variant="destructive" disabled={busy}>
						{#if busy}<Spinner />{/if}
						{unsynced ? 'Clear anyway' : 'Sign out and clear'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
