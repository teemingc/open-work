<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import type { Snapshot } from './$types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { formatDMY, formatHours, formatMoney, invoiceInfoText, nextPeriod } from '#lib/format.js';
	import { driveSync } from '#lib/drive-sync.svelte.js';
	import { workLogText } from '#lib/worklog.js';
	import { ArrowLeft, RotateCcw } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { Draft, type DraftData } from './draft.svelte';
	import InvoiceSheet from './InvoiceSheet.svelte';
	import SubmitPanel from './SubmitPanel.svelte';
	import WorkLogSection from './WorkLogSection.svelte';

	const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

	function initialPeriod(): { startDate: string; endDate: string } {
		const start = page.url.searchParams.get('start') ?? '';
		const end = page.url.searchParams.get('end') ?? '';
		if (ISO_DATE.test(start) && ISO_DATE.test(end) && start <= end) {
			return { startDate: start, endDate: end };
		}
		return nextPeriod({});
	}

	let { data } = $props();

	const settings = $derived(data.settings);
	const me = $derived(data.me);
	// The client, rate and currency are chosen once, when the invoice starts.
	const fallback = untrack(() => ({
		rate: data.settings.hourlyRate,
		currency: data.settings.currency
	}));
	const store = untrack(() => data.store);
	// Pulls the latest log from Google Drive, if you sync it, before you invoice from it.
	driveSync(store);
	const draft = new Draft({ store, ...initialPeriod(), fallback });
	const notes = $derived(
		workLogText({ entries: draft.entries, organization: settings.organization })
	);
	const invoiceInfo = $derived(invoiceInfoText(settings.invoiceNote));

	/**
	 * Binds a number field to an override. While you type, the field keeps exactly what you
	 * typed, so a half-typed "0." is not replaced; leaving it empty goes back to the logged value.
	 */
	function overrideInput({
		shown,
		override
	}: {
		shown: () => number;
		override: (value: number | undefined) => void;
	}) {
		let typed = $state<number | null | undefined>();
		return {
			// Left empty rather than 0 until there is something to show.
			get: () => (typed !== undefined ? typed : shown() || null),
			set: (value: number | null) => {
				typed = value;
				if (value !== null) override(value);
			},
			blur: () => {
				if (typed === null) override(undefined);
				typed = undefined;
			}
		};
	}

	const hoursInput = overrideInput({
		shown: () => draft.hours,
		override: (value) => (draft.hoursOverride = value)
	});
	const rateInput = overrideInput({
		shown: () => draft.rate,
		override: (value) => (draft.rateOverride = value)
	});

	let submitted = false;

	// Keeps the draft through a reload, or when you go back to it, within this tab.
	// The newer `snapshot()` helper from `$app/navigation` saves but never restores on
	// reload in SvelteKit 3.1 with `ssr = false`, so this uses the deprecated export.
	export const snapshot: Snapshot<DraftData> = {
		capture: () => draft.toJSON(),
		restore: (data) => draft.restore(data)
	};

	beforeNavigate(({ cancel, type, shallow }) => {
		if (shallow && type === 'goto') return;

		// Reloads and back/forward keep the draft through the snapshot.
		if (submitted || !draft.hasWork || type === 'leave' || type === 'popstate') return;
		if (!confirm('Leave this invoice unsubmitted? You can return to it with the Back button.')) {
			cancel();
		}
	});

	function onSubmitted(submittedUrl: string | undefined) {
		submitted = true;
		// Replace this entry so Back cannot bring the sent draft back for a second submit.
		goto(resolve('/invoices'), { replace: true, state: { submittedUrl } });
	}
</script>

<svelte:head><title>New invoice · Open Work</title></svelte:head>

