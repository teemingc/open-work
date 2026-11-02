<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import SettingsForm from '#lib/components/SettingsForm.svelte';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { formatMoney } from '#lib/format.js';
	import { oauthErrorMessage } from '#lib/oauth-error.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { disconnect, getSettings, saveSettings } from '#lib/settings.remote.js';
	import {
		DEFAULT_SETTINGS,
		missingFromSettings,
		type SettingsRequirement
	} from '#lib/settings.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import type { Client } from '#lib/worklog.js';
	import { CircleAlert, CircleCheck, TriangleAlert } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import InvoiceDetails from './InvoiceDetails.svelte';

	const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'MYR', 'SGD'];

	/** Where each missing requirement is fixed on this page. */
	const REQUIREMENT_FIELDS: Record<SettingsRequirement, { id: string; text: string }> = {
		'Open Collective connection': { id: 'oc-connection', text: 'Connect Open Collective' },
		'payout method': { id: 'payout-method', text: 'Choose a payout method' },
		'hourly rate': { id: 'rate', text: 'Set your hourly rate' }
	};

	let { store: storeProp }: { store: WorkLogStore } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => storeProp);
	const emailed = $derived(
		store.data.clients.filter((client) => !client.archived && !client.openCollective)
	);

	function changeClient(client: Client, patch: Partial<Client>) {
		store.updateClient({ ...$state.snapshot(store.client(client.id) ?? client), ...patch });
	}

	const [me, settings] = $derived(await Promise.all([getMe(), getSettings()]));
	const missing = $derived(missingFromSettings({ settings, connected: me !== null }));

	const fields = saveSettings.fields;
	const values = $derived(fields.value());

	// Open Collective connection, kept in a server cookie by the OAuth flow
	const payoutMethods = $derived(me?.payoutMethods ?? []);
	const payoutLabel = $derived(
		payoutMethods.find((method) => method.id === values.payoutMethodId)?.label ??
			values.payoutMethodLabel
	);
	const connectError = $derived(oauthErrorMessage(page.url.searchParams.get('oc_error')));
</script>

<!--
	Beside each field the warning above lists, until it is filled in. The same dot as on the
	Invoicing tab, which shows while Open Collective is not connected.
-->
{#snippet needed(requirement: SettingsRequirement)}
	{#if missing.includes(requirement)}
		<span class="size-1.5 shrink-0 rounded-full bg-attention" title="Needed to submit invoices">
			<span class="sr-only">(needed to submit invoices)</span>
		</span>
	{/if}
{/snippet}

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

<SettingsForm
	{settings}
	shown={[
		'payoutMethodId',
		'payoutMethodLabel',
		'invoiceNote',
		'payeeAddress',
		'payeeCountry',
		'accountingCategoryId',
		'hourlyRate',
		'currency'
	]}
>
	{#snippet children({ save })}
		<SettingsSection
			title="Open Collective"
			description="Lists the expenses you have sent and lets you submit new ones straight to each client's collective."
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
					onValueChange={(id) => {
						fields.payoutMethodId.set(id);
						fields.payoutMethodLabel.set(
							payoutMethods.find((method) => method.id === id)?.label ?? ''
						);
						void save();
					}}
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

			<div class="space-y-1.5">
				<Label for="invoice-note">Invoice note</Label>
				<Input id="invoice-note" {...fields.invoiceNote.as('text')} autocomplete="off" />
				<p class="text-xs text-muted-foreground">
					Optional. Added to every invoice, for example a tax number.
				</p>
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
	{/snippet}
</SettingsForm>

{#if emailed.length > 0}
	<InvoiceDetails {store} clients={emailed} onchange={changeClient} />
{/if}
