<script lang="ts" module>
	export interface Stat {
		label: string;
		value: string;
		note: string;
		/** A text colour class for the value, like `text-destructive`. */
		tone?: string;
		/** A small badge beside the label: a trend, a warning, or a share. */
		badge?: {
			text: string;
			icon?: 'up' | 'down' | 'hourglass';
			tone?: string;
			title?: string;
		};
	}
</script>

<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Hourglass, TrendingDown, TrendingUp } from '@lucide/svelte';

	let { stats }: { stats: Stat[] } = $props();

	const ICONS = { up: TrendingUp, down: TrendingDown, hourglass: Hourglass };
</script>

<!-- One compact strip of figures. Gaps over a border-coloured background draw even dividers. -->
<Card.Root class="gap-0 overflow-hidden py-0">
	<dl class="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
		{#each stats as stat (stat.label)}
			<div class="flex min-w-0 flex-col gap-1 bg-card px-4 py-3">
				<dt
					class="flex items-center justify-between gap-2 text-sm whitespace-nowrap text-muted-foreground"
				>
					{stat.label}
					{#if stat.badge}
						{@const Icon = stat.badge.icon && ICONS[stat.badge.icon]}
						<Badge variant="outline" class={stat.badge.tone} title={stat.badge.title}>
							{#if Icon}<Icon />{/if}
							{stat.badge.text}
						</Badge>
					{/if}
				</dt>
				<dd class="font-document text-2xl font-medium tabular-nums {stat.tone ?? ''}">
					{stat.value}
				</dd>
				<dd class="truncate text-xs text-muted-foreground" title={stat.note}>{stat.note}</dd>
			</div>
		{/each}
	</dl>
</Card.Root>