<div class="animate-in duration-300 fade-in">
	<a
		href={resolve('/invoices')}
		class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft size={15} /> Invoices
	</a>

	<h1 class="mb-6">
		{formatDMY(draft.startDate)} – {formatDMY(draft.endDate)}
	</h1>

	<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
		<div class="divide-y rounded-xl border bg-card">
			<section class="space-y-5 p-5 sm:p-6" aria-labelledby="time-heading">
				<h2 id="time-heading" class="text-lg">Time</h2>

				<div class="grid gap-x-4 gap-y-5 sm:grid-cols-2">
					<div class="space-y-1.5">
						<Label for="start-date">From</Label>
						<Input
							id="start-date"
							type="date"
							class="block"
							bind:value={() => draft.startDate, (value) => value && (draft.startDate = value)}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="end-date">To</Label>
						<Input
							id="end-date"
							type="date"
							class="block"
							bind:value={() => draft.endDate, (value) => value && (draft.endDate = value)}
						/>
					</div>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<Label for="hours">Hours worked</Label>
							{#if draft.hoursOverride !== undefined && draft.loggedHours > 0}
								<Button
									variant="ghost"
									size="sm"
									class="h-auto py-0"
									onclick={() => (draft.hoursOverride = undefined)}
									><RotateCcw />Use logged ({formatHours(draft.loggedHours)})</Button
								>
							{/if}
						</div>
						<Input
							id="hours"
							type="number"
							inputmode="decimal"
							min="0"
							step="0.5"
							class="tabular-nums"
							aria-describedby="hours-source"
							bind:value={hoursInput.get, hoursInput.set}
							onblur={hoursInput.blur}
						/>
						<p id="hours-source" class="text-xs text-muted-foreground">
							{draft.hoursOverride === undefined
								? 'Added up from the times in your work log.'
								: 'Typed by you.'}
						</p>
					</div>
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<Label for="rate">Rate per hour ({draft.currency})</Label>
							{#if draft.rateOverride !== undefined && draft.client}
								<Button
									variant="ghost"
									size="sm"
									class="h-auto py-0"
									onclick={() => (draft.rateOverride = undefined)}
									><RotateCcw />Use logged rates</Button
								>
							{/if}
						</div>
						<Input
							id="rate"
							type="number"
							inputmode="decimal"
							min="0"
							step="0.01"
							class="tabular-nums"
							aria-describedby={draft.averagedRate ? 'rate-source' : undefined}
							bind:value={rateInput.get, rateInput.set}
							onblur={rateInput.blur}
						/>
						{#if draft.averagedRate}
							<p id="rate-source" class="text-xs text-muted-foreground">
								The average of the rates in your work log. Each entry is billed at its own.
							</p>
						{/if}
					</div>
				</div>

				<div class="flex items-baseline justify-between border-t pt-4">
					<span class="text-sm text-muted-foreground">Total</span>
					<span class="text-xl font-semibold" aria-live="polite">
						{formatMoney(draft.cents / 100, draft.currency)}
					</span>
				</div>
			</section>

			<WorkLogSection {draft} {store} organization={settings.organization} />

			<section class="p-5 sm:p-6">
				<details>
					<summary class="cursor-pointer text-lg font-semibold">Edit the wording</summary>
					<div class="mt-4 space-y-5">
						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<Label for="title">Title</Label>
								{#if draft.titleOverride !== undefined}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (draft.titleOverride = undefined)}
										><RotateCcw />Use the standard title</Button
									>
								{/if}
							</div>
							<Input
								id="title"
								bind:value={() => draft.title, (value) => (draft.titleOverride = value)}
							/>
						</div>

						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<Label for="item-description">Item description</Label>
								{#if draft.descriptionOverride !== undefined}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (draft.descriptionOverride = undefined)}
										><RotateCcw />Use the standard text</Button
									>
								{/if}
							</div>
							<Textarea
								id="item-description"
								rows={3}
								bind:value={
									() => draft.itemDescription, (value) => (draft.descriptionOverride = value)
								}
							/>
						</div>

						<p class="text-sm text-muted-foreground">
							{#if invoiceInfo}
								Invoice note: {invoiceInfo}
							{:else}
								No invoice note.

								<a href={resolve('settings')} class="font-medium text-foreground underline"
									>Add it in settings</a
								>
							{/if}
						</p>
					</div>
				</details>
			</section>
		</div>

		<aside class="space-y-5 lg:sticky lg:top-6">
			<InvoiceSheet
				payeeName={me?.name}
				payeeAddress={settings.payeeAddress ?? me?.address ?? undefined}
				payeeCountry={settings.payeeCountry ?? me?.country ?? undefined}
				collectiveSlug={settings.collectiveSlug}
				title={draft.title}
				itemDescription={draft.itemDescription}
				cents={draft.cents}
				currency={draft.currency}
				{invoiceInfo}
				workLog={notes}
			/>

			<SubmitPanel {draft} {me} {settings} {invoiceInfo} onsubmitted={onSubmitted} />
		</aside>
	</div>
</div>
