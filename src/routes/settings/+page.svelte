<script lang="ts">
	import { downloadJson } from '#lib/download.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { formatMoney } from '#lib/format.js';
	import { GitHubError, verifyGitHubToken } from '#lib/github.js';
	import { forgetDriveSync } from '#lib/drive-sync.svelte.js';
	import { oauthErrorMessage } from '#lib/oauth-error.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { forgetRecentCollectives } from '#lib/recent-collectives.js';
	import {
		clearAllData,
		disconnect,
		getSettings,
		restoreSettings,
		saveSettings
	} from '#lib/settings.remote.js';
	import {
		DEFAULT_SETTINGS,
		exportBackup,
		missingForSubmit,
		parseBackup,
		type Settings,
		type SubmitRequirement
	} from '#lib/settings.js';
	import { Check, CircleAlert, CircleCheck, Download, TriangleAlert, Upload } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import ChipInput from './ChipInput.svelte';
	import { forgetWorkLog } from '#lib/worklog-store.svelte.js';
	import SettingsSection from '#lib/components/SettingsSection.svelte';

	const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'MYR', 'SGD'];

	/** Where each missing requirement is fixed on this page. */
	const REQUIREMENT_FIELDS: Record<SubmitRequirement, { id: string; text: string }> = {
		'Open Collective connection': { id: 'oc-connection', text: 'Connect Open Collective' },
		'payout method': { id: 'payout-method', text: 'Choose a payout method' },
		collective: { id: 'collective', text: 'Enter the collective you invoice' },
		'hourly rate': { id: 'rate', text: 'Set your hourly rate' }
	};

	const [me, settings] = $derived(await Promise.all([getMe(), getSettings()]));
	const missing = $derived(missingForSubmit({ settings, connected: me !== null }));

	const fields = saveSettings.fields;
	// The form starts from the saved settings and then owns its values.
	const initial = untrack(() => settings);
	fields.set(initial);
	const repositories = $state([...initial.repositories]);
	const values = $derived(fields.value());

	let formElement = $state<HTMLFormElement>();

	/** Save after a change made in code rather than by typing, once the inputs show it. */
	async function save() {
		await tick();
		formElement?.requestSubmit();
	}

	function load(next: Settings) {
		fields.set(next);
		repositories.splice(0, repositories.length, ...next.repositories);
	}

	/** Shows "Saved" briefly after each save, so it reads as a reply to what you just changed. */
	let justSaved = $state(false);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	const enhanced = saveSettings.enhance(async ({ submit }) => {
		// No reset: the inputs already show what was saved.
		await submit();
		if (!saveSettings.result?.saved) return;
		justSaved = true;
		clearTimeout(savedTimer);
		savedTimer = setTimeout(() => (justSaved = false), 2000);
	});

	// Open Collective connection, kept in a server cookie by the OAuth flow
	const payoutMethods = $derived(me?.payoutMethods ?? []);
	const payoutLabel = $derived(
		payoutMethods.find((method) => method.id === values.payoutMethodId)?.label ??
			values.payoutMethodLabel
	);
	const connectError = $derived(oauthErrorMessage(page.url.searchParams.get('oc_error')));

	function choosePayoutMethod(id: string) {
		fields.payoutMethodId.set(id);
		fields.payoutMethodLabel.set(payoutMethods.find((method) => method.id === id)?.label ?? '');
		void save();
	}

	// GitHub
	let verifying = $state(false);
	let githubMessage = $state<{ ok: boolean; text: string } | undefined>();

	async function verifyGitHub() {
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

	// Backup
	let backupMessage = $state<{ ok: boolean; text: string } | undefined>();
	let clearDialogOpen = $state(false);

	function downloadBackup() {
		downloadJson({
			text: exportBackup(settings),
			name: `invoice-settings-${new Date().toISOString().slice(0, 10)}.json`
		});
	}

	async function importBackup(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const restored = { ...parseBackup(await file.text()), githubToken: settings.githubToken };
			await restoreSettings(restored);
			load(restored);
			backupMessage = { ok: true, text: 'Backup restored. Your GitHub token was kept.' };
		} catch {
			backupMessage = { ok: false, text: 'That file is not a valid backup.' };
		}
		input.value = '';
	}

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
		load({ ...DEFAULT_SETTINGS });
		clearDialogOpen = false;
	});
