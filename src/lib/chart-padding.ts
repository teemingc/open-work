/**
 * Room around a chart's plot for its axis labels and legend, so they stay inside the card's
 * padding and clear of each other. Layerchart reserves 20px on the left by default, which a
 * label like "$200K" outgrows. Every side is set because passing `padding` replaces the
 * defaults, including the room a legend needs under the x-axis.
 */
/** Gap between an axis and its labels, so the labels at the bottom-left corner stay apart. */
export const TICK_LENGTH = 10;

/** Drops x-axis labels that would run into each other, measured as drawn, so a narrow chart stays readable. */
export const X_TICK_OCCLUSION = { padding: 12 } as const;

/** Y-axis labels sit just above their gridline, clear of the x-axis labels below the baseline. */
export const Y_TICK_LABEL = { verticalAnchor: 'end', dy: -3 } as const;

export function chartPadding({
	left = 48,
	right = 8,
	legend = false
}: {
	left?: number;
	right?: number;
	/** Whether there is a legend under the x-axis, or how tall it is once it wraps. */
	legend?: boolean | number;
} = {}): {
	top: number;
	right: number;
	bottom: number;
	left: number;
} {
	// The room is for text, so it grows with the reader's text size. A measured legend is already
	// in pixels as drawn.
	const em = remScale();
	const legendHeight = legend === true ? 20 * em : legend || 0;
	return {
		top: 18 * em,
		right: right * em,
		bottom: legendHeight ? 38 * em + legendHeight : 26 * em,
		left: (left + 6) * em
	};
}

/** The root font size against the usual 16px, or 1 on the server, where there is no reader. */
function remScale() {
	if (typeof document === 'undefined') return 1;
	return parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
}
