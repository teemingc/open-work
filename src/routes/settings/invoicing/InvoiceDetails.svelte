<script lang="ts">
	import ClientName from '#lib/components/ClientName.svelte';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import {
		DEFAULT_EMAIL_MESSAGE,
		DEFAULT_EMAIL_SUBJECT,
		DEFAULT_LINE_ITEM,
		DEFAULT_PAYMENT_DAYS,
		emptyInvoicing,
		type Client,
		type Invoicing,
		type TaxCategory
	} from '#lib/worklog.js';
	import AddressFields from './AddressFields.svelte';

	let {
		store,
		clients,
		onchange
	}: {
		store: WorkLogStore;
		/** The clients invoiced by email. */
		clients: Client[];
		onchange: (client: Client, patch: Partial<Client>) => void;
	} = $props();

	const TAX: Record<TaxCategory, string> = {
		'outside-scope': 'No VAT',
		'reverse-charge': 'Reverse charge',
		standard: 'VAT at a rate'
	};

	const invoicing = $derived(store.data.invoicing ?? emptyInvoicing());

	function change(patch: Partial<Invoicing>) {
		store.setInvoicing({ ...$state.snapshot(invoicing), ...patch });
	}

	/**
	 * Fields show the usual text until changed. Empty or the usual text comes back empty, to save
	 * as nothing, so a cleared field goes back to the usual text and keeps up with a change to it.
	 */
	function ownText(
		event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement },
		usual: string
	) {
		const value = event.currentTarget.value.trim();
		if (!value) event.currentTarget.value = usual;
		return value === usual ? '' : value;
	}
</script>

{#snippet field({
	id,
	label,
	value,
	save,
	usual,
	type = 'text'
}: {
	id: string;
	label: string;
	value: string;
	save: (value: string) => void;
	/** Shown when the field is empty, and saved as empty. */
	usual?: string;
	type?: string;
})}
	<div class="space-y-1.5">
		<Label for={id}>{label}</Label>
		<Input
			{id}
			{type}
			autocomplete="off"
			{value}
			onchange={(event) =>
				save(usual === undefined ? event.currentTarget.value.trim() : ownText(event, usual))}
		/>
	</div>
{/snippet}

<SettingsSection
	title="Invoices by email"
	description="How you are paid, and who each invoice you email goes to."
