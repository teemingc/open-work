<script lang="ts">
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { untrack } from 'svelte';
	import DaysOffEditor from './DaysOffEditor.svelte';

	let { data }: { data: { store: WorkLogStore } } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);

	let year = $state(String(new Date().getFullYear()));
	const years = $derived(
		[
			...new Set([
				String(new Date().getFullYear()),
				...[...store.data.holidays, ...store.data.entries].map((item) => item.date.slice(0, 4))
			])
		].sort()
	);
</script>

<SettingsSection title="Year">
	<div class="space-y-1.5">
		<Label for="year">Holidays for</Label>
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
	description="Holidays are taken off the working days. Import your country's or state's list, then fix anything that differs."
>
	<div class="space-y-4">
		<div class="flex items-center gap-2">
			<Checkbox
				id="replace-holidays"
				checked={store.data.replaceHolidays}
				onCheckedChange={(replace) => store.setReplaceHolidays(replace)}
			/>
			<Label for="replace-holidays" class="font-normal">
				Take a working day off for a holiday on a weekend
			</Label>
		</div>
		<DaysOffEditor {store} {year} />
	</div>
</SettingsSection>

<SettingsSection
	title="Days off a year"
	description="Hours short of what a month expects come out of it."
>
	<div class="flex flex-wrap items-end gap-4">
		<div class="w-32 space-y-1.5">
			<Label for="allowance-days">Days</Label>
			<Input
				id="allowance-days"
				type="number"
				inputmode="decimal"
				min="0"
				step="0.5"
				class="tabular-nums"
				value={store.data.allowance?.days ?? ''}
				onchange={(event) => {
					const text = event.currentTarget.value.trim();
					const days = Number(text);
					if (!text) store.setAllowance(undefined);
					else if (Number.isFinite(days) && days >= 0) {
						store.setAllowance({ days, holidays: store.data.allowance?.holidays ?? false });
					}
				}}
			/>
		</div>
		<div class="flex h-9 items-center gap-2">
			<Checkbox
				id="allowance-holidays"
				disabled={!store.data.allowance}
				checked={store.data.allowance?.holidays ?? false}
				onCheckedChange={(holidays) =>
					store.data.allowance && store.setAllowance({ ...store.data.allowance, holidays })}
			/>
			<Label for="allowance-holidays" class="font-normal">Count public holidays</Label>
		</div>
	</div>
</SettingsSection>
