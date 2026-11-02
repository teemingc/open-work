<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import {
		orderedDeductions,
		type Band,
		type Deduction,
		type DeductionKind
	} from '#lib/worklog.js';
	import NewBand from './NewBand.svelte';
	import { ArrowDown, ArrowUp, Plus, Trash2, X } from '@lucide/svelte';

	let { store, currency }: { store: WorkLogStore; currency: string } = $props();

	const KINDS: Record<DeductionKind, string> = {
		percent: 'Percentage',
		fixed: 'Fixed amount',
		bands: 'Income bands'
	};
	const BASES: Record<Deduction['base'], string> = {
		gross: 'Gross pay',
		remaining: 'What the ones above leave'
	};

	const deductions = $derived(orderedDeductions(store.data.deductions));

	/** The deduction as stored right now, so quick edits in a row build on each other. */
	function change(deduction: Deduction, patch: Partial<Deduction>) {
		const latest = store.data.deductions.find((other) => other.id === deduction.id) ?? deduction;
		store.updateDeduction({ ...$state.snapshot(latest), ...patch });
	}

	function changeBands(deduction: Deduction, edit: (bands: Band[]) => void) {
		const bands = $state.snapshot(deduction.bands ?? []);
		edit(bands);
		change(deduction, { bands });
	}

	/** A number typed into a field, or `undefined` when it is empty or not a number. */
	function number(event: Event & { currentTarget: HTMLInputElement }): number | undefined {
		const text = event.currentTarget.value.trim();
		const value = Number(text);
		return text && Number.isFinite(value) && value >= 0 ? value : undefined;
	}

	/** A percentage typed into a field, kept to at most 100. */
	function percent(event: Event & { currentTarget: HTMLInputElement }): number | undefined {
		const value = number(event);
		return value === undefined ? undefined : Math.min(value, 100);
	}
</script>

