<script lang="ts">
	import { downloadJson } from '#lib/download.js';
	import { resolve } from '$app/paths';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import DriveSyncStatus from '#lib/components/DriveSyncStatus.svelte';
	import { signInWithGoogle, signOutOfGoogle } from './auth-client';
	import { driveSync } from '#lib/drive-sync.svelte.js';
	import { WorkLogParseError, type WorkLogStore } from '#lib/worklog-store.svelte.js';
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
	import {
		Archive,
		ArchiveRestore,
		ChevronRight,
		Cloud,
		Download,
		LogOut,
		Plus,
		RefreshCw,
		Trash2,
		Upload
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import DaysOffEditor from './DaysOffEditor.svelte';
	import LeaveEditor from './LeaveEditor.svelte';

	const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'MYR', 'SGD'];
	const METHODS = { opencollective: 'Open Collective', email: 'Email' };
	const FREQUENCIES: Record<InvoiceFrequency, string> = {
		'twice-monthly': 'Twice a month',
		monthly: 'Monthly'
	};
	/** The "To" choice that turns the second currency off. */
	const NO_CURRENCY = 'none';

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);
	const sync = driveSync(store);

	let year = $state(String(new Date().getFullYear()));
	const years = $derived(
		[
			...new Set([
				String(new Date().getFullYear()),
				...[...store.data.holidays, ...store.data.leave, ...store.data.entries].map((item) =>
					item.date.slice(0, 4)
				)
			])
		].sort()
	);

	let clientMessage = $state<string | undefined>();
	const clients = $derived(store.data.clients.filter((client) => !client.archived));
	const archived = $derived(store.data.clients.filter((client) => client.archived));
	/** Clients with logged time are archived rather than deleted, so no entry loses its client. */
	const clientsWithTime = $derived(new Set(store.data.entries.map((entry) => entry.clientId)));
	let backupMessage = $state<{ tone: 'ok' | 'error'; text: string } | undefined>();

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

	function downloadBackup() {
		downloadJson({
			text: store.exportJson(),
			name: `work-log-${new Date().toISOString().slice(0, 10)}.json`
		});
	}

	/** The backup picked, waiting for you to confirm it replaces the log. */
	let pendingBackup = $state<File | undefined>();

	function pickBackup(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		pendingBackup = input.files?.[0];
		input.value = '';
	}

	async function restoreBackup(file: File) {
		pendingBackup = undefined;
		try {
			store.importJson(await file.text());
			backupMessage = {
				tone: 'ok',
				text: `Restored ${store.data.entries.length} entries for ${store.data.clients.length} clients.`
			};
		} catch (error) {
			backupMessage = {
				tone: 'error',
				text: error instanceof WorkLogParseError ? error.message : 'Could not read that file.'
			};
		}
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

<SettingsSection
	title="Expected hours"
	description="How many hours you aim to work each working day."
>
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="space-y-1.5">
			<Label for="hours-per-day">Hours per working day</Label>
			<Input
				id="hours-per-day"
				type="number"
				inputmode="decimal"
				min="0"
				max="24"
				step="0.5"
				class="tabular-nums"
				value={store.data.hoursPerDay}
				onchange={(event) => {
					const hoursPerDay = Number(event.currentTarget.value);
					if (hoursPerDay >= 0 && hoursPerDay <= 24) {
						store.setSchedule({ hoursPerDay, exchange: $state.snapshot(store.data.exchange) });
					}
				}}
			/>
		</div>
	</div>
	<fieldset class="space-y-3">
		<legend class="text-sm font-medium">Show earnings in another currency</legend>
		<div class="grid grid-cols-3 gap-3">
			<div class="space-y-1.5">
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
					<Select.Trigger id="exchange-to" class="w-full">
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
			<div class="space-y-1.5">
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
					<Select.Trigger id="exchange-from" class="w-full">
						{store.data.exchange?.from ?? '—'}
					</Select.Trigger>
					<Select.Content>
						{#each CURRENCIES as code (code)}
							<Select.Item value={code}>{code}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="space-y-1.5">
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

<SettingsSection title="Year">
	<div class="space-y-1.5">
		<Label for="year">Holidays and leave for</Label>
		<Select.Root type="single" bind:value={year}>
			<Select.Trigger id="year" class="w-32">{year}</Select.Trigger>
			<Select.Content>
				{#each years as option (option)}
					<Select.Item value={option}>{option}</Select.Item>
				{/each}
				<Select.Item value={String(Number(years.at(-1)) + 1)}
					>{Number(years.at(-1)) + 1}</Select.Item
				>
			</Select.Content>
		</Select.Root>
	</div>
</SettingsSection>

<SettingsSection
	title="Public holidays"
	description="Weekday holidays are taken off the working days. Import your country's or state's list, then fix anything that differs."
>
	<DaysOffEditor {store} kind="holidays" {year} />
</SettingsSection>

<SettingsSection title="Leave" description="Days you took off.">
	<LeaveEditor {store} {year} />
</SettingsSection>

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
				<Button variant="outline" onclick={() => signInWithGoogle(resolve('/worklog/setup'))}>
					<Cloud /> Sign in with Google
				</Button>
			{/if}
		</div>
	{/if}
</SettingsSection>

<SettingsSection
	title="Backup"
	description="A copy of the work log as a file, to keep or to move to a browser without Google Drive."
>
	<div class="flex flex-wrap gap-2">
		<Button variant="outline" onclick={downloadBackup}><Download /> Download backup</Button>
		<Button variant="outline" onclick={() => document.getElementById('restore-file')?.click()}>
			<Upload /> Restore a backup
		</Button>
		<input
			id="restore-file"
			type="file"
			accept=".json,application/json"
			class="sr-only"
			aria-label="Backup file"
			tabindex="-1"
			onchange={pickBackup}
		/>
	</div>
	<Dialog.Root
		bind:open={() => pendingBackup !== undefined, (open) => !open && (pendingBackup = undefined)}
	>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Replace your work log?</Dialog.Title>
				<Dialog.Description>
					Everything in the work log is replaced with what is in {pendingBackup?.name}.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (pendingBackup = undefined)}>Keep my log</Button>
				<Button variant="destructive" onclick={() => pendingBackup && restoreBackup(pendingBackup)}>
					Replace
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
	{#if backupMessage}
		<p
			role={backupMessage.tone === 'error' ? 'alert' : 'status'}
			class="text-sm {backupMessage.tone === 'error' ? 'text-destructive' : 'text-status-paid'}"
		>
			{backupMessage.text}
		</p>
	{/if}
</SettingsSection>
