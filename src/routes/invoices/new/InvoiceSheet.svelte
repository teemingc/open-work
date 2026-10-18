<script lang="ts">
	import { formatMoney, splitWorkLogLine, toIsoDate } from '#lib/format.js';

	let {
		payeeName,
		payeeAddress,
		payeeCountry,
		collectiveSlug,
		title,
		itemDescription,
		cents,
		currency,
		invoiceInfo,
		workLog
	}: {
		payeeName?: string;
		payeeAddress?: string;
		payeeCountry?: string;
		collectiveSlug: string;
		title: string;
		itemDescription: string;
		cents: number;
		currency: string;
		invoiceInfo?: string;
		workLog: string;
	} = $props();

	const amount = $derived(formatMoney(cents / 100, currency));
	const today = toIsoDate(new Date());
	const logRows = $derived(
		workLog
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map(splitWorkLogLine)
	);
</script>

<!-- Only the sides: a vertical margin here would cancel the spacing the sidebar gives each item. -->
<figure class="mx-0 mt-0">
	<div
		class="rounded-sm border border-neutral-300 bg-white p-6 font-document text-[15px] leading-snug text-neutral-900 shadow-[0_1px_0_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(30_41_59/0.25)]"
	>
		<div class="grid grid-cols-2 gap-4 text-[13px]">
			<div>
				<p class="font-semibold">From</p>
				<p class="mt-1 text-neutral-700">
					{payeeName || 'Your name'}<br />
					{#if payeeAddress}{payeeAddress}<br />{/if}
					{payeeCountry ?? ''}
				</p>
			</div>
			<div class="text-left">
				<p class="font-semibold">Bill to</p>
				<p class="mt-1 text-neutral-700">
					Open Source Collective<br />
					440 N Barranca Ave #3939, Covina, CA 91723<br />
					US
				</p>
			</div>
		</div>

		<h2 class="mt-7 text-lg leading-tight font-semibold underline underline-offset-2">
			{title}
		</h2>
		<p class="mt-1 text-[13px] text-neutral-700">
			Collective: {collectiveSlug}<br />
			Date: {today}
		</p>

		<table class="mt-5 w-full table-fixed border-collapse text-[13px]">
			<thead>
				<tr class="bg-slate-100 text-left">
					<th class="w-[5.5rem] border border-neutral-200 p-2 font-semibold">Date</th>
					<th class="border border-neutral-200 p-2 font-semibold">Description</th>
					<th class="w-[5.5rem] border border-neutral-200 p-2 text-right font-semibold">
						Amount
					</th>
				</tr>
			</thead>
			<tbody>
				<tr class="align-top">
					<td class="border border-neutral-200 p-2">{today}</td>
					<td class="border border-neutral-200 p-2 break-words">{itemDescription}</td>
					<td class="border border-neutral-200 p-2 text-right tabular-nums">{amount}</td>
				</tr>
			</tbody>
		</table>

		<dl class="mt-4 ml-auto w-48 rounded border border-neutral-200 text-[13px]">
			<div class="flex justify-between px-3 py-1.5">
				<dt>Subtotal</dt>
				<dd class="tabular-nums">{amount}</dd>
			</div>
			<div class="flex justify-between bg-slate-100 px-3 py-1.5 font-semibold">
				<dt>Total</dt>
				<dd class="tabular-nums">{amount}</dd>
			</div>
		</dl>

		{#if invoiceInfo}
			<p class="mt-5 text-right text-[13px] text-neutral-700 italic">{invoiceInfo}</p>
		{/if}

		<div class="mt-6 border-t border-dashed border-neutral-300 pt-4">
			<p class="text-[13px] font-semibold">Additional notes</p>
			{#if logRows.length === 0}
				<p class="mt-1 text-[13px] text-neutral-500 italic">The work log will appear here.</p>
			{:else}
				<div class="mt-2 max-h-56 overflow-auto">
					<table class="w-full text-left text-[12px] text-neutral-700">
						<tbody>
							{#each logRows as cells, index (index)}
								<tr
									class={index === 0 && cells.length === 3 ? 'font-semibold text-neutral-900' : ''}
								>
									{#each cells as cell, cellIndex (cellIndex)}
										<td class="py-0.5 pr-3 align-top whitespace-nowrap">{cell}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
	<figcaption class="mt-3 text-xs text-muted-foreground">
		Preview. Open Collective builds the final invoice PDF after you submit.
	</figcaption>
</figure>
