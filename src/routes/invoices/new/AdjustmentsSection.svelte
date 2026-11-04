<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { formatMoney } from '#lib/format.js';
	import type { Adjustment } from '#lib/worklog.js';
	import { Plus, Trash2 } from '@lucide/svelte';
	import type { Draft } from './draft.svelte';

	let { draft }: { draft: Draft } = $props();

	const KINDS: Record<Adjustment['kind'], string> = { 'take-off': 'Take off', add: 'Add' };
	const money = (amount: number) => formatMoney(amount, draft.currency);
	/** The credit there is to use: what is free, or what this invoice was saved with. */
	const credit = $derived(Math.max(draft.availableCredit, draft.creditOverride ?? 0));
</script>

<section class="@container space-y-4 p-(--card-padding)" aria-labelledby="adjustments-heading">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<h2 id="adjustments-heading" class="text-lg">Adjustments</h2>
		<Button
			variant="outline"
			size="sm"
			onclick={() => draft.adjustments.push({ description: '', kind: 'take-off', amount: 0 })}
		>
			<Plus /> Add an adjustment
		</Button>
	</div>

	{#if draft.adjustments.length > 0}
		<ul class="space-y-3">
			{#each draft.adjustments as adjustment, index (index)}
				<li
					class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @lg:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] @lg:items-end"
				>
					<div class="col-span-2 space-y-1.5 @lg:col-span-1">
						<Label for="adjustment-{index}-reason">Reason</Label>
						<Input id="adjustment-{index}-reason" bind:value={adjustment.description} />
					</div>
					<div class="space-y-1.5">
						<Label for="adjustment-{index}-kind">Change</Label>
						<Select.Root
							type="single"
							value={adjustment.kind}
							onValueChange={(kind) => (adjustment.kind = kind as Adjustment['kind'])}
						>
							<Select.Trigger id="adjustment-{index}-kind" class="w-full">
								{KINDS[adjustment.kind]}
							</Select.Trigger>
							<Select.Content>
								{#each Object.entries(KINDS) as [value, label] (value)}
									<Select.Item {value}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-1.5">
						<Label for="adjustment-{index}-amount">
							Amount ({draft.currency})
						</Label>
						<Input
							id="adjustment-{index}-amount"
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							class="tabular-nums"
							value={adjustment.amount || ''}
							oninput={(event) =>
								(adjustment.amount = Math.abs(Number(event.currentTarget.value)) || 0)}
						/>
					</div>
					<Button
						variant="ghost"
						size="icon"
						class="self-end"
						onclick={() => draft.adjustments.splice(index, 1)}
					>
						<Trash2 size={16} /><span class="sr-only"
							>Remove {adjustment.description || 'this adjustment'}</span
						>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if credit > 0}
		<div class="flex items-start gap-2 border-t pt-4">
			<Checkbox
				id="use-credit"
				class="mt-0.5"
				checked={draft.totals.credit > 0}
				onCheckedChange={(checked) => (draft.creditOverride = checked ? undefined : 0)}
			/>
			<Label for="use-credit" class="leading-5 font-normal">
				Use {draft.client?.name}’s credit of {money(credit)} from earlier payments
			</Label>
		</div>
	{/if}

	<div class="flex items-baseline justify-between border-t pt-4">
		<span class="text-sm text-muted-foreground">Amount due</span>
		<span class="text-xl font-semibold tabular-nums" aria-live="polite">
			{money(draft.totals.due)}
		</span>
	</div>
</section>
