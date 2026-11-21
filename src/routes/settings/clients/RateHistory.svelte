<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { formatMoney, formatDMY, toIsoDate } from '#lib/format.js';
	import { rateOn, withRates, type Client } from '#lib/worklog.js';
	import { CalendarDays, ChevronRight, Ellipsis, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import { quintOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	let {
		client,
		onchange
	}: {
		client: Client;
		/** Called with a change to make to the client as stored right now. */
		onchange: (change: (client: Client) => Client) => void;
	} = $props();

	let open = $state(false);
	/**
	 * The rate being added or edited, which takes the dialog over from the list. `start` is the
	 * rate before any change, and a number is the place of a change in the client's rates.
	 * `dateOnly` is for the rate that applies today, whose amount is changed on the card.
	 */
	let editing = $state<
		| { target: 'new' | 'start' | number; from: string; rate: number | null; dateOnly?: boolean }
		| undefined
	>();

	/** The row last saved, `start` or a change's date, so the list can point it out. */
	let saved = $state<string | undefined>();

	/** The list and the form rise a little into place as one takes over from the other. */
	const swap = $derived({
		y: prefersReducedMotion.current ? 0 : 4,
		duration: 200,
		easing: quintOut
	});

	const today = $derived(toIsoDate(new Date()));
	const rates = $derived(client.rates ?? []);
	/** The change that applies today, or -1 while the starting rate still does. */
	const current = $derived(rates.findLastIndex((change) => change.from <= today));

	function save(event: SubmitEvent) {
		event.preventDefault();
		if (!editing) return;
		const { target, from, rate } = editing;
		if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) return;
		onchange((latest) => {
			if (target === 'start') return { ...latest, rate };
			// A date holds one rate, so a rate saved on another change's date replaces it.
			const others = (latest.rates ?? []).filter(
				(change, index) => index !== target && change.from !== from
			);
			return withRates({ client: latest, rates: [...others, { from, rate }] });
		});
		saved = target === 'start' ? 'start' : from;
		editing = undefined;
	}

	function remove(index: number) {
		onchange((latest) =>
			withRates({
				client: latest,
				rates: (latest.rates ?? []).filter((_, place) => place !== index)
			})
		);
	}
</script>

<!-- The link has a 40px hit area, as it is smaller than a button. -->
<p class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
	{#if current >= 0}<span>Since {formatDMY(rates[current].from)}</span>{/if}
	<button
		type="button"
		class="relative inline-flex items-center gap-0.5 rounded-sm font-medium text-foreground underline-offset-4 transition-[scale] duration-150 outline-none after:absolute after:-inset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:active:scale-[0.97]"
		onclick={() => (open = true)}
	>
		Rate history <ChevronRight size={14} />
	</button>
</p>

<Dialog.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (!isOpen) editing = saved = undefined;
	}}
>
	<!-- A long history scrolls inside the dialog, which never grows past a short, sideways phone. -->
	<Dialog.Content class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
		{#if editing}
			<div class="grid gap-4" in:fly={swap}>
				<Dialog.Header>
					<Dialog.Title>
						{editing.target === 'new' ? 'New rate' : editing.dateOnly ? 'Change date' : 'Edit rate'}
					</Dialog.Title>
					<!-- Only the form with no amount needs a word, to say where the amount went. -->
					{#if editing.dateOnly}
						<Dialog.Description>
							Today's rate is changed in Per hour on the client.
						</Dialog.Description>
					{/if}
				</Dialog.Header>
				<form class="grid gap-4" onsubmit={save}>
					{#if editing.target !== 'start'}
						<div class="space-y-1.5">
							<Label for="{client.id}-history-from">From</Label>
							<Input id="{client.id}-history-from" type="date" required bind:value={editing.from} />
						</div>
					{/if}
					{#if !editing.dateOnly}
						<div class="space-y-1.5">
							<Label for="{client.id}-history-rate">Per hour</Label>
							<InputGroup.Root>
								<InputGroup.Input
									id="{client.id}-history-rate"
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									required
									class="tabular-nums"
									bind:value={editing.rate}
								/>
								<InputGroup.Addon align="inline-end">
									<InputGroup.Text>{client.currency}</InputGroup.Text>
								</InputGroup.Addon>
							</InputGroup.Root>
						</div>
					{/if}
					<Dialog.Footer>
						<Button type="button" variant="outline" onclick={() => (editing = undefined)}>
							Cancel
						</Button>
						<Button type="submit">Save</Button>
					</Dialog.Footer>
				</form>
			</div>
		{:else}
			<div class="grid gap-4" in:fly={swap}>
				<Dialog.Header>
					<Dialog.Title>{client.name}'s rates</Dialog.Title>
				</Dialog.Header>
				<table class="ledger text-sm">
					<thead>
						<tr>
							<th scope="col" class="py-2 pr-2 pl-2">From</th>
							<th scope="col" class="px-2 py-2 text-right whitespace-nowrap"> Per hour </th>
							<th scope="col" class="w-px py-2 pr-1 pl-1"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						<tr class={saved === 'start' ? 'just-added' : undefined}>
							<td class="py-1 pr-2 pl-2">
								<span class="flex items-center gap-2 whitespace-nowrap">
									Start
									{#if current < 0}<Badge variant="secondary">Now</Badge>{/if}
								</span>
							</td>
							<td class="px-2 py-1 text-right">{formatMoney(client.rate, client.currency)}</td>
							<td class="py-1 pr-1 pl-1">
								<!-- Today's rate is changed on the card, so the row that holds it has no edit here. -->
								{#if current >= 0}
									<Button
										variant="ghost"
										size="icon-sm"
										class="text-muted-foreground"
										onclick={() => (editing = { target: 'start', from: '', rate: client.rate })}
									>
										<Pencil />
										<span class="sr-only">Edit the starting rate</span>
									</Button>
								{/if}
							</td>
						</tr>
						{#each rates as change, index (index)}
							<tr class={saved === change.from ? 'just-added' : undefined}>
								<td class="py-1 pr-2 pl-2">
									<span class="flex items-center gap-2 whitespace-nowrap">
										{formatDMY(change.from)}
										{#if index === current}<Badge variant="secondary">Now</Badge>{/if}
									</span>
								</td>
								<td class="px-2 py-1 text-right">{formatMoney(change.rate, client.currency)}</td>
								<td class="py-1 pr-1 pl-1">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon-sm"
													class="text-muted-foreground"
												>
													<Ellipsis />
													<span class="sr-only">
														More for the rate from {formatDMY(change.from)}
													</span>
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item
												onclick={() =>
													(editing = {
														target: index,
														from: change.from,
														rate: change.rate,
														dateOnly: index === current
													})}
											>
												{#if index === current}
													<CalendarDays /> Change date
												{:else}
													<Pencil /> Edit
												{/if}
											</DropdownMenu.Item>
											<DropdownMenu.Item variant="destructive" onclick={() => remove(index)}>
												<Trash2 /> Remove
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<Dialog.Footer>
					<Button
						onclick={() => (editing = { target: 'new', from: today, rate: rateOn(client, today) })}
					>
						<Plus /> New rate
					</Button>
				</Dialog.Footer>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
