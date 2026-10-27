<script lang="ts">
	let {
		x,
		y,
		r,
		logo = r,
		name,
		imageUrl,
		recurring,
		mark
	}: {
		x: number;
		y: number;
		r: number;
		/** The logo's radius, when it sits smaller in the middle of its disc. */
		logo?: number;
		name: string;
		imageUrl: string | null;
		/** Given to monthly, which a ring around the logo marks. */
		recurring: boolean;
		/** Text drawn in place of a logo, like "+12"; the name's first letter by default. */
		mark?: string;
	} = $props();

	const id = $props.id();
	/** How much each pair of a pixel's red, green and blue differ, either way round, tripled. */
	const DIFFERENCES = ['3 -3 0', '-3 3 0', '0 3 -3', '0 -3 3', '3 0 -3', '-3 0 3'];
</script>

<!-- A project's logo on a card-coloured disc, as many logos are transparent. -->
<circle cx={x} cy={y} {r} class="fill-card stroke-border" stroke-width="1" />
{#if imageUrl}
	{#if logo < r}
		<!--
			The disc around a smaller logo, washed in its colours by a blur of it, so the logo looks part
			of the disc rather than set on a blank one. The blur also hides how far it is stretched. Only
			its bright colours are kept, as its black, white and grey would wash the disc a murky grey:
			each pixel is kept as much as its channels differ from each other.
		-->
		<clipPath id="disc-{id}">
			<circle cx={x} cy={y} r={Math.max(0, r - 1)} />
		</clipPath>
		<filter id="blur-{id}" color-interpolation-filters="sRGB">
			<feGaussianBlur stdDeviation={r / 3} result="blur" />
			<feColorMatrix in="blur" type="saturate" values="3" result="saturated" />
			<!-- Lifted halfway to white, so a dark logo's colour washes the disc a pale tint of it. -->
			<feComponentTransfer in="saturated" result="vivid">
				<feFuncR type="linear" slope="0.5" intercept="0.5" />
				<feFuncG type="linear" slope="0.5" intercept="0.5" />
				<feFuncB type="linear" slope="0.5" intercept="0.5" />
			</feComponentTransfer>
			{#each DIFFERENCES as difference (difference)}
				<feColorMatrix
					in="blur"
					type="matrix"
					values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 {difference} 0 0"
					result="chroma-{difference}"
				/>
			{/each}
			<feMerge result="chroma">
				{#each DIFFERENCES as difference (difference)}
					<feMergeNode in="chroma-{difference}" />
				{/each}
			</feMerge>
			<!-- Dark pixels left out too, as a near-black navy differs enough to wash the disc grey. -->
			<feColorMatrix
				in="blur"
				type="matrix"
				values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 0 -0.3"
				result="bright"
			/>
			<feComposite in="chroma" in2="bright" operator="in" result="colourful" />
			<feComposite in="vivid" in2="colourful" operator="in" />
		</filter>
		<g clip-path="url(#disc-{id})">
			<image
				href={imageUrl}
				x={x - r * 1.4}
				y={y - r * 1.4}
				width={r * 2.8}
				height={r * 2.8}
				filter="url(#blur-{id})"
				opacity="0.3"
				preserveAspectRatio="xMidYMid slice"
			/>
		</g>
	{/if}
	<clipPath id="logo-{id}">
		<circle cx={x} cy={y} r={Math.max(0, logo - 1)} />
	</clipPath>
	<image
		href={imageUrl}
		x={x - logo}
		y={y - logo}
		width={logo * 2}
		height={logo * 2}
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
		font-size={mark && mark.length > 1 ? logo * 0.6 : logo}
		>{mark ?? name.slice(0, 1).toUpperCase()}</text
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