{#if deductions.length > 0}
	<ul class="space-y-3">
		{#each deductions as deduction, index (deduction.id)}
			<li class="space-y-3 rounded-lg border bg-card p-3">
				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
					<div class="space-y-1.5">
						<Label for="{deduction.id}-name">Name</Label>
						<Input
							id="{deduction.id}-name"
							autocomplete="off"
							value={deduction.name}
							onchange={(event) => change(deduction, { name: event.currentTarget.value.trim() })}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="{deduction.id}-kind">Kind</Label>
						<Select.Root
							type="single"
							value={deduction.kind}
							onValueChange={(kind) => change(deduction, { kind: kind as DeductionKind })}
						>
							<Select.Trigger id="{deduction.id}-kind" class="w-full">
								{KINDS[deduction.kind]}
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(KINDS) as [value, label] (value)}
									<Select.Item {value}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="flex">
						<Button
							variant="ghost"
							size="icon"
							aria-label="Take {deduction.name || 'this deduction'} earlier"
							title="Earlier"
							disabled={index === 0}
							onclick={() => store.moveDeduction({ id: deduction.id, by: -1 })}
						>
							<ArrowUp size={16} />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Take {deduction.name || 'this deduction'} later"
							title="Later"
							disabled={index === deductions.length - 1}
							onclick={() => store.moveDeduction({ id: deduction.id, by: 1 })}
						>
							<ArrowDown size={16} />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Remove {deduction.name || 'this deduction'}"
							title="Remove"
							onclick={() => store.removeDeduction(deduction.id)}
						>
							<Trash2 size={16} />
						</Button>
					</div>
				</div>

				<div class="grid gap-3 sm:grid-cols-2 sm:items-end">
					{#if deduction.kind === 'percent'}
						<div class="space-y-1.5">
							<Label for="{deduction.id}-rate">Rate (%)</Label>
							<Input
								id="{deduction.id}-rate"
								type="number"
								inputmode="decimal"
								min="0"
								max="100"
								step="0.1"
								class="tabular-nums"
								value={deduction.rate ?? ''}
								onchange={(event) => change(deduction, { rate: percent(event) })}
							/>
						</div>
					{:else if deduction.kind === 'fixed'}
						<div class="space-y-1.5">
							<Label for="{deduction.id}-amount">Each month ({currency})</Label>
							<Input
								id="{deduction.id}-amount"
								type="number"
								inputmode="decimal"
								min="0"
								step="0.01"
								class="tabular-nums"
								value={deduction.amount ?? ''}
								onchange={(event) => change(deduction, { amount: number(event) })}
							/>
						</div>
					{/if}
					{#if index > 0}
						<div class="space-y-1.5">
							<Label for="{deduction.id}-base">Worked out on</Label>
							<Select.Root
								type="single"
								value={deduction.base}
								onValueChange={(base) => change(deduction, { base: base as Deduction['base'] })}
							>
								<Select.Trigger id="{deduction.id}-base" class="w-full">
									{BASES[deduction.base]}
								</Select.Trigger>
								<Select.Content>
									{#each Object.entries(BASES) as [value, label] (value)}
										<Select.Item {value}>{label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					{/if}
				</div>

				{#if deduction.kind === 'bands'}
					{const bands = $derived(deduction.bands ?? [])}
					<fieldset class="space-y-2">
						<legend class="mb-2 text-sm font-medium">Bands ({currency})</legend>
						{#each bands as band, bandIndex (bandIndex)}
							{const from = $derived(bandIndex === 0 ? 0 : (bands[bandIndex - 1].upTo ?? 0))}
							<div
								class="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]"
							>
								<div class="space-y-1.5">
									<Label for="{deduction.id}-band-{bandIndex}-up-to" class="font-normal">
										From {from.toLocaleString('en')} up to
									</Label>
									<Input
										id="{deduction.id}-band-{bandIndex}-up-to"
										type="number"
										inputmode="decimal"
										min="0"
										placeholder="Any amount"
										class="tabular-nums"
										value={band.upTo ?? ''}
										onchange={(event) => {
											const upTo = number(event);
											changeBands(deduction, (list) => (list[bandIndex].upTo = upTo));
										}}
									/>
								</div>
								<div class="space-y-1.5">
									<Label for="{deduction.id}-band-{bandIndex}-rate" class="font-normal">
										Rate (%)
									</Label>
									<Input
										id="{deduction.id}-band-{bandIndex}-rate"
										type="number"
										inputmode="decimal"
										min="0"
										max="100"
										step="0.1"
										class="tabular-nums"
										value={band.rate}
										onchange={(event) => {
											const rate = percent(event) ?? 0;
											changeBands(deduction, (list) => (list[bandIndex].rate = rate));
										}}
									/>
								</div>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Remove the band from {from.toLocaleString('en')}"
									onclick={() => changeBands(deduction, (list) => list.splice(bandIndex, 1))}
								>
									<X size={16} />
								</Button>
							</div>
						{/each}
						<!-- A band with no top is the last; another after it would never be reached. -->
						{#if bands.length === 0 || bands.at(-1)?.upTo !== undefined}
							<NewBand
								id="{deduction.id}-new-band"
								from={bands.at(-1)?.upTo ?? 0}
								onadd={(band) => changeBands(deduction, (list) => list.push(band))}
							/>
						{/if}
						<div class="flex items-center gap-2 pt-1">
							<Checkbox
								id="{deduction.id}-yearly"
								checked={deduction.yearly ?? false}
								onCheckedChange={(yearly) => change(deduction, { yearly })}
							/>
							<Label for="{deduction.id}-yearly" class="font-normal">
								The bands are for a year’s income
							</Label>
						</div>
					</fieldset>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<Button
	variant="outline"
	onclick={() => store.addDeduction({ name: '', kind: 'percent', rate: undefined, base: 'gross' })}
>
	<Plus /> Add a deduction
</Button>
