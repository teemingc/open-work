<script lang="ts">
	import { clientColor } from '#lib/client-colors.js';
	import ClientName from '#lib/components/ClientName.svelte';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { formatHours, formatMoney } from '#lib/format.js';
	import type { Client, ClientTotal } from '#lib/worklog.js';

	let { totals, clients }: { totals: ClientTotal[]; clients: Client[] } = $props();

	const clientIndex = $derived(new Map(clients.map((client, index) => [client.id, index])));
	/** A client without a target is measured against the client with the most hours. */
	const most = $derived(Math.max(1, ...totals.map((total) => total.hours)));
</script>

<!--
	The chart's key, with each client's hours towards its target and what it earned. With one client
	the figures above already say all of this.
-->
{#if totals.length > 1}
	<ul class="grid gap-x-8 gap-y-4 text-sm tabular-nums @2xl/card:grid-cols-2">
		{#each totals as { client, hours, amount, target } (client.id)}
			{const max = $derived(target ?? most)}
			{const reached = $derived(target !== undefined && hours >= target)}
			<li class="flex flex-col gap-2">
				<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<ClientName {client} class="font-medium" />
					<div class="ml-auto flex items-baseline gap-4 whitespace-nowrap">
						<span class={reached ? 'text-status-paid' : 'text-muted-foreground'}>
							<span class={reached ? '' : 'text-foreground'}>{formatHours(hours)}</span>
							{#if target !== undefined}of {formatHours(target)}{/if}
							hours
						</span>
						<span class="min-w-16 text-right font-medium">
							{formatMoney(amount, client.currency)}
						</span>
					</div>
				</div>
				<Progress
					value={Math.min(hours, max)}
					{max}
					aria-label="{client.name}'s hours"
					class="h-2 [&_[data-slot=progress-indicator]]:bg-(--client)"
					style="--client: {clientColor(client, clientIndex.get(client.id) ?? 0)}"
				/>
			</li>
		{/each}
	</ul>
{/if}