>
	<fieldset class="space-y-4">
		<legend class="float-left mb-3 w-full font-medium">How you are paid</legend>
		<div class="clear-both grid gap-3 @xl/settings:grid-cols-2">
			{@render field({
				id: 'invoice-account-name',
				label: 'Account name',
				value: invoicing.accountName,
				save: (accountName) => change({ accountName })
			})}
			{@render field({
				id: 'invoice-account-number',
				label: 'IBAN or account number',
				value: invoicing.accountNumber,
				save: (accountNumber) => change({ accountNumber })
			})}
			{@render field({
				id: 'invoice-bic',
				label: 'BIC or SWIFT code',
				value: invoicing.bic,
				save: (bic) => change({ bic: bic.toUpperCase() })
			})}
		</div>
		<div class="space-y-1.5">
			<Label for="invoice-payment">Other payment details</Label>
			<Textarea
				id="invoice-payment"
				class="min-h-20"
				value={invoicing.payment}
				onchange={(event) => change({ payment: event.currentTarget.value.trim() })}
			/>
		</div>
	</fieldset>

	{#each clients as client (client.id)}
		{const category = $derived(client.tax?.category ?? 'outside-scope')}
		<fieldset class="space-y-4 border-t pt-5">
			<legend class="float-left mb-3 w-full font-medium"><ClientName {client} /></legend>
			<div class="clear-both grid gap-3 @xl/settings:grid-cols-2">
				{@render field({
					id: `${client.id}-legal-name`,
					label: 'Legal name',
					value: client.legalName ?? client.name,
					usual: client.name,
					save: (legalName) => onchange(client, { legalName: legalName || undefined })
				})}
				{@render field({
					id: `${client.id}-email`,
					label: 'Email to',
					type: 'email',
					value: client.email ?? '',
					save: (email) => onchange(client, { email: email || undefined })
				})}
			</div>
			<AddressFields
				id="{client.id}-address"
				address={client.address}
				onchange={(address) => onchange(client, { address })}
			/>
			<!-- Only what the chosen VAT treatment needs: most clients abroad need none of it. -->
			<div class="grid gap-3 @xl/settings:grid-cols-3">
				<div class="space-y-1.5">
					<Label for="{client.id}-tax">VAT</Label>
					<Select.Root
						type="single"
						value={category}
						onValueChange={(value) =>
							onchange(client, {
								tax: { category: value as TaxCategory, rate: client.tax?.rate }
							})}
					>
						<Select.Trigger id="{client.id}-tax" class="w-full">{TAX[category]}</Select.Trigger>
						<Select.Content>
							{#each Object.entries(TAX) as [value, label] (value)}
								<Select.Item {value}>{label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				{#if category === 'standard'}
					<div class="space-y-1.5">
						<Label for="{client.id}-tax-rate">Rate (%)</Label>
						<Input
							id="{client.id}-tax-rate"
							type="number"
							inputmode="decimal"
							min="0"
							max="100"
							step="0.1"
							class="tabular-nums"
							value={client.tax?.rate ?? ''}
							onchange={(event) => {
								const rate = Number(event.currentTarget.value);
								if (rate >= 0 && rate <= 100) onchange(client, { tax: { category, rate } });
							}}
						/>
					</div>
				{/if}
				{#if category !== 'outside-scope'}
					{@render field({
						id: `${client.id}-vat-id`,
						label: 'Their VAT number',
						value: client.vatId ?? '',
						save: (vatId) => onchange(client, { vatId: vatId || undefined })
					})}
				{/if}
			</div>
			<div class="grid gap-3 @xl/settings:grid-cols-[minmax(0,1fr)_8rem]">
				{@render field({
					id: `${client.id}-line-item`,
					label: 'Line item',
					value: client.lineItem ?? DEFAULT_LINE_ITEM,
					usual: DEFAULT_LINE_ITEM,
					save: (lineItem) => onchange(client, { lineItem: lineItem || undefined })
				})}
				<div class="space-y-1.5">
					<Label for="{client.id}-payment-days">Days to pay</Label>
					<Input
						id="{client.id}-payment-days"
						type="number"
						inputmode="numeric"
						min="0"
						step="1"
						class="tabular-nums"
						value={client.paymentDays ?? DEFAULT_PAYMENT_DAYS}
						onchange={(event) => {
							const days = event.currentTarget.value.trim();
							const paymentDays = Number(days);
							if (!days || paymentDays === DEFAULT_PAYMENT_DAYS) {
								event.currentTarget.value = String(DEFAULT_PAYMENT_DAYS);
								onchange(client, { paymentDays: undefined });
							} else if (Number.isInteger(paymentDays) && paymentDays >= 0) {
								onchange(client, { paymentDays });
							}
						}}
					/>
				</div>
			</div>
			<div class="space-y-1.5">
				<Label for="{client.id}-subject">Email subject</Label>
				<Input
					id="{client.id}-subject"
					value={client.emailSubject || DEFAULT_EMAIL_SUBJECT}
					onchange={(event) =>
						onchange(client, {
							emailSubject: ownText(event, DEFAULT_EMAIL_SUBJECT) || undefined
						})}
				/>
			</div>
			<div class="space-y-1.5">
				<Label for="{client.id}-message">Email message</Label>
				<Textarea
					id="{client.id}-message"
					class="min-h-28"
					aria-describedby="{client.id}-message-hint"
					value={client.emailMessage || DEFAULT_EMAIL_MESSAGE}
					onchange={(event) =>
						onchange(client, {
							emailMessage: ownText(event, DEFAULT_EMAIL_MESSAGE) || undefined
						})}
				/>
				<p id="{client.id}-message-hint" class="text-xs text-muted-foreground">
					{'{number}'}, {'{period}'}, {'{amount}'} and {'{name}'} are filled in from each invoice.
				</p>
			</div>
		</fieldset>
	{/each}
</SettingsSection>
