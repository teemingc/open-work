<script lang="ts">
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import type { Settings } from '#lib/settings.js';
	import { formatDMY, toIsoDate } from '#lib/format.js';
	import {
		invoiceFrequency,
		rateOn,
		withCurrentRate,
		withRates,
		type Client,
		type InvoiceFrequency,
		type RateChange
	} from '#lib/worklog.js';
	import { Archive, ArchiveRestore, ChevronRight, Plus, Trash2 } from '@lucide/svelte';
	import { untrack } from 'svelte';

	const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'MYR', 'SGD'];
	const METHODS = { opencollective: 'Open Collective', email: 'Email' };
	const FREQUENCIES: Record<InvoiceFrequency, string> = {
		'twice-monthly': 'Twice a month',
		monthly: 'Monthly'
	};

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);

	let clientMessage = $state<string | undefined>();
	const clients = $derived(store.data.clients.filter((client) => !client.archived));
	const archived = $derived(store.data.clients.filter((client) => client.archived));
	/** Clients with logged time are archived rather than deleted, so no entry loses its client. */
	const clientsWithTime = $derived(new Set(store.data.entries.map((entry) => entry.clientId)));

	/**
	 * The client as stored right now. Edits build on this rather than on the copy the page drew,
	 * so two quick edits in a row (a rate, then a checkbox) never undo each other.
	 */
	function latest(client: Client): Client {
		return $state.snapshot(store.client(client.id) ?? client);
	}

	function changeClient(client: Client, patch: Partial<Client>) {
		store.updateClient({ ...latest(client), ...patch });
	}

	function changeRates(client: Client, change: (rates: RateChange[]) => void) {
		const snapshot = latest(client);
		const rates = snapshot.rates ?? [];
		change(rates);
		store.updateClient(withRates({ client: snapshot, rates }));
	}
</script>

<SettingsSection
	title="Clients"
	description="Who you work for, what they pay an hour, and how and how often you invoice them. Archive a client you no longer work for to keep its logged time."
