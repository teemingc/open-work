<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import SettingsForm from '#lib/components/SettingsForm.svelte';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { getMe } from '#lib/opencollective.remote.js';
	import { saveSettings } from '#lib/settings.remote.js';
	import { missingFromSettings, requirementFix, type SettingsRequirement } from '#lib/settings.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { defaultClient, openCollectiveRate, type Client } from '#lib/worklog.js';
	import { ChevronRight, CircleAlert, CircleCheck, TriangleAlert } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import InvoiceDetails from './InvoiceDetails.svelte';
	import YourDetails from './YourDetails.svelte';

	/** In the order the warning lists them. */
	const REQUIREMENTS: SettingsRequirement[] = [
		'Open Collective connection',
		'payout method',
		'hourly rate'
	];

	let { store: storeProp }: { store: WorkLogStore } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => storeProp);
	const emailed = $derived(
		store.data.clients.filter((client) => !client.archived && !client.openCollective)
	);

	function changeClient(client: Client, patch: Partial<Client>) {
		store.updateClient({ ...$state.snapshot(store.client(client.id) ?? client), ...patch });
	}

	/** The client whose rate the hourly-rate requirement is about. */
	const openCollectiveClientId = $derived(
		defaultClient(store.data.clients.filter((client) => client.openCollective))?.id
	);

	const me = $derived(await getMe());
	const settings = $derived(store.settings);
	const missing = $derived(
		missingFromSettings({
			settings,
			connected: me !== null,
			rate: openCollectiveRate(store.data.clients)
		})
	);
	/**
	 * Everything the warning has listed while the page is open. A requirement once met stays,
	 * ticked off, so the warning keeps its height and the fields below it do not jump up.
	 */
	const missingAtOpen = untrack(() => missing);
	const listed = $derived(
		REQUIREMENTS.filter(
			(requirement) => missingAtOpen.includes(requirement) || missing.includes(requirement)
		)
	);

	const fields = saveSettings.fields;
	const values = $derived(fields.value());

	const payoutMethods = $derived(me?.payoutMethods ?? []);
	const payoutLabel = $derived(
		payoutMethods.find((method) => method.id === values.payoutMethodId)?.label ??
			values.payoutMethodLabel
	);
</script>

<!--
	Beside each field the warning above lists, until it is filled in. The same icon as on the
	Connections tab, which shows while Open Collective is not connected.
-->
{#snippet needed(requirement: SettingsRequirement)}
	{#if missing.includes(requirement)}
		<CircleAlert size={14} class="shrink-0 text-attention" />
		<span class="sr-only">(needed to submit invoices)</span>
	{/if}
{/snippet}

{#if listed.length > 0}
	<Alert.Root variant={missing.length > 0 ? 'warning' : 'default'} class="mb-8">
		{#if missing.length > 0}<TriangleAlert />{:else}<CircleCheck class="text-status-paid" />{/if}
		<Alert.Title>
			{missing.length > 0
				? 'Still needed before you can submit invoices'
				: 'Ready to submit invoices'}
		</Alert.Title>
		<Alert.Description>
			<ul class="mt-1 space-y-0.5">
				{#each listed as requirement (requirement)}
					{const {
						fix: text,
						page,
						id
					} = requirementFix({
						requirement,
						clientId: openCollectiveClientId
					})}
					<li class="flex items-center gap-1.5">
						{#if missing.includes(requirement)}
							<CircleAlert size={14} class="shrink-0 text-attention" />
							<a href="{resolve(page)}{id ? `#${id}` : ''}" class="font-medium underline">
								{text}
							</a>
						{:else}
							<CircleCheck size={14} class="shrink-0 text-status-paid" />
							<span class="line-through">{text}</span>
							<span class="sr-only">(done)</span>
						{/if}
					</li>
				{/each}
			</ul>
		</Alert.Description>
	</Alert.Root>
{/if}

<!-- First: Open Collective expenses and emailed invoices are both from you. -->
<YourDetails {store} />

<SettingsForm
	{settings}
	{store}
	shown={['payoutMethodId', 'payoutMethodLabel', 'accountingCategoryId']}
>
	{#snippet children({ save })}
		<SettingsSection
			title="Open Collective"
			description="Where your expenses go and how you are paid."
		>
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
						{payoutLabel ?? (me ? 'Choose one' : 'Connect Open Collective to load your methods')}
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

			<details class="group text-sm">
				<summary
					class="flex min-h-10 w-fit cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
				>
					<ChevronRight
						size={15}
						class="transition-transform group-open:rotate-90 motion-reduce:transition-none"
					/>
					Advanced
				</summary>
				<div class="mt-1 space-y-1.5">
					<Label for="category">Accounting category ID</Label>
					<Input id="category" {...fields.accountingCategoryId.as('text')} />
					<p class="text-xs text-muted-foreground">
						Starts with <code>acat_</code>. Only needed if the fiscal host rejects expenses without
						a category.
					</p>
				</div>
			</details>
		</SettingsSection>
	{/snippet}
</SettingsForm>

{#if emailed.length > 0}
	<InvoiceDetails {store} clients={emailed} onchange={changeClient} />
{/if}
