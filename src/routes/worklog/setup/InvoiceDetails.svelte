<script lang="ts">
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

	/** Empty goes back to the usual text, so a cleared field is never saved as blank. */
	function text(event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
		return event.currentTarget.value.trim() || undefined;
	}
</script>

{#snippet field({
	id,
	label,
	value,
	save,
	placeholder,
	type = 'text'
}: {
	id: string;
	label: string;
	value: string;
	save: (value: string) => void;
	placeholder?: string;
	type?: string;
})}
	<div class="space-y-1.5">
		<Label for={id}>{label}</Label>
		<Input
			{id}
			{type}
			{placeholder}
			autocomplete="off"
			{value}
			onchange={(event) => save(event.currentTarget.value.trim())}
		/>
	</div>
{/snippet}

<SettingsSection
	title="Invoices by email"
	description="Who the invoices you email are from and to, and how you are paid."
>
	<fieldset class="space-y-4">
		<legend class="mb-3 font-medium">You</legend>
		<div class="grid gap-3 sm:grid-cols-3">
			{@render field({
				id: 'invoice-name',
				label: 'Name',
				value: invoicing.name,
				save: (name) => change({ name })
			})}
			{@render field({
				id: 'invoice-email',
				label: 'Email',
				type: 'email',
				value: invoicing.email,
				save: (email) => change({ email })
			})}
			{@render field({
				id: 'invoice-phone',
				label: 'Phone',
				type: 'tel',
				value: invoicing.phone,
				save: (phone) => change({ phone })
			})}
		</div>
		<AddressFields
			id="invoice-address"
			address={invoicing.address}
			onchange={(address) => change({ address })}
		/>
		<div class="grid gap-3 sm:grid-cols-2">
			{@render field({
				id: 'invoice-tax-id',
				label: 'Income tax number',
				value: invoicing.taxId,
				save: (taxId) => change({ taxId })
			})}
			{@render field({
				id: 'invoice-vat-id',
				label: 'VAT number',
				placeholder: 'If you have one',
				value: invoicing.vatId,
				save: (vatId) => change({ vatId })
			})}
		</div>
	</fieldset>

	<fieldset class="space-y-4 border-t pt-5">
		<legend class="float-left mb-3 w-full font-medium">How you are paid</legend>
		<div class="clear-both grid gap-3 sm:grid-cols-2">
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
				placeholder="The bank's name and address, or a routing number"
				value={invoicing.payment}
				onchange={(event) => change({ payment: event.currentTarget.value.trim() })}
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="invoice-notes">Notes</Label>
			<Textarea
				id="invoice-notes"
				class="min-h-20"
				placeholder="Your tax status, or anything else every invoice should say"
				value={invoicing.notes}
				onchange={(event) => change({ notes: event.currentTarget.value.trim() })}
			/>
		</div>
	</fieldset>

	{#each clients as client (client.id)}
		{const category = $derived(client.tax?.category ?? 'outside-scope')}
		<fieldset class="space-y-4 border-t pt-5">
			<legend class="float-left mb-3 w-full font-medium">{client.name}</legend>
			<div class="clear-both grid gap-3 sm:grid-cols-2">
				{@render field({
					id: `${client.id}-legal-name`,
					label: 'Legal name',
					placeholder: client.name,
					value: client.legalName ?? '',
					save: (legalName) => onchange(client, { legalName: legalName || undefined })
				})}
				{@render field({
					id: `${client.id}-email`,
					label: 'Email to',
					type: 'email',
					placeholder: 'accounts@example.com',
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
			<div class="grid gap-3 sm:grid-cols-3">
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
			<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
				{@render field({
					id: `${client.id}-line-item`,
					label: 'Line item',
					placeholder: DEFAULT_LINE_ITEM,
					value: client.lineItem ?? '',
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
						placeholder={String(DEFAULT_PAYMENT_DAYS)}
						class="tabular-nums"
						value={client.paymentDays ?? ''}
						onchange={(event) => {
							const days = event.currentTarget.value.trim();
							const paymentDays = Number(days);
							if (!days) onchange(client, { paymentDays: undefined });
							else if (Number.isInteger(paymentDays) && paymentDays >= 0) {
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
					placeholder={DEFAULT_EMAIL_SUBJECT}
					value={client.emailSubject ?? ''}
					onchange={(event) => onchange(client, { emailSubject: text(event) })}
				/>
			</div>
			<div class="space-y-1.5">
				<Label for="{client.id}-message">Email message</Label>
				<Textarea
					id="{client.id}-message"
					class="min-h-28"
					placeholder={DEFAULT_EMAIL_MESSAGE}
					aria-describedby="{client.id}-message-hint"
					value={client.emailMessage ?? ''}
					onchange={(event) => onchange(client, { emailMessage: text(event) })}
				/>
				<p id="{client.id}-message-hint" class="text-xs text-muted-foreground">
					{'{number}'}, {'{period}'}, {'{amount}'} and {'{name}'} are filled in from each invoice.
				</p>
			</div>
		</fieldset>
	{/each}
</SettingsSection>
