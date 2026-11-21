<script lang="ts">
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import CollectiveSearch from '#lib/components/CollectiveSearch.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { clientColor } from '#lib/client-colors.js';
	import { getCollectiveLogo } from '#lib/collective-stats.remote.js';
	import { logoColor } from './logo-color';
	import RateHistory from './RateHistory.svelte';
	import { getSiteLook } from './site-look.remote';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import type { Settings } from '#lib/settings.js';
	import { toIsoDate } from '#lib/format.js';
	import {
		invoiceFrequency,
		rateOn,
		withCurrentRate,
		type Client,
		type InvoiceFrequency
	} from '#lib/worklog.js';
	import {
		Archive,
		ArchiveRestore,
		ChevronRight,
		Ellipsis,
		ImageOff,
		Plus,
		RotateCcw,
		Trash2,
		Undo2
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { quintOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { fade, fly, type TransitionConfig } from 'svelte/transition';

	const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'MYR', 'SGD'];
	const FREQUENCIES: Record<InvoiceFrequency, string> = {
		'twice-monthly': 'Twice a month',
		monthly: 'Monthly'
	};

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);

	let clientMessage = $state<string | undefined>();
	/** Clients archived on this visit, which keep a line where their card was so it can be undone. */
	const justArchived = new SvelteSet<string>();
	/** Clients brought back on this visit, whose cards are marked as they return. */
	const restored = new SvelteSet<string>();
	/** How many times a client was archived or restored on this visit, to mark the archived list. */
	let archiveChanges = $state(0);
	const clients = $derived(
		store.data.clients.filter((client) => !client.archived || justArchived.has(client.id))
	);
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

	function archive(client: Client) {
		changeClient(client, { archived: true });
		justArchived.add(client.id);
		restored.delete(client.id);
		archiveChanges += 1;
	}

	function restore(client: Client) {
		changeClient(client, { archived: false });
		restored.add(client.id);
		archiveChanges += 1;
	}

	/**
	 * Shrinks a card to nothing as it fades, or only fades it when motion is reduced. It leaves
	 * faster than it returns, as leaving is what you asked for.
	 */
	function collapse(node: HTMLElement, leaving: boolean): TransitionConfig {
		if (prefersReducedMotion.current) return { duration: 150, css: (t) => `opacity: ${t}` };
		// The whole height even when Undo catches the card half shrunk, which its box's height is not.
		const height = node.scrollHeight;
		return {
			duration: leaving ? 200 : 250,
			easing: quintOut,
			css: (t) => `overflow: hidden; height: ${t * height}px; opacity: ${t}`
		};
	}

	type LookSource = 'collective' | 'website';
	/** The field each client's logo is being looked up from, and why a lookup failed. */
	const looking = new SvelteMap<string, LookSource>();
	const lookErrors = new SvelteMap<string, { source: LookSource; message: string }>();

	/**
	 * Saves where the client's logo comes from, then takes the logo found there and the colour it is
	 * mostly drawn in, replacing what was there before.
	 */
	async function lookUp(
		client: Client,
		source: Partial<Pick<Client, LookSource>>,
		load: () => Promise<{ logo: string }>
	) {
		lookErrors.delete(client.id);
		changeClient(client, source);
		const [[field, value]] = Object.entries(source) as [LookSource, string | undefined][];
		if (!value) return;
		looking.set(client.id, field);
		try {
			const { logo } = await load();
			const color = await logoColor(logo).catch(() => null);
			changeClient(client, { logo, ...(color ? { color } : {}) });
		} catch (err) {
			lookErrors.set(client.id, {
				source: field,
				message:
					(err as { body?: { message?: string } }).body?.message ?? 'Could not find a logo there.'
			});
		} finally {
			looking.delete(client.id);
		}
	}

	function linkCollective(client: Client, collective: string) {
		return lookUp(client, { collective: collective || undefined }, () =>
			getCollectiveLogo(collective)
		);
	}
</script>