>
	<ul class="space-y-3">
		{#each clients as client (client.id)}
			<li class="rounded-lg border bg-card">
				<!-- The name heads the card, so each client reads as its own record rather than a row of equal fields. -->
				<div class="flex items-center gap-2 border-b py-2 pr-2 pl-1.5">
					<Label for="{client.id}-name" class="sr-only">Name</Label>
					<Input
						id="{client.id}-name"
						class="h-9 min-w-0 flex-1 border-transparent bg-transparent px-1.5 font-display text-lg shadow-none hover:border-input focus-visible:border-ring md:text-lg dark:bg-transparent"
						value={client.name}
						onchange={(event) => {
							const name = event.currentTarget.value.trim();
							if (name) changeClient(client, { name });
						}}
					/>
					{#if clientsWithTime.has(client.id)}
						<Button
							variant="ghost"
							size="sm"
							class="shrink-0 text-muted-foreground"
							aria-label="Archive {client.name}"
							onclick={() => changeClient(client, { archived: true })}
						>
							<Archive /> Archive
						</Button>
					{:else}
						<Button
							variant="ghost"
							size="sm"
							class="shrink-0 text-muted-foreground"
							aria-label="Remove {client.name}"
							onclick={() => {
								clientMessage = store.removeClient(client.id)
									? undefined
									: `${client.name} has logged time, so it stays.`;
							}}
						>
							<Trash2 /> Remove
						</Button>
					{/if}
				</div>
				<div class="grid grid-cols-2 gap-x-3 gap-y-4 p-3 lg:grid-cols-4">
					<div class="space-y-1.5">
						<Label for="{client.id}-rate">Per hour</Label>
						<!-- The currency is part of the rate, so it is attached to it rather than a field of its own. -->
						<div class="flex">
							<Input
								id="{client.id}-rate"
								type="number"
								inputmode="decimal"
								min="0"
								step="0.01"
								class="min-w-0 rounded-r-none tabular-nums focus-visible:z-10"
								value={rateOn(client, toIsoDate(new Date()))}
								onchange={(event) => {
									const rate = Number(event.currentTarget.value);
									if (Number.isFinite(rate) && rate >= 0) {
										store.updateClient(
											withCurrentRate({
												client: latest(client),
												rate,
												today: toIsoDate(new Date())
											})
										);
									}
								}}
							/>
							<Select.Root
								type="single"
								value={client.currency}
								onValueChange={(currency) => changeClient(client, { currency })}
							>
								<Select.Trigger
									class="-ml-px w-[5.25rem] shrink-0 rounded-l-none bg-muted/50"
									aria-label="Currency"
								>
									{client.currency}
								</Select.Trigger>
								<Select.Content>
									{#each CURRENCIES as code (code)}
										<Select.Item value={code}>{code}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>
					<div class="space-y-1.5">
						<Label for="{client.id}-method">Invoiced through</Label>
						<Select.Root
							type="single"
							value={client.openCollective ? 'opencollective' : 'email'}
							onValueChange={(method) =>
								changeClient(client, { openCollective: method === 'opencollective' })}
						>
							<Select.Trigger id="{client.id}-method" class="w-full">
								{client.openCollective ? METHODS.opencollective : METHODS.email}
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(METHODS) as [value, label] (value)}
									<Select.Item {value}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-1.5">
						<Label for="{client.id}-frequency">How often</Label>
						<Select.Root
							type="single"
							value={invoiceFrequency(client)}
							onValueChange={(frequency) =>
								changeClient(client, { frequency: frequency as InvoiceFrequency })}
						>
							<Select.Trigger id="{client.id}-frequency" class="w-full">
								{FREQUENCIES[invoiceFrequency(client)]}
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(FREQUENCIES) as [value, label] (value)}
									<Select.Item {value}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-1.5">
						<Label for="{client.id}-share">Share of hours</Label>
						<!-- The unit sits in the field, and only once there is a number for it to qualify. -->
						<div class="relative">
							<Input
								id="{client.id}-share"
								type="number"
								inputmode="decimal"
								min="0"
								max="100"
								step="1"
								placeholder="None"
								class="peer pr-8 tabular-nums"
								value={client.targetShare ?? ''}
								onchange={(event) => {
									const text = event.currentTarget.value.trim();
									const share = Number(text);
									if (!text) changeClient(client, { targetShare: undefined });
									else if (Number.isFinite(share) && share >= 0 && share <= 100) {
										changeClient(client, { targetShare: share });
									}
								}}
							/>
							<span
								class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground peer-placeholder-shown:hidden"
								aria-hidden="true">%</span
							>
						</div>
					</div>
					<details class="group col-span-2 lg:col-span-4" open={(client.rates?.length ?? 0) > 0}>
						<summary
							class="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
						>
							<ChevronRight
								size={15}
								class="transition-transform group-open:rotate-90 motion-reduce:transition-none"
							/>
							Rate changes
						</summary>
						<div class="mt-3 space-y-3">
							<p class="text-xs text-muted-foreground">
								Each rate applies from its date until the next change, so past work earns what you
								billed at the time.
							</p>
							{#if client.rates?.length}
								<div class="max-w-40 space-y-1.5">
									<Label for="{client.id}-base-rate">Before {formatDMY(client.rates[0].from)}</Label
									>
									<Input
										id="{client.id}-base-rate"
										type="number"
										inputmode="decimal"
										min="0"
										step="0.01"
										class="tabular-nums"
										value={client.rate}
										onchange={(event) => {
											const rate = Number(event.currentTarget.value);
											if (Number.isFinite(rate) && rate >= 0) changeClient(client, { rate });
										}}
									/>
								</div>
							{/if}
							{#each client.rates ?? [] as change, index (index)}
								<div class="grid grid-cols-[1fr_7rem_auto] items-end gap-3">
									<div class="space-y-1.5">
										<Label for="{client.id}-rate-{index}-from">From</Label>
										<Input
											id="{client.id}-rate-{index}-from"
											type="date"
											value={change.from}
											onchange={(event) => {
												const from = event.currentTarget.value;
												if (from) changeRates(client, (rates) => (rates[index].from = from));
											}}
										/>
									</div>
									<div class="space-y-1.5">
										<Label for="{client.id}-rate-{index}-rate">Per hour</Label>
										<Input
											id="{client.id}-rate-{index}-rate"
											type="number"
											inputmode="decimal"
											min="0"
											step="0.01"
											class="tabular-nums"
											value={change.rate}
											onchange={(event) => {
												const rate = Number(event.currentTarget.value);
												if (Number.isFinite(rate) && rate >= 0) {
													changeRates(client, (rates) => (rates[index].rate = rate));
												}
											}}
										/>
									</div>
									<Button
										variant="ghost"
										size="icon"
										aria-label="Remove the rate from {change.from}"
										onclick={() => changeRates(client, (rates) => rates.splice(index, 1))}
									>
										<Trash2 size={16} />
									</Button>
								</div>
							{/each}
							<Button
								variant="outline"
								size="sm"
								onclick={() =>
									changeRates(client, (rates) =>
										rates.push({
											from: toIsoDate(new Date()),
											rate: rateOn(client, toIsoDate(new Date()))
										})
									)}
							>
								<Plus /> Add a rate change
							</Button>
						</div>
					</details>
				</div>
			</li>
		{/each}
	</ul>
	{#if clientMessage}<p role="alert" class="text-sm text-destructive">{clientMessage}</p>{/if}
	{#if archived.length > 0}
		<details class="group">
			<summary
				class="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
			>
				<ChevronRight
					size={15}
					class="transition-transform group-open:rotate-90 motion-reduce:transition-none"
				/>
				Archived clients ({archived.length})
			</summary>
			<!-- A quiet ruled list rather than cards: these are kept for their history, not edited. -->
			<ul class="mt-2 ml-5 divide-y border-y text-sm">
				{#each archived as client (client.id)}
					<li class="flex items-center justify-between gap-3 py-1">
						<span class="min-w-0 truncate text-muted-foreground">{client.name}</span>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => changeClient(client, { archived: false })}
						>
							<ArchiveRestore /> Restore
						</Button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
	<Button
		variant="outline"
		onclick={() =>
			store.addClient({
				name: `Client ${store.data.clients.length + 1}`,
				rate: data.settings.hourlyRate,
				currency: data.settings.currency,
				openCollective: false
			})}
	>
		<Plus /> Add a client
	</Button>
</SettingsSection>
