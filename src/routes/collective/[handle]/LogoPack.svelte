<script lang="ts">
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { ExternalLink } from '@lucide/svelte';
	import { hierarchy, pack, packSiblings } from 'd3-hierarchy';
	import { moneyFormat } from './chart-format';
	import { transactionsUrl } from './financials';
	import type { Recipient } from './grants';
	import type { LinkedProject } from './linked-project.svelte';
	import LogoMark from './LogoMark.svelte';
	import MoneyRow from './MoneyRow.svelte';

	let {
		recipients,
		linked,
		slug,
		currency
	}: {
		recipients: Recipient[];
		/** The project picked here or in the bars, highlighted in both. */
		linked: LinkedProject;
		/** The fund's own slug, for links to its transactions. */
		slug: string;
		currency: string;
	} = $props();

	const money = $derived(moneyFormat(currency));
	const dayMonthYear = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

	/** Past this many, logos get too small to make out, so the smallest share one circle. */
	const LIMIT = 30;

	type Slot =
		| { kind: 'recipient'; key: string; value: number; recipient: Recipient }
		| { kind: 'others'; key: string; value: number; rest: Recipient[] };

	const slots = $derived.by((): Slot[] => {
		const many = recipients.length > LIMIT;
		const shown = many ? recipients.slice(0, LIMIT - 1) : recipients;
		const rest = many ? recipients.slice(LIMIT - 1) : [];
		return [
			...shown.map((recipient): Slot => ({
				kind: 'recipient',
				key: recipient.slug,
				value: recipient.total,
				recipient
			})),
			...(rest.length
				? [
						{
							kind: 'others',
							key: 'others',
							value: rest.reduce((sum, r) => sum + r.total, 0),
							rest
						} satisfies Slot
					]
				: [])
		];
	});

	/** Space between circles, in pixels. */
	const GAP = 6;
	/** The smallest a logo gets, so a small gift can still be made out on a phone. */
	const MIN_RADIUS = 11;
	type Placed = { slot: Slot; x: number; y: number; r: number };

	/**
	 * The circles packed together, sized by area, then scaled and centred to fill the box, which a
	 * circle-shaped pack would leave half empty on a wide screen.
	 */
	function layout(width: number, height: number): Placed[] {
		if (!width || !height || !slots.length) return [];
		/** A circle's radius before scaling, never so small it ends up under `MIN_RADIUS`. */
		let floor = 0;
		const size = (slot: Slot) => Math.max(floor, Math.sqrt(slot.value));
		const place = (pad: number) => {
			const circles = slots.map((slot) => ({ slot, x: 0, y: 0, r: size(slot) + pad }));
			packSiblings(circles);
			// Turned a quarter when its long side is across a tall box, as on phones.
			const across = (key: 'x' | 'y') =>
				Math.max(...circles.map((c) => c[key] + c.r)) -
				Math.min(...circles.map((c) => c[key] - c.r));
			if (across('x') > across('y') !== width > height)
				for (const circle of circles) [circle.x, circle.y] = [circle.y, circle.x];
			const left = Math.min(...circles.map((c) => c.x - c.r));
			const right = Math.max(...circles.map((c) => c.x + c.r));
			const top = Math.min(...circles.map((c) => c.y - c.r));
			const bottom = Math.max(...circles.map((c) => c.y + c.r));
			const scale = Math.min(width / (right - left), height / (bottom - top));
			return { circles, left, right, top, bottom, scale };
		};
		// The gap is in pixels, so it depends on the scale, which one more pass gets close enough.
		const first = place(0);
		floor = MIN_RADIUS / first.scale;
		const { circles, left, right, top, bottom, scale } = place(GAP / 2 / first.scale);
		const dx = (width - (right - left) * scale) / 2 - left * scale;
		const dy = (height - (bottom - top) * scale) / 2 - top * scale;
		return circles.map(({ slot, x, y }) => ({
			slot,
			x: x * scale + dx,
			y: y * scale + dy,
			r: size(slot) * scale
		}));
	}

	/** The rest packed as dots inside their shared circle, so it still reads as many small gifts. */
	function dots(rest: Recipient[], r: number) {
		const inner = Math.max(0, r - 4);
		const root = pack<{ children?: Recipient[] } | Recipient>()
			.size([inner * 2, inner * 2])
			.padding(1.5)(
			hierarchy<{ children?: Recipient[] } | Recipient>({ children: rest }).sum((d) =>
				'total' in d ? d.total : 0
			)
		);
		return root.leaves().map((leaf) => ({ x: leaf.x - inner, y: leaf.y - inner, r: leaf.r }));
	}

	const anyMonthly = $derived(recipients.some((r) => r.monthly > 0));
	/** The logo focused by keyboard, ringed like a hovered one. */
	let focused = $state<string>();

	/** What the fund gave a project, or the rest, on Open Collective. */
	const link = new TooltipLink(
		(slot: Slot) =>
			transactionsUrl({
				slug,
				account: slot.kind === 'recipient' ? slot.recipient.slug : undefined,
				kinds: ['CONTRIBUTION']
			}),
		(slot) => linked.pin('pack', slot?.kind === 'recipient' ? slot.recipient.slug : undefined)
	);
	const describe = (recipient: Recipient) =>
		recipient.total === recipient.monthly
			? `${recipient.name}: ${money.format(recipient.monthly)} every month`
			: `${recipient.name}: ${money.format(recipient.total)}${recipient.monthly ? `, ${money.format(recipient.monthly)} every month` : ''}`;
</script>