{#snippet lookupField({
	client,
	source,
	onchange
}: {
	client: Client;
	source: LookSource;
	onchange: (value: string) => void;
})}
	{const failed = $derived(lookErrors.get(client.id)?.source === source)}
	<div class="relative">
		<Input
			id="{client.id}-{source}"
			class="pr-8"
			inputmode={source === 'website' ? 'url' : undefined}
			value={client[source] ?? ''}
			aria-invalid={failed || undefined}
			onchange={(event) => onchange(event.currentTarget.value.trim())}
		/>
		{#if looking.get(client.id) === source}
			<Spinner class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
		{/if}
	</div>
	{#if failed}
		<p role="alert" class="text-xs text-destructive">{lookErrors.get(client.id)?.message}</p>
	{/if}
{/snippet}

<SettingsSection
	title="Clients"
	description="Who you work for, what they pay an hour, and how often you invoice them. Archive a client you no longer work for to keep its logged time."
>
	{#snippet action()}
		<Button
			variant="outline"
			size="sm"
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
	{/snippet}
	<ul class="space-y-3">
		{#each clients as client (client.id)}
			{const color = $derived(
				clientColor(
					client,
					store.data.clients.findIndex(({ id }) => id === client.id)
				)
			)}
			<li
				class={[
					// One cell for the card and its archived line, so the line fades in over the card as it
					// shrinks rather than under it, which would push the next card down first.
					'@container/card grid items-start rounded-lg border bg-card *:col-start-1 *:row-start-1 *:min-w-0',
					// Undone in place, the card grows back from its line, so only the tint is added: fading
					// the whole card in as well made it blink out first.
					restored.has(client.id) && (justArchived.has(client.id) ? 'just-added' : 'just-restored')
				]}
			>
				{#if client.archived}
					<!-- Where the card was, as the archived list is below every other client. It waits for the
						card to fade, so its words are never drawn over the card's. -->
					<div
						class="flex items-center justify-between gap-3 py-1 pr-2 pl-3 text-sm"
						in:fade={{ delay: 100, duration: 150 }}
					>
						<span class="min-w-0 break-words text-muted-foreground">{client.name} archived</span>
						<!-- Takes the focus the card's menu had, which also reads out what happened. -->
						<Button
							variant="ghost"
							size="sm"
							onclick={() => restore(client)}
							{@attach (node: HTMLElement) => node.focus({ preventScroll: true })}
						>
							<Undo2 /> Undo
							<span class="sr-only">archiving {client.name}</span>
						</Button>
					</div>
				{:else}
					<div transition:collapse={!!client.archived}>
						<!-- The name heads the card, so each client reads as its own record rather than a row of equal fields.
					With large text the buttons wrap under it, so the name keeps the width it needs. -->
						<div class="flex flex-wrap items-center gap-2 border-b py-2 pr-2 pl-1.5">
							<!-- The logo and colour are how the client is shown everywhere else, so they are changed from the mark itself. -->
							<Popover.Root>
								<Popover.Trigger
									class="relative ml-0.5 grid size-9 shrink-0 place-items-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent"
								>
									<span class="sr-only">Logo and colour of {client.name}</span>
									{#if client.logo}
										<img src={client.logo} alt="" class="size-7 rounded" />
										<span
											class="absolute right-0.5 bottom-0.5 size-3 rounded-full border-2 border-card"
											style:background-color={color}
										></span>
									{:else}
										<span class="size-6 rounded" style:background-color={color}></span>
									{/if}
								</Popover.Trigger>
								<Popover.Content align="start" class="w-60 space-y-4">
									<div class="space-y-1.5">
										<Label for="{client.id}-color">Colour</Label>
										<div class="flex items-center gap-1">
											<!-- The picker sits unseen over the swatch, which can show a colour the picker cannot hold. -->
											<div
												class="relative h-9 flex-1 rounded-md border p-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
											>
												<span class="block size-full rounded-sm" style:background-color={color}
												></span>
												<input
													id="{client.id}-color"
													type="color"
													class="absolute inset-0 size-full cursor-pointer opacity-0"
													value={client.color ?? '#888888'}
													onchange={(event) =>
														changeClient(client, { color: event.currentTarget.value })}
												/>
											</div>
											{#if client.color}
												<Button
													variant="ghost"
													size="icon"
													class="text-muted-foreground"
													onclick={() => changeClient(client, { color: undefined })}
												>
													<RotateCcw />
													<span class="sr-only">
														Go back to the colour of {client.name}'s place in the list
													</span>
												</Button>
											{/if}
										</div>
									</div>
									{#if client.logo}
										<div class="flex items-center gap-3 border-t pt-4">
											<img src={client.logo} alt="" class="size-9 shrink-0 rounded-md border p-1" />
											<Button
												variant="outline"
												size="sm"
												class="flex-1"
												onclick={() => changeClient(client, { logo: undefined })}
											>
												<ImageOff /> Remove logo
											</Button>
										</div>
									{/if}
								</Popover.Content>
							</Popover.Root>
							<Label for="{client.id}-name" class="sr-only">Name</Label>
							<Input
								id="{client.id}-name"
								class="h-auto min-h-9 min-w-0 flex-1 basis-40 border-transparent bg-transparent px-1.5 font-display text-lg shadow-none hover:border-input focus-visible:border-ring md:text-lg dark:bg-transparent"
								value={client.name}
								onchange={(event) => {
									const name = event.currentTarget.value.trim();
									if (name) changeClient(client, { name });
								}}
							/>
							<!-- Behind a menu, as archiving is rare and a stray click on it hid the client's card. -->
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="ghost"
											size="icon-sm"
											class="shrink-0 text-muted-foreground"
										>
											<Ellipsis />
											<span class="sr-only">More for {client.name}</span>
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									{#if clientsWithTime.has(client.id)}
										<DropdownMenu.Item onclick={() => archive(client)}>
											<Archive /> Archive
										</DropdownMenu.Item>
									{:else}
										<DropdownMenu.Item
											variant="destructive"
											onclick={() => {
												clientMessage = store.removeClient(client.id)
													? undefined
													: `${client.name} has logged time, so it stays.`;
											}}
										>
											<Trash2 /> Remove
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
						<!-- Two columns at most: four in a row left each field a sliver of a wide card, and the
							card narrows by 24px when the window reaches `lg`, which undid that step there. From
							`@lg` rather than `@md`, so a column holds "Since 01/02/2026 Rate history" on one line. -->
						<div class="grid gap-x-3 gap-y-4 p-3 *:min-w-0 @lg/card:grid-cols-2">
							<div class="space-y-1.5">
								<Label for="{client.id}-rate" id="{client.id}-rate-label">Per hour</Label>
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
											aria-labelledby="{client.id}-rate-label {client.id}-currency"
										>
											<span id="{client.id}-currency" class="sr-only">currency</span>
											{client.currency}
										</Select.Trigger>
										<Select.Content>
											{#each CURRENCIES as code (code)}
												<Select.Item value={code}>{code}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
								<!-- Dated rates are kept out of the card, so it has one field for the rate: today's,
								which is changed here and nowhere else. -->
								<RateHistory
									{client}
									onchange={(change) => store.updateClient(change(latest(client)))}
								/>
							</div>
							<div class="space-y-1.5">
								<Label for="{client.id}-share">Share of hours</Label>
								<!-- The unit sits in the field, and only once there is a share for it to qualify. -->
								<div class="relative">
									<Input
										id="{client.id}-share"
										type="number"
										inputmode="decimal"
										min="0"
										max="100"
										step="1"
										class="pr-8 tabular-nums"
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
									{#if client.targetShare !== undefined}
										<span
											class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
											aria-hidden="true"
										>
											%
										</span>
									{/if}
								</div>
							</div>
							<!-- Whom the invoice goes to says how it is sent: a collective on Open Collective, or an email. -->
							{const failed = $derived(lookErrors.get(client.id)?.source === 'collective')}
							<div class="space-y-1.5">
								<Label for="{client.id}-invoice-to">Invoice to</Label>
								<CollectiveSearch
									id="{client.id}-invoice-to"
									name="Invoice to"
									slug={client.openCollective ? client.collective : undefined}
									email={client.openCollective ? undefined : client.email}
									busy={looking.get(client.id) === 'collective'}
									invalid={failed}
									onchoose={(match) => {
										changeClient(client, match ? { openCollective: true } : { email: undefined });
										void linkCollective(client, match?.slug ?? '');
									}}
									onemail={(email) => {
										lookErrors.delete(client.id);
										changeClient(client, { openCollective: false, email, collective: undefined });
									}}
								/>
								{#if failed}
									<p role="alert" class="text-xs text-destructive">
										{lookErrors.get(client.id)?.message}
									</p>
								{/if}
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
							<!-- A collective's logo and colour come from Open Collective, so only other clients need one. -->
							{#if !client.openCollective}
								<div class="space-y-1.5">
									<Label for="{client.id}-website">Website</Label>
									{@render lookupField({
										client,
										source: 'website',
										onchange: (website) =>
											lookUp(client, { website: website || undefined }, () => getSiteLook(website))
									})}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if clientMessage}<p role="alert" class="text-sm text-destructive">{clientMessage}</p>{/if}
	{#if archived.length > 0}
		<details
			class="group"
			in:fly={{ y: prefersReducedMotion.current ? 0 : 4, duration: 200, easing: quintOut }}
		>
			<summary
				class="flex min-h-10 w-fit cursor-pointer list-none items-center text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
			>
				<!-- Drawn again on each change, so the tint that says where the client went plays again. -->
				{#key archiveChanges}
					<span
						class={[
							'-mx-1.5 flex items-center gap-1 rounded-sm px-1.5 py-1',
							archiveChanges > 0 && 'just-added'
						]}
					>
						<ChevronRight
							size={15}
							class="transition-transform group-open:rotate-90 motion-reduce:transition-none"
						/>
						Archived clients ({archived.length})
					</span>
				{/key}
			</summary>
			<!-- A quiet ruled list rather than cards: these are kept for their history, not edited. -->
			<ul class="mt-2 ml-5 divide-y border-y text-sm">
				{#each archived as client (client.id)}
					<li class="flex items-center justify-between gap-3 py-1">
						<span class="min-w-0 break-words text-muted-foreground">{client.name}</span>
						<Button variant="ghost" size="sm" onclick={() => restore(client)}>
							<ArchiveRestore /> Restore
						</Button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</SettingsSection>

<style>
	/* A card that comes back fades in under the tint of something just added, so it is easy to find. */
	:global(.just-restored) {
		animation:
			just-restored 200ms cubic-bezier(0.23, 1, 0.32, 1),
			just-added 1200ms cubic-bezier(0.23, 1, 0.32, 1);
	}

	@keyframes -global-just-restored {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		@keyframes -global-just-restored {
			from {
				opacity: 0;
				scale: 0.98;
			}
		}
	}
</style>
