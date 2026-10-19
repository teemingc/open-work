<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { formatDMY, formatMoney, workLogToHtml } from '#lib/format.js';
	import { submitExpense, type Account } from '#lib/opencollective.remote.js';
	import { missingForSubmit, type Settings } from '#lib/settings.js';
	import { workLogText } from '#lib/worklog.js';
	import { Check, CircleAlert, Clipboard, Send } from '@lucide/svelte';
	import { isHttpError } from '@sveltejs/kit';
	import type { Draft } from './draft.svelte';

	let {
		draft,
		me,
		settings,
		invoiceInfo,
		onsubmitted
	}: {
		draft: Draft;
		/** The connected Open Collective account, or `null` when not connected. */
		me: Account | null;
		settings: Settings;
		invoiceInfo?: string;
		onsubmitted: (url: string | undefined) => void;
	} = $props();

	const missing = $derived(missingForSubmit({ settings, connected: me !== null }));
	const problems = $derived([
		...missing.map((item) => `Add your ${item} in settings`),
		...(draft.needsClient ? ['Choose the client this invoice bills'] : []),
		...(draft.startDate <= draft.endDate ? [] : ['Make the period end on or after it starts']),
		...(draft.hours > 0 ? [] : ['Log your time or enter the hours you worked'])
	]);
	const fields = submitExpense.fields;
	const notes = $derived(
		workLogText({ entries: draft.entries, organization: settings.organization })
	);

	let confirmOpen = $state(false);
	let submitError = $state('');
	let copiedKey = $state('');

	const enhanced = submitExpense.enhance(async ({ submit }) => {
		submitError = '';
		try {
			if (await submit()) {
				confirmOpen = false;
				onsubmitted(submitExpense.result?.url);
			}
		} catch (error) {
			submitError = isHttpError(error)
				? error.body.message
				: 'Could not submit the expense. Try again in a moment.';
		}
	});

	async function copy({ key, text }: { key: string; text: string }) {
		try {
			await navigator.clipboard.writeText(text);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = '';
			}, 1500);
		} catch {
			// Clipboard can be blocked; the text is still visible to select by hand.
		}
	}

	const copyFields = $derived([
		{ key: 'title', label: 'Title', text: draft.title },
		{
			key: 'item',
			label: 'Item description',
			text: draft.itemDescription
		},

		...(invoiceInfo ? [{ key: 'info', label: 'Invoice information', text: invoiceInfo }] : []),
		{ key: 'notes', label: 'Additional notes', text: notes }
	]);
</script>

<section class="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="submit-heading">
	<h2 id="submit-heading" class="text-lg">Submit</h2>

	{#if problems.length > 0}
		<ul class="space-y-1 text-sm text-muted-foreground">
			{#each problems as problem (problem)}
				<li class="flex items-start gap-1.5">
					<CircleAlert size={15} class="mt-0.5 shrink-0" />
					{#if problem.endsWith('in settings')}
						<a href={resolve('settings')} class="underline hover:text-foreground">{problem}</a>
					{:else}
						{problem}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<Button
		size="lg"
		class="w-full active:scale-[0.98]"
		disabled={problems.length > 0}
		onclick={() => (confirmOpen = true)}><Send />Submit to Open Collective</Button
	>

	<details class="border-t pt-4 text-sm">
		<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
			Copy fields to paste yourself
		</summary>
		<ul class="mt-3 space-y-2">
			{#each copyFields as field (field.key)}
				<li class="flex items-center justify-between gap-3">
					<span class="text-muted-foreground">{field.label}</span>
					<Button variant="outline" size="sm" onclick={() => copy(field)}>
						{@const copied = copiedKey === field.key}
						{#if copied}<Check
								class="animate-in duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] zoom-in-75 fade-in"
							/>{:else}<Clipboard />{/if}
						<!-- Both labels share one cell, so the button keeps the width of the longer one. -->
						<span class="grid">
							<span class={['col-start-1 row-start-1', copied && 'invisible']}>Copy</span>
							<span class={['col-start-1 row-start-1', !copied && 'invisible']}>Copied</span>
						</span>
					</Button>
				</li>
			{/each}
		</ul>
	</details>
</section>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Submit this expense?</Dialog.Title>
			<Dialog.Description>
				This sends a real expense request to the {settings.collectiveSlug} collective on Open Collective.
			</Dialog.Description>
		</Dialog.Header>

		<dl class="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
			<dt class="text-muted-foreground">Amount</dt>
			<dd class="font-medium">{formatMoney(draft.cents / 100, draft.currency)}</dd>
			<dt class="text-muted-foreground">Period</dt>
			<dd>{formatDMY(draft.startDate)} – {formatDMY(draft.endDate)}</dd>
			<dt class="text-muted-foreground">Paid to</dt>
			<dd>{settings.payoutMethodLabel ?? 'Your payout method'}</dd>
		</dl>

		{#if submitError}
			<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
				<CircleAlert size={15} class="mt-0.5 shrink-0" />{submitError}
			</p>
		{/if}
		{#each fields.allIssues() ?? [] as issue (issue.message)}
			<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
				<CircleAlert size={15} class="mt-0.5 shrink-0" />{issue.message}
			</p>
		{/each}

		<form {...enhanced}>
			<input {...fields.collectiveSlug.as('hidden', settings.collectiveSlug)} />
			<input {...fields.payoutMethodId.as('hidden', settings.payoutMethodId ?? '')} />
			<input {...fields.title.as('hidden', draft.title)} />
			<input {...fields.itemDescription.as('hidden', draft.itemDescription)} />
			<input {...fields.amountInCents.as('number', draft.cents)} hidden />
			<input {...fields.currency.as('hidden', draft.currency)} />
			<input {...fields.invoiceInfo.as('hidden', invoiceInfo ?? '')} />
			<input {...fields.notesHtml.as('hidden', notes ? workLogToHtml(notes) : '')} />
			<input {...fields.address.as('hidden', settings.payeeAddress ?? me?.address ?? '')} />
			<input {...fields.country.as('hidden', settings.payeeCountry ?? me?.country ?? '')} />
			<input {...fields.accountingCategoryId.as('hidden', settings.accountingCategoryId ?? '')} />

			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => (confirmOpen = false)}
					disabled={submitExpense.pending > 0}>Not yet</Button
				>
				<Button type="submit" disabled={submitExpense.pending > 0}>
					{#if submitExpense.pending > 0}<Spinner />{/if}
					Submit expense
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
