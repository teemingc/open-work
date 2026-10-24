<script lang="ts">
	let {
		x,
		y,
		r,
		name,
		imageUrl,
		recurring,
		mark
	}: {
		x: number;
		y: number;
		r: number;
		name: string;
		imageUrl: string | null;
		/** Given to monthly, which a ring around the logo marks. */
		recurring: boolean;
		/** Text drawn in place of a logo, like "+12"; the name's first letter by default. */
		mark?: string;
	} = $props();

	const id = $props.id();
</script>

<!-- A project's logo on a card-coloured disc, as many logos are transparent. -->
<circle cx={x} cy={y} {r} class="fill-card stroke-border" stroke-width="1" />
{#if imageUrl}
	<clipPath id="logo-{id}">
		<circle cx={x} cy={y} r={Math.max(0, r - 1)} />
	</clipPath>
	<image
		href={imageUrl}
		x={x - r}
		y={y - r}
		width={r * 2}
		height={r * 2}
		clip-path="url(#logo-{id})"
		preserveAspectRatio="xMidYMid slice"
	/>
{:else}
	<text
		{x}
		{y}
		text-anchor="middle"
		dominant-baseline="central"
		class="fill-muted-foreground font-medium"
		font-size={mark && mark.length > 1 ? r * 0.6 : r}>{mark ?? name.slice(0, 1).toUpperCase()}</text
	>
{/if}
{#if recurring}
	<circle
		cx={x}
		cy={y}
		r={r + Math.max(1.5, Math.min(2.5, r / 4))}
		class="fill-none stroke-chart-expenses"
		stroke-width={r < 10 ? 1.5 : 2}
	/>
{/if}
