<script lang="ts">
	import { resolve } from '$app/paths';
	import DriveSyncStatus from '#lib/components/DriveSyncStatus.svelte';
	import SettingsForm from '#lib/components/SettingsForm.svelte';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { driveSync } from '#lib/drive-sync.svelte.js';
	import { GitHubError, verifyGitHubToken } from '#lib/github.js';
	import { saveSettings } from '#lib/settings.remote.js';
	import type { Settings } from '#lib/settings.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { Check, CircleAlert, Cloud, LogOut, RefreshCw } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { signInWithGoogle, signOutOfGoogle } from './auth-client';
	import ChipInput from './ChipInput.svelte';

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();

	const sync = driveSync(untrack(() => data.store));

	const fields = saveSettings.fields;
	const values = $derived(fields.value());
	const repositories = $state(untrack(() => [...data.settings.repositories]));

	let verifying = $state(false);
	let githubMessage = $state<{ ok: boolean; text: string } | undefined>();

	async function verifyGitHub(save: () => Promise<void>) {
		const token = values.githubToken?.trim();
		if (!token) return;
		verifying = true;
		githubMessage = undefined;
		try {
			const { login } = await verifyGitHubToken(token);
			if (!values.githubUsername?.trim()) {
				fields.githubUsername.set(login);
				void save();
			}
			githubMessage = { ok: true, text: `Token works for ${login}.` };
		} catch (error) {
			const text = error instanceof GitHubError ? error.message : 'Could not reach GitHub.';
			githubMessage = { ok: false, text };
		} finally {
			verifying = false;
		}
	}
</script>

<SettingsForm
	settings={data.settings}
	shown={['githubToken', 'githubUsername', 'organization', 'repositories']}
>
	{#snippet children({ save })}
		<SettingsSection
			title="GitHub"
			description="Optional. Fills the work log with the PRs and issues you touched in each period."
		>
			<div class="space-y-1.5">
				<Label for="github-token">Personal access token</Label>
				<div class="flex gap-2">
					<Input id="github-token" {...fields.githubToken.as('password')} autocomplete="off" />
					<Button
						type="button"
						variant="outline"
						onclick={() => verifyGitHub(save)}
						disabled={verifying || !values.githubToken?.trim()}
					>
						{#if verifying}<Spinner />{/if}
						Check token
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Without a token only your public activity is found. Any token that can read your account
					works.
				</p>
				{#if githubMessage}
					<p
						class="flex items-center gap-1.5 text-sm {githubMessage.ok
							? 'text-status-paid'
							: 'text-destructive'}"
						role="status"
					>
						{#if githubMessage.ok}<Check size={15} />{:else}<CircleAlert size={15} />{/if}
						{githubMessage.text}
					</p>
				{/if}
			</div>

			<div class="grid gap-5 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="github-username">Username</Label>
					<Input id="github-username" {...fields.githubUsername.as('text')} />
				</div>
				<div class="space-y-1.5">
					<Label for="organization">Organisation</Label>
					<Input
						id="organization"
						{...fields.organization.as('text')}
						placeholder="Optional, e.g. your-org"
					/>
				</div>
			</div>

			<div class="space-y-1.5">
				<Label for="repositories">Repositories</Label>
				{#each repositories as repository, index (repository)}
					<input {...fields.repositories[index].as('hidden', repository)} />
				{/each}
				<ChipInput id="repositories" values={repositories} onchange={save} />
				<p class="text-xs text-muted-foreground">
					Leave empty to include every repository in the organization. Press Enter after each name,
					for example kit.
				</p>
			</div>
		</SettingsSection>
	{/snippet}
</SettingsForm>

<SettingsSection
	title="Google Drive"
	description="Sign in with Google to keep the work log in your own Drive, in a hidden folder only this app can open, and use it on any device."
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
		<DriveSyncStatus {sync} />
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
				<Button
					variant="outline"
					onclick={() => signInWithGoogle(resolve('/settings/connections'))}
				>
					<Cloud /> Sign in with Google
				</Button>
			{/if}
		</div>
	{/if}
</SettingsSection>
