<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { formatLongDate } from '#lib/format.js';
	import { isWeekday, observedHolidays, parseDaysOff } from '#lib/worklog.js';
	import { ChevronRight, ClipboardPaste, Plus, Trash2, Upload } from '@lucide/svelte';

	let { store, year }: { store: WorkLogStore; year: string } = $props();

	const id = $props.id();
	const days = $derived(
		store.data.holidays
			.map((day, index) => ({ day, index }))
			.filter(({ day }) => day.date.startsWith(year))
	);

	const replacedOn = $derived(observedHolidays(store.data).replacedOn);

	let pasted = $state('');
	let message = $state<string | undefined>();
	let newDate = $state('');
	let newName = $state('');

	function importText(text: string) {
		const { days: parsed, skipped } = parseDaysOff(text);
		const added = store.addHolidays(parsed);
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

<!-- Laid out by its own width rather than the window's, so rows go onto one line once they fit. -->
<div class="@container/holidays space-y-3">
	{#if days.length === 0}
		<p class="text-sm text-muted-foreground">
			No holidays in {year} yet.
		</p>
	{:else}
		<!-- Headings over the fields once the name shares the date's line. On a phone each field has
			its own label instead, and screen readers always use those. -->
		<div
			class="hidden grid-cols-[10rem_minmax(0,1fr)_auto] gap-2 px-2 text-xs text-muted-foreground @md/holidays:grid"
			aria-hidden="true"
		>
			<span>Date</span>
			<span>Name</span>
		</div>
		<ul class="divide-y rounded-lg border">
			{#each days as { day, index } (day.date)}
				<!-- The name has a line of its own on a phone, and the weekend note sits under it on any screen. -->
				<li
					class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2 @md/holidays:grid-cols-[10rem_minmax(0,1fr)_auto]"
				>
					<div class="space-y-1">
						<Label
							for="{id}-{index}-date"
							class="text-xs text-muted-foreground @md/holidays:sr-only"
						>
							Date
						</Label>
						<Input
							id="{id}-{index}-date"
							type="date"
							class="w-40 @md/holidays:w-full"
							value={day.date}
							onchange={(event) => {
								const date = event.currentTarget.value;
								if (date) store.updateHoliday({ index, day: { ...day, date } });
							}}
						/>
					</div>
					<div
						class="col-span-2 space-y-1 @md/holidays:col-span-1 @md/holidays:col-start-2 @md/holidays:row-start-1"
					>
						<Label
							for="{id}-{index}-name"
							class="text-xs text-muted-foreground @md/holidays:sr-only"
						>
							Name
						</Label>
						<Input
							id="{id}-{index}-name"
							value={day.name}
							onchange={(event) =>
								store.updateHoliday({ index, day: { ...day, name: event.currentTarget.value } })}
						/>
					</div>
					{#if !isWeekday(day.date)}
						{const replacement = $derived(replacedOn.get(day.date))}
						<span
							class="col-span-2 text-xs text-muted-foreground @md/holidays:col-span-1 @md/holidays:col-start-2"
						>
							{replacement
								? `Weekend, off on ${formatLongDate(replacement)}`
								: 'Weekend, not counted'}
						</span>
					{/if}
					<Button
						variant="ghost"
						size="icon"
						class="col-start-2 row-start-1 self-end justify-self-end @md/holidays:col-start-3 @md/holidays:self-center"
						onclick={() => store.removeHoliday(day.date)}
					>
						<Trash2 size={14} />
						<span class="sr-only">Remove {day.name || day.date}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Framed like a row of the list, with its columns, so a new holiday lines up with the saved ones. -->
	<form
		class="grid items-end gap-2 rounded-lg border border-dashed p-2 @md/holidays:grid-cols-[10rem_minmax(0,1fr)_auto]"
		onsubmit={(event) => {
			event.preventDefault();
			if (!newDate) return;
			store.addHolidays([{ date: newDate, name: newName.trim() }]);
			newDate = '';
			newName = '';
		}}
	>
		<div class="space-y-1.5">
			<Label for="{id}-date">Date</Label>
			<Input
				id="{id}-date"
				type="date"
				required
				bind:value={newDate}
				class="w-40 @md/holidays:w-full"
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="{id}-name">Name</Label>
			<Input id="{id}-name" bind:value={newName} />
		</div>
		<Button type="submit" variant="outline" class="w-full @md/holidays:w-auto" disabled={!newDate}>
			<Plus /> Add holiday
		</Button>
	</form>

	<details class="group text-sm">
		<summary
			class="flex min-h-10 w-fit cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
		>
			<ChevronRight
				size={15}
				class="transition-transform group-open:rotate-90 motion-reduce:transition-none"
			/>
			Import from CSV or paste
		</summary>
		<div class="mt-1 space-y-3">
			<p class="text-muted-foreground">
				One per line: a date (2026-07-07 or 07/07/2026) and a name, separated by a comma or a tab.
				Rows copied from a spreadsheet work. A day already listed is updated.
			</p>
			<div class="space-y-1.5">
				<Label for="{id}-paste">Rows</Label>
				<Textarea id="{id}-paste" rows={5} class="font-mono text-xs" bind:value={pasted} />
			</div>
			<div class="grid gap-2 @md/holidays:flex @md/holidays:flex-wrap">
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
					id="{id}-file-button"
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
					aria-labelledby="{id}-file-button"
					tabindex="-1"
					onchange={importFile}
				/>
			</div>
			{#if message}<p role="status" class="text-muted-foreground">{message}</p>{/if}
		</div>
	</details>
</div>
