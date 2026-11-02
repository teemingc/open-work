<script lang="ts">
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { emptyInvoicing, type Invoicing } from '#lib/worklog.js';
	import type { FullAutoFill } from 'svelte/elements';
	import AddressFields from './AddressFields.svelte';

	let { store }: { store: WorkLogStore } = $props();

	const invoicing = $derived(store.data.invoicing ?? emptyInvoicing());

	function change(patch: Partial<Invoicing>) {
		store.setInvoicing({ ...$state.snapshot(invoicing), ...patch });
	}
</script>

{#snippet field({
	id,
	label,
	value,
	save,
	placeholder,
	type = 'text',
	autocomplete = 'off'
}: {
	id: string;
	label: string;
	value: string;
	save: (value: string) => void;
	placeholder?: string;
	type?: string;
	autocomplete?: FullAutoFill;
})}
	<div class="space-y-1.5">
		<Label for={id}>{label}</Label>
		<Input
			{id}
			{type}
			{placeholder}
			{autocomplete}
			{value}
			onchange={(event) => save(event.currentTarget.value.trim())}
		/>
	</div>
{/snippet}

<!-- Open Collective expenses take the address, tax number and notes; emailed invoices take all of it. -->
<SettingsSection title="You" description="Who your invoices are from.">
	<div class="grid gap-3 sm:grid-cols-3">
		{@render field({
			id: 'invoice-name',
			label: 'Name',
			autocomplete: 'name',
			value: invoicing.name,
			save: (name) => change({ name })
		})}
		{@render field({
			id: 'invoice-email',
			label: 'Email',
			type: 'email',
			autocomplete: 'email',
			value: invoicing.email,
			save: (email) => change({ email })
		})}
		{@render field({
			id: 'invoice-phone',
			label: 'Phone',
			type: 'tel',
			autocomplete: 'tel',
			value: invoicing.phone,
			save: (phone) => change({ phone })
		})}
	</div>
	<AddressFields
		id="invoice-address"
		own
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
</SettingsSection>