<LazyChart class="h-80 sm:h-96">
	{#snippet children({ Chart, Layer, LayerChart, TooltipRoot })}
		<Chart.Container config={{}} class="aspect-auto size-full">
			<LayerChart
				padding={{ top: 8, right: 8, bottom: 8, left: 8 }}
				tooltipContext={{ locked: link.locked }}
			>
				{#snippet children({ context })}
					{@const show = (event: PointerEvent, slot: Slot) => {
						context.tooltip.show(event, slot);
						linked.hover('pack', slot.kind === 'recipient' ? slot.recipient.slug : undefined);
					}}
					{@const nodes = layout(context.width, context.height)}
					{@const others =
						(context.tooltip.data as Slot | null)?.kind === 'others' ? 'others' : undefined}
					<!-- Picked here, in the bars, or by keyboard. -->
					{@const active = nodes.find(
						(node) => node.slot.key === (focused ?? linked.slug ?? others)
					)}
					<Layer>
						{#each nodes as node (node.slot.key)}
							{@const slot = node.slot}
							<!--
								A link, so it can be reached by keyboard and screen readers. A click opens it with a
								mouse; a tap pins its tooltip, which holds the link, as there is no hover on touch.
							-->
							<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
							<a
								href={link.url(slot)}
								target="_blank"
								rel="noreferrer"
								aria-label={slot.kind === 'recipient'
									? describe(slot.recipient)
									: `${slot.rest.length} more projects: ${money.format(slot.value)}`}
								class="cursor-pointer outline-none"
								onfocus={() => (focused = slot.key)}
								onblur={() => (focused = undefined)}
								onpointerenter={(event) => show(event, slot)}
								onpointermove={(event) => show(event, slot)}
								onpointerleave={() => {
									context.tooltip.hide();
									linked.hover('pack');
								}}
								onclick={(event) => {
									event.preventDefault();
									link.click(event, { data: slot });
								}}
							>
								<!--
									Covers the ring too, so a tap just outside a small logo still lands. Its first
									child, it also tells Svelte this link is an SVG one, which would not draw otherwise.
								-->
								<circle cx={node.x} cy={node.y} r={node.r + 3} class="fill-transparent" />
								{#if slot.kind === 'recipient'}
									<LogoMark
										x={node.x}
										y={node.y}
										r={node.r}
										name={slot.recipient.name}
										imageUrl={slot.recipient.imageUrl}
										recurring={slot.recipient.monthly > 0}
									/>
								{:else}
									<circle cx={node.x} cy={node.y} r={node.r} class="fill-muted stroke-border" />
									{#each dots(slot.rest, node.r) as dot, index (index)}
										<circle
											cx={node.x + dot.x}
											cy={node.y + dot.y}
											r={dot.r}
											class="fill-muted-foreground/25"
										/>
									{/each}
									<text
										x={node.x}
										y={node.y}
										text-anchor="middle"
										dominant-baseline="central"
										font-size={Math.max(11, node.r * 0.4)}
										paint-order="stroke"
										stroke-width="3"
										class="fill-foreground stroke-muted font-medium">+{slot.rest.length}</text
									>
								{/if}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/each}
						<!--
							Drawn once, after every logo, so a neighbour drawn later never covers it, and just
							outside the monthly ring.
						-->
						{#if active}
							<circle
								cx={active.x}
								cy={active.y}
								r={active.r +
									(active.slot.kind === 'recipient' && active.slot.recipient.monthly ? 6 : 3.5)}
								class={[
									'pointer-events-none fill-none',
									focused ? 'stroke-primary' : 'stroke-primary/50'
								]}
								stroke-width="2"
							/>
						{/if}
					</Layer>
					{@const slot = context.tooltip.data as Slot | null}
					{@const href = slot ? link.href(slot) : undefined}
					<TooltipRoot variant="none" pointerEvents={link.locked && href !== undefined}>
						{#if slot}
							<div
								class="grid max-w-64 min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
							>
								{#if slot.kind === 'recipient'}
									{@const recipient = slot.recipient}
									<div class="font-medium">{recipient.name}</div>
									<!-- Once, when all it has been given so far is its first monthly gift. -->
									{#if recipient.total !== recipient.monthly}
										<MoneyRow value={recipient.total} name="Given by this fund" {money} />
									{/if}
									{#if recipient.monthly}
										<MoneyRow value={recipient.monthly} name="Given every month" {money} />
									{/if}
									<div class="flex w-full items-center gap-2">
										<span class="flex-1 text-muted-foreground">Last given</span>
										<span class="font-medium text-foreground tabular-nums">
											{dayMonthYear.format(new Date(recipient.last))}
										</span>
									</div>
								{:else}
									<div class="font-medium">{slot.rest.length} more projects</div>
									<MoneyRow value={slot.value} name="Given by this fund" {money} />
								{/if}
								{#if href}
									<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
									<a
										{href}
										target="_blank"
										rel="noreferrer"
										class="flex items-center gap-1 border-t border-border/50 pt-1.5 font-medium underline-offset-4 hover:underline"
									>
										View on Open Collective
										<ExternalLink class="size-3 text-muted-foreground" aria-hidden="true" />
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{/if}
							</div>
						{/if}
					</TooltipRoot>
				{/snippet}
			</LayerChart>
		</Chart.Container>
	{/snippet}
</LazyChart>

{#if anyMonthly}
	<p class="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
		<span class="size-3 rounded-full border-2 border-chart-expenses" aria-hidden="true"></span>
		Monthly contributions
	</p>
{/if}