</script>

<svelte:head>
	<title>Settings · Open Work</title>
	<meta property="og:title" content="Settings · Open Work" />
	<meta name="description" content="Connect to Open Collective to start sending invoices." />
	<meta property="og:description" content="Connect to Open Collective to start sending invoices." />
</svelte:head>

<!--
	Beside each field the warning above lists, until it is filled in. The same dot as on Settings in
	the header, which shows while any of them is missing.
-->
{#snippet needed(requirement: SubmitRequirement)}
	{#if missing.includes(requirement)}
		<span class="size-1.5 shrink-0 rounded-full bg-attention" title="Needed to submit invoices">
			<span class="sr-only">(needed to submit invoices)</span>
		</span>
	{/if}
{/snippet}

<div>
	<div class="mb-8 flex flex-wrap items-end justify-between gap-2">
		<div>
			<h1>Settings</h1>
		</div>
		<p class="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
			{#if saveSettings.pending > 0}
				<!-- A quick save goes straight to "Saved" without flashing this first. -->
				<span class="flex appear-delayed items-center gap-1.5"><Spinner /> Saving…</span>
			{:else if fields.allIssues()}
				<CircleAlert size={15} class="text-destructive" /> Not saved. Fix the fields marked below.
			{:else if justSaved}
				<span
					class="flex animate-in items-center gap-1.5 duration-150 fade-in"
					out:fade={{ duration: 150 }}
				>
					<Check size={15} class="text-status-paid" /> Saved
				</span>
			{/if}
		</p>
	</div>

	{#if missing.length > 0}
		<Alert.Root variant="warning" class="mb-8">
			<TriangleAlert />
			<Alert.Title>Still needed before you can submit invoices</Alert.Title>
			<Alert.Description>
				<ul class="mt-1 list-disc space-y-0.5 pl-5">
					{#each missing as requirement (requirement)}
						<li>
							<a href="#{REQUIREMENT_FIELDS[requirement].id}" class="font-medium underline">
								{REQUIREMENT_FIELDS[requirement].text}
							</a>
						</li>
					{/each}
				</ul>
			</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Lives outside the settings form, which its button below submits through `form`. -->
	<form {...disconnect} id="disconnect-form"></form>

	<form
		{...enhanced}
		{@attach (node) => {
			formElement = node;
		}}
		onchange={(event) => event.currentTarget.requestSubmit()}
	>
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
						{@render needed('Open Collective connection')}
					</div>
				{/if}
				{#if connectError}
					<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
						<CircleAlert size={15} class="mt-0.5 shrink-0" />{connectError}
					</p>
				{/if}
			</div>

			<div class="space-y-1.5">
				<Label for="payout-method">Payout method{@render needed('payout method')}</Label>
				<input {...fields.payoutMethodId.as('hidden', values.payoutMethodId ?? '')} />
				<input {...fields.payoutMethodLabel.as('hidden', values.payoutMethodLabel ?? '')} />
				<Select.Root
					type="single"
					value={values.payoutMethodId ?? ''}
					onValueChange={choosePayoutMethod}
					disabled={payoutMethods.length === 0}
				>
					<Select.Trigger id="payout-method" class="w-full">
						{payoutLabel ??
							(payoutMethods.length === 0 ? 'Connect to load your methods' : 'Choose one')}
					</Select.Trigger>
					<Select.Content>
						{#each payoutMethods as method (method.id)}
							<Select.Item value={method.id}>
								{method.label}{method.currency ? ` (${method.currency})` : ''}
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<div class="grid gap-5 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="collective">Collective{@render needed('collective')}</Label>
					<Input
						id="collective"
						{...fields.collectiveSlug.as('text')}
						placeholder="your-project"
						aria-describedby="collective-hint"
					/>
					<p id="collective-hint" class="text-xs text-muted-foreground">
						{values.collectiveSlug
							? `opencollective.com/${values.collectiveSlug}`
							: 'The slug from its Open Collective address'}
					</p>
				</div>
				<div class="space-y-1.5">
					<Label for="invoice-note">Invoice note</Label>
					<Input id="invoice-note" {...fields.invoiceNote.as('text')} autocomplete="off" />
					<p class="text-xs text-muted-foreground">
						Optional. Added to every invoice, for example a tax number.
					</p>
				</div>
			</div>

			<div class="grid gap-5 sm:grid-cols-[1fr_8rem]">
				<div class="space-y-1.5">
					<Label for="address">Your address</Label>
					<Input id="address" {...fields.payeeAddress.as('text')} autocomplete="street-address" />
					{#if me?.address}
						<p class="text-xs text-muted-foreground">
							Leave empty to use your Open Collective address: {me.address}
						</p>
					{/if}
				</div>
				<div class="space-y-1.5">
					<Label for="country">Country code</Label>
					<Input id="country" {...fields.payeeCountry.as('text')} maxlength={2} class="uppercase" />
					{#each fields.payeeCountry.issues() ?? [] as issue (issue.message)}
						<p class="text-xs text-destructive">{issue.message}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Two letters{#if me?.country}, or empty for {me.country}{/if}
						</p>
					{/each}
				</div>
			</div>

			<details class="text-sm">
				<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
					Advanced
				</summary>
				<div class="mt-3 space-y-1.5">
					<Label for="category">Accounting category ID</Label>
					<Input id="category" {...fields.accountingCategoryId.as('text')} />
					<p class="text-xs text-muted-foreground">
						Starts with <code>acat_</code>. Only needed if the fiscal host rejects expenses without
						a category.
					</p>
				</div>
			</details>
		</SettingsSection>

		<SettingsSection title="Billing" description="Copied into each new invoice when you start it.">
			<div class="grid gap-5 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="rate">Hourly rate{@render needed('hourly rate')}</Label>
					<Input id="rate" {...fields.hourlyRate.as('number')} min="0" step="0.01" />
					{#each fields.hourlyRate.issues() ?? [] as issue (issue.message)}
						<p class="text-xs text-destructive">{issue.message}</p>
					{/each}
				</div>
				<div class="space-y-1.5">
					<Label for="currency">Currency</Label>
					<input {...fields.currency.as('hidden', values.currency ?? DEFAULT_SETTINGS.currency)} />
					<Select.Root
						type="single"
						value={values.currency}
						onValueChange={(code) => {
							fields.currency.set(code);
							void save();
						}}
					>
						<Select.Trigger id="currency" class="w-full">{values.currency}</Select.Trigger>
						<Select.Content>
							{#each CURRENCIES as code (code)}
								<Select.Item value={code}>{code}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>
			{#if Number(values.hourlyRate) > 0 && values.currency}
				<p class="text-sm text-muted-foreground">
					40 hours comes to {formatMoney(40 * Number(values.hourlyRate), values.currency)}.
				</p>
			{/if}
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
						onclick={verifyGitHub}
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

		<SettingsSection
			title="Backup"
			description="Download your settings to move them to another browser."
		>
			<div class="flex flex-wrap gap-2">
				<Button type="button" variant="outline" onclick={downloadBackup}>
					<Download /> Download backup
				</Button>
				<Button type="button" variant="outline" class="relative">
					<Upload /> Restore backup
					<input
						type="file"
						accept="application/json"
						class="absolute inset-0 cursor-pointer opacity-0"
						aria-label="Restore backup file"
						onchange={(event) => {
							// Not a setting, so keep it out of the autosave.
							event.stopPropagation();
							void importBackup(event);
						}}
					/>
				</Button>
				<Button
					type="button"
					variant="ghost"
					class="text-destructive"
					onclick={() => (clearDialogOpen = true)}
				>
					Delete all data
				</Button>
			</div>
			{#if backupMessage}
				<Alert.Root variant={backupMessage.ok ? 'default' : 'destructive'}>
					<Alert.Description>{backupMessage.text}</Alert.Description>
				</Alert.Root>
			{/if}
			<p class="text-xs text-muted-foreground">Backups never include your tokens.</p>
		</SettingsSection>
	</form>

	<Dialog.Root bind:open={clearDialogOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Delete all data?</Dialog.Title>
				<Dialog.Description>
					This removes every setting and the work log kept in this browser, and signs you out of
					Open Collective and Google. Expenses on Open Collective and the work log copy in your
					Google Drive are not touched.
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
</div>
