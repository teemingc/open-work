/**
 * Room around a chart's plot for its axis labels and legend, so they stay inside the card's
 * padding and clear of each other. Layerchart reserves 20px on the left by default, which a
 * label like "$200K" outgrows. Every side is set because passing `padding` replaces the
 * defaults, including the room a legend needs under the x-axis.
 */
/** Gap between an axis and its labels, so the labels at the bottom-left corner stay apart. */
export const TICK_LENGTH = 10;

/** Y-axis labels sit just above their gridline, clear of the x-axis labels below the baseline. */
export const Y_TICK_LABEL = { verticalAnchor: 'end', dy: -3 } as const;

export function chartPadding({
	left = 48,
	legend = false
}: { left?: number; legend?: boolean } = {}): {
	top: number;
	right: number;
	bottom: number;
	left: number;
} {
	return { top: 18, right: 8, bottom: legend ? 58 : 26, left: left + 6 };
}
