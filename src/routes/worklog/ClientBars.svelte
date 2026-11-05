<script lang="ts">
	import { clientColor } from '#lib/client-colors.js';
	import ClientName from '#lib/components/ClientName.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { formatHours, formatMoney } from '#lib/format.js';
	import type { Client, MonthSummary } from '#lib/worklog.js';

	let { summary, clients }: { summary: MonthSummary; clients: Client[] } = $props();

	const clientIndex = $derived(new Map(clients.map((client, index) => [client.id, index])));
	/** A client without a target is measured against the client with the most hours. */
	const most = $derived(Math.max(1, ...summary.clients.map((total) => total.hours)));
</script>

<!-- With one client the month's figures already say all of this. -->
{#if summary.clients.length > 1}
	<Card.Root>
		<Card.Header>
			<Card.Title>Clients</Card.Title>
		</Card.Header>
		<Card.Content>
			<!-- Each client's hours towards its target, filled in its colour, with what it earned. -->
			<ul class="flex flex-col gap-4 text-sm tabular-nums">
				{#each summary.clients as { client, hours, amount, target } (client.id)}
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
								<span class="min-w-16 text-right font-medium"
									>{formatMoney(amount, client.currency)}</span
								>
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
		</Card.Content>
	</Card.Root>
{/if}
