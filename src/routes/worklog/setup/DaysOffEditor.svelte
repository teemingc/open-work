<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { isWeekday, parseDaysOff } from '#lib/worklog.js';
	import { ClipboardPaste, Plus, Trash2, Upload } from '@lucide/svelte';

	let { store, kind, year }: { store: WorkLogStore; kind: 'holidays' | 'leave'; year: string } =
		$props();

	const id = $props.id();
	const noun = $derived(kind === 'holidays' ? 'holiday' : 'day of leave');
	const days = $derived(
		store.data[kind]
			.map((day, index) => ({ day, index }))
			.filter(({ day }) => day.date.startsWith(year))
	);

	let pasted = $state('');
	let message = $state<string | undefined>();
	let newDate = $state('');
	let newName = $state('');

	function importText(text: string) {
		const { days: parsed, skipped } = parseDaysOff(text);
		const added = store.addDaysOff({ kind, days: parsed });
		const replaced = parsed.length - added;
		message =
			`Added ${added}${replaced ? `, updated ${replaced}` : ''}.` +
			(skipped.length > 0
				? ` Skipped ${skipped.length} ${skipped.length === 1 ? 'line' : 'lines'} without a date: ${skipped.slice(0, 3).join('; ')}${skipped.length > 3 ? '…' : ''}`
				: '');
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importText(await file.text());
		input.value = '';
	}
</script>

<div class="space-y-3">
	{#if days.length === 0}
		<p class="text-sm text-muted-foreground">
			No {kind === 'holidays' ? 'holidays' : 'leave'} in {year} yet.
		</p>
	{:else}
		<ul
			class="divide-y rounded-lg border"
			aria-label="{kind === 'holidays' ? 'Holidays' : 'Leave'} in {year}"
		>
			{#each days as { day, index } (day.date)}
				<li class="flex flex-wrap items-center gap-2 p-2">
					<Input
						type="date"
						aria-label="Date"
						class="block w-40"
						value={day.date}
						onchange={(event) => {
							const date = event.currentTarget.value;
							if (date) store.updateDayOff({ kind, index, day: { ...day, date } });
						}}
					/>
					<Input
						aria-label="Name"
						class="min-w-0 flex-1"
						value={day.name}
						placeholder={kind === 'holidays' ? 'Name' : 'Note (optional)'}
						onchange={(event) =>
							store.updateDayOff({ kind, index, day: { ...day, name: event.currentTarget.value } })}
					/>
					{#if !isWeekday(day.date)}
						<span class="text-xs text-muted-foreground">Weekend, not counted</span>
					{/if}
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						aria-label="Remove {day.name || day.date}"
						onclick={() => store.removeDayOff({ kind, date: day.date })}
					>
						<Trash2 size={14} />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<form
		class="flex flex-wrap items-end gap-2"
		onsubmit={(event) => {
			event.preventDefault();
			if (!newDate) return;
			store.addDaysOff({ kind, days: [{ date: newDate, name: newName.trim() }] });
			newDate = '';
			newName = '';
		}}
	>
		<div class="space-y-1.5">
			<Label for="{id}-date">Date</Label>
			<Input id="{id}-date" type="date" required bind:value={newDate} class="block w-40" />
		</div>
		<div class="min-w-40 flex-1 space-y-1.5">
			<Label for="{id}-name">{kind === 'holidays' ? 'Name' : 'Note'}</Label>
			<Input id="{id}-name" bind:value={newName} />
		</div>
		<Button type="submit" variant="outline" disabled={!newDate}><Plus /> Add {noun}</Button>
	</form>

	<details class="text-sm">
		<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
			Import from CSV or paste
		</summary>
		<div class="mt-3 space-y-3">
			<p class="text-muted-foreground">
				One per line: a date (2026-07-07 or 07/07/2026) and a name, separated by a comma or a tab.
				Rows copied from a spreadsheet work. A day already listed is updated.
			</p>
			<div class="space-y-1.5">
				<Label for="{id}-paste">Rows</Label>
				<Textarea
					id="{id}-paste"
					rows={5}
					class="font-mono text-xs"
					placeholder="2026-07-07,George Town World Heritage City Day"
					bind:value={pasted}
				/>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!pasted.trim()}
					onclick={() => {
						importText(pasted);
						pasted = '';
					}}
				>
					<ClipboardPaste /> Add these rows
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() => document.getElementById(`${id}-file`)?.click()}
				>
					<Upload /> Choose a CSV file
				</Button>
				<input
					id="{id}-file"
					type="file"
					accept=".csv,.tsv,.txt,text/csv"
					class="sr-only"
					aria-label="CSV file"
					tabindex="-1"
					onchange={importFile}
				/>
			</div>
			{#if message}<p role="status" class="text-muted-foreground">{message}</p>{/if}
		</div>
	</details>
</div>
