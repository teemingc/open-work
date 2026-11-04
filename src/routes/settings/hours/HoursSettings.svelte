<script lang="ts">
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import type { Settings } from '#lib/settings.js';
	import { Plus } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import DeductionsEditor from './DeductionsEditor.svelte';

	const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'MYR', 'SGD'];
	/** The "To" choice that turns the second currency off. */
	const NO_CURRENCY = 'none';

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);

	/** The currency deductions are in: the one earnings are shown in. */
	const homeCurrency = $derived(
		store.data.exchange?.to ??
			store.data.clients.find((client) => !client.archived)?.currency ??
			data.settings.currency
	);
</script>

<SettingsSection
	title="Expected hours"
	description="How many hours you aim to work each working day."
>
	<div class="space-y-1.5">
		<Label for="hours-per-day">Hours per working day</Label>
		<Input
			id="hours-per-day"
			type="number"
			inputmode="decimal"
			min="0"
			max="24"
			step="0.5"
			class="w-32 tabular-nums"
			value={store.data.hoursPerDay}
			onchange={(event) => {
				const hoursPerDay = Number(event.currentTarget.value);
				if (hoursPerDay >= 0 && hoursPerDay <= 24) {
					store.setSchedule({ hoursPerDay, exchange: $state.snapshot(store.data.exchange) });
				}
			}}
		/>
	</div>
	<fieldset class="space-y-3">
		<legend class="text-sm font-medium">Show earnings in another currency</legend>
		<div class="grid grid-cols-2 gap-3 @md/settings:grid-cols-3">
			<div class="flex flex-col gap-1.5">
				<Label for="exchange-to">Show in</Label>
				<Select.Root
					type="single"
					value={store.data.exchange?.to ?? NO_CURRENCY}
					onValueChange={(to) => {
						const current = store.data.exchange;
						store.setSchedule({
							hoursPerDay: store.data.hoursPerDay,
							exchange:
								to === NO_CURRENCY
									? undefined
									: {
											from: current?.from ?? store.data.clients[0]?.currency ?? 'USD',
											rate: current?.rate ?? 1,
											to
										}
						});
					}}
				>
					<Select.Trigger id="exchange-to" class="mt-auto w-full">
						{#if store.data.exchange}
							{store.data.exchange.to}
						{:else}
							<span class="text-muted-foreground">None</span>
						{/if}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value={NO_CURRENCY}>None</Select.Item>
						{#each CURRENCIES as code (code)}
							<Select.Item value={code}>{code}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="exchange-from">Converted from</Label>
				<Select.Root
					type="single"
					disabled={!store.data.exchange}
					value={store.data.exchange?.from ?? ''}
					onValueChange={(from) => {
						const exchange = store.data.exchange;
						if (exchange) {
							store.setSchedule({
								hoursPerDay: store.data.hoursPerDay,
								exchange: { ...exchange, from }
							});
						}
					}}
				>
					<Select.Trigger id="exchange-from" class="mt-auto w-full">
						{store.data.exchange?.from ?? '—'}
					</Select.Trigger>
					<Select.Content>
						{#each CURRENCIES as code (code)}
							<Select.Item value={code}>{code}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="col-span-2 flex flex-col gap-1.5 @md/settings:col-span-1">
				<Label for="exchange-rate">Rate</Label>
				<Input
					id="exchange-rate"
					type="number"
					inputmode="decimal"
					min="0"
					step="0.01"
					class="tabular-nums"
					disabled={!store.data.exchange}
					value={store.data.exchange?.rate ?? ''}
					onchange={(event) => {
						const rate = Number(event.currentTarget.value);
						const exchange = store.data.exchange;
						if (exchange && rate > 0) {
							store.setSchedule({
								hoursPerDay: store.data.hoursPerDay,
								exchange: { ...exchange, rate }
							});
						}
					}}
				/>
			</div>
		</div>
		<p class="text-xs text-muted-foreground">
			{#if store.data.exchange}
				1 {store.data.exchange.from} = {store.data.exchange.rate} {store.data.exchange.to}.
			{:else}
				Totals show in each client's currency only.
			{/if}
		</p>
	</fieldset>
</SettingsSection>

<SettingsSection
	title="Deductions"
	description="Taken from what you earn each month, like income tax or a pension, to show what you take home."
>
	{#snippet action()}
		<Button
			variant="outline"
			size="sm"
			onclick={() =>
				store.addDeduction({ name: '', kind: 'percent', rate: undefined, base: 'gross' })}
		>
			<Plus /> Add a deduction
		</Button>
	{/snippet}
	<DeductionsEditor {store} currency={homeCurrency} />
</SettingsSection>
