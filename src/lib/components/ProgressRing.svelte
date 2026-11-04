<script lang="ts">
	let {
		value,
		label,
		class: className
	}: {
		/** How far round, where 1 is a full ring. Past 1 it laps over itself, as a fitness ring does. */
		value: number;
		/** Written in the middle, like "107%". */
		label?: string;
		class?: string;
	} = $props();
</script>

<!--
	A conic gradient cut to a band, darkest where the ring starts and brightest at its tip. Past a
	full turn the gradient follows the tip round, and the tip's shadow falls on the lap beneath it, so
	the overlap reads as the ring going on. Only the label in the middle is read out.
-->
<div
	class={['progress-ring', value >= 1 && 'done', className]}
	style:--value="{Math.max(0, value) * 360}deg"
>
	<div class="band" aria-hidden="true">
		<span class="cap start"></span>
		<span class="cap tip"></span>
	</div>
	{#if label}<span class="label">{label}</span>{/if}
</div>

<style>
	@property --turn {
		syntax: '<angle>';
		inherits: true;
		initial-value: 0deg;
	}

	.progress-ring {
		--dark: var(--ring-from);
		--bright: var(--ring-to);
		--thickness: 22%;
		/* Set here rather than inline, so the sweep in below can start it from nothing. */
		--turn: var(--value);
		/* Where the drawn part begins: the top, until a lap covers it and it follows the tip. */
		--from: max(0deg, calc(var(--turn) - 360deg));
		/* The band and the label share one cell, so where the ring goes is up to whoever places it. */
		display: grid;
		aspect-ratio: 1;
	}

	.band,
	.label {
		grid-area: 1 / 1;
	}

	.label {
		place-self: center;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
		color: var(--foreground);
	}

	.done .label {
		color: var(--status-paid);
	}

	.progress-ring.done {
		--dark: var(--ring-done-from);
		--bright: var(--ring-done-to);
	}

	.band {
		position: relative;
		border-radius: 50%;
		background:
			conic-gradient(
				from var(--from),
				var(--dark) 0deg,
				var(--bright) calc(var(--turn) - var(--from)),
				transparent 0
			),
			color-mix(in oklch, var(--bright) 22%, transparent);
		mask: radial-gradient(
			farthest-side,
			transparent calc(100% - var(--thickness) - 0.5px),
			black calc(100% - var(--thickness))
		);
	}

	/* The rounded ends, each turned to its angle and sat at the top of the band. */
	.cap {
		position: absolute;
		inset: 0;
		rotate: var(--angle);

		&::before {
			content: '';
			position: absolute;
			top: 0;
			left: calc(50% - var(--thickness) / 2);
			width: var(--thickness);
			aspect-ratio: 1;
			border-radius: 50%;
			background: var(--color);
		}
	}

	.start {
		--angle: var(--from);
		--color: var(--dark);
	}

	.tip {
		--angle: var(--turn);
		--color: var(--bright);
	}

	/* Cast ahead of the tip, onto the lap it covers; the band's mask keeps it inside the ring. */
	.done .tip::before {
		box-shadow: 3px 0 5px 1px color-mix(in oklch, black 75%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.progress-ring {
			transition: --turn 1200ms cubic-bezier(0.23, 1, 0.32, 1);

			@starting-style {
				--turn: 0deg;
			}
		}

		/* A pop as the sweep comes round to the goal, so meeting it feels like something. */
		.progress-ring.done {
			animation: goal 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 700ms;
		}
	}

	@keyframes goal {
		40% {
			scale: 1.12;
		}
	}
</style>
