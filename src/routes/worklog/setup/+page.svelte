<script lang="ts">
	import { resolve } from '$app/paths';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import DriveSyncStatus from '#lib/components/DriveSyncStatus.svelte';
	import { signInWithGoogle, signOutOfGoogle } from '#lib/auth-client.js';
	import { driveSync } from '#lib/drive-sync.svelte.js';
	import { WorkLogParseError } from '#lib/worklog-store.svelte.js';
	import { toIsoDate } from '#lib/format.js';
	import { withCurrentRate, withRates, type Client, type RateChange } from '#lib/worklog.js';
	import {
		ArrowLeft,
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
	/** The "To" choice that turns the second currency off. */
	const NO_CURRENCY = 'none';

	let { data } = $props();

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
		store.updateClient(withRates({ client: snapshot, rates, today: toIsoDate(new Date()) }));
	}

	function downloadBackup() {
		const blob = new Blob([store.exportJson()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `work-log-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function restoreBackup(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!confirm('Replace your whole work log with this backup?')) return;
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

<svelte:head><title>Clients and days off · Open Work</title></svelte:head>

<a
	href={resolve('/worklog')}
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
>
	<ArrowLeft size={15} /> Work log
</a>
<h1 class="mb-8 font-document text-2xl tracking-tight sm:text-3xl">Clients and days off</h1>

<SettingsSection
	title="Clients"
	description="Who you work for and what they pay an hour. New invoices take their hours from the client invoiced through Open Collective."
>
	<ul class="space-y-3">
		{#each store.data.clients as client (client.id)}
			<li
				class="grid grid-cols-2 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_7rem_7rem_auto] sm:items-end"
			>
				<!-- On a phone the name shares its row with the delete button; wider, everything is one row. -->
				<div class="col-span-2 flex items-end gap-2 sm:contents">
					<div class="min-w-0 flex-1 space-y-1.5">
						<Label for="{client.id}-name">Name</Label>
						<Input
							id="{client.id}-name"
							value={client.name}
							onchange={(event) => {
								const name = event.currentTarget.value.trim();
								if (name) changeClient(client, { name });
							}}
						/>
					</div>
					<Button
						variant="ghost"
						size="icon"
						class="shrink-0 sm:col-start-4 sm:row-start-1"
						aria-label="Remove {client.name}"
						onclick={() => {
							clientMessage = store.removeClient(client.id)
								? undefined
								: `${client.name} has logged time, so it stays. Delete its entries first.`;
						}}
					>
						<Trash2 size={16} />
					</Button>
				</div>
				<div class="space-y-1.5">
					<Label for="{client.id}-rate">Per hour</Label>
					<Input
						id="{client.id}-rate"
						type="number"
						inputmode="decimal"
						min="0"
						step="0.01"
						class="tabular-nums"
						value={client.rate}
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
				</div>
				<div class="space-y-1.5">
					<Label for="{client.id}-currency">Currency</Label>
					<Select.Root
						type="single"
						value={client.currency}
						onValueChange={(currency) => changeClient(client, { currency })}
					>
						<Select.Trigger id="{client.id}-currency" class="w-full"
							>{client.currency}</Select.Trigger
						>
						<Select.Content>
							{#each CURRENCIES as code (code)}
								<Select.Item value={code}>{code}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="col-span-2 flex items-center gap-2 border-t pt-3 sm:col-span-4">
					<Checkbox
						id="{client.id}-oc"
						checked={client.openCollective}
						onCheckedChange={(checked) =>
							changeClient(client, { openCollective: checked === true })}
					/>
					<Label for="{client.id}-oc" class="font-normal">Invoiced through Open Collective</Label>
				</div>
				<details class="group col-span-2 sm:col-span-4" open={(client.rates?.length ?? 0) > 0}>
					<summary
						class="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
					>
						<ChevronRight size={15} class="transition-transform group-open:rotate-90" />
						Rate changes
					</summary>
					<div class="mt-3 space-y-3">
						<p class="text-xs text-muted-foreground">
							Each rate applies from its date until the next change, so past work earns what you
							billed at the time. Dates before the first change use the rate per hour.
						</p>
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
									rates.push({ from: toIsoDate(new Date()), rate: client.rate })
								)}
						>
							<Plus /> Add a rate change
						</Button>
					</div>
				</details>
			</li>
		{/each}
	</ul>
	{#if clientMessage}<p role="alert" class="text-sm text-destructive">{clientMessage}</p>{/if}
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
	description="Each working day expects these hours. Weekends, holidays and leave expect none."
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

<SettingsSection
	title="Leave"
	description="Days you took off. Each weekday of leave expects no hours."
>
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
			onchange={restoreBackup}
		/>
	</div>
	{#if backupMessage}
		<p
			role={backupMessage.tone === 'error' ? 'alert' : 'status'}
			class="text-sm {backupMessage.tone === 'error' ? 'text-destructive' : 'text-status-paid'}"
		>
			{backupMessage.text}
		</p>
	{/if}
</SettingsSection>
