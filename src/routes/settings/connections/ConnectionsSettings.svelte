<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SettingsForm from '#lib/components/SettingsForm.svelte';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { GitHubError, verifyGitHubToken } from '#lib/github.js';
	import { oauthErrorMessage } from '#lib/oauth-error.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { disconnect, saveSettings } from '#lib/settings.remote.js';
	import type { Settings } from '#lib/settings.js';
	import { Check, CircleAlert, CircleCheck } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import ChipInput from './ChipInput.svelte';

	let { settings }: { settings: Settings } = $props();

	// Open Collective connection, kept in a server cookie by the OAuth flow
	const me = $derived(await getMe());
	const connectError = $derived(oauthErrorMessage(page.url.searchParams.get('oc_error')));

	const fields = saveSettings.fields;
	const values = $derived(fields.value());
	const repositories = $state(untrack(() => [...settings.repositories]));

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

<!-- Lives outside the settings form, which its button below submits through `form`. -->
<form {...disconnect} id="disconnect-form"></form>

<SettingsForm {settings} shown={['githubToken', 'githubUsername', 'organization', 'repositories']}>
	{#snippet children({ save })}
		<SettingsSection
			title="Open Collective"
			description="Lists the expenses you have sent and lets you submit new ones straight to the collective."
		>
			<div class="space-y-1.5" id="oc-connection">
				{#if me}
					<!-- The account, then a separate action to leave it. -->
					<div
						class="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
					>
						<div class="flex min-w-0 items-center gap-2.5">
							<CircleCheck size={18} class="shrink-0 text-status-paid" />
							<div class="min-w-0">
								<p class="truncate text-sm font-medium">{me.name}</p>
								<p class="truncate text-xs text-muted-foreground">Connected as @{me.slug}</p>
							</div>
						</div>
						<Button
							type="submit"
							form="disconnect-form"
							variant="outline"
							size="sm"
							disabled={disconnect.pending > 0}
						>
							{#if disconnect.pending > 0}<Spinner />{/if}
							Disconnect
						</Button>
					</div>
				{:else}
					<div class="flex items-center gap-2">
						<Button href={resolve('/auth/connect')} data-sveltekit-reload variant="outline">
							Connect
						</Button>
						<span
							class="size-1.5 shrink-0 rounded-full bg-attention"
							title="Needed to submit invoices"
						>
							<span class="sr-only">(needed to submit invoices)</span>
						</span>
					</div>
				{/if}
				{#if connectError}
					<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
						<CircleAlert size={15} class="mt-0.5 shrink-0" />{connectError}
					</p>
				{/if}
			</div>
		</SettingsSection>

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
