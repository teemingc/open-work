/** A mark stacked off a point on a line: what it stands for, and how far from the point its centre is. */
export type StackedMark<T> = {
	kind: 'started' | 'stopped';
	/** What the mark shows, or nothing for the one that counts those left out. */
	item?: T;
	/** How many it stands for when it counts those left out, like "+3". */
	more?: number;
	/** Pixels from the point to the mark's centre: negative above the line, positive below. */
	offset: number;
};

/**
 * Where a month's marks go around its point on the line: starts above, stops below when they all
 * fit between the line and the baseline, and above after the starts when they do not, so they never
 * land on the axis labels. When the stack above is taller than the room, its last place counts the
 * marks left out.
 */
export function stackMarks<T>({
	starts,
	stops,
	above,
	below,
	step,
	radius
}: {
	starts: T[];
	stops: T[];
	/** Pixels of room above the point, and below it down to the baseline. */
	above: number;
	below: number;
	/** Pixels between the centres of neighbouring marks, and from the point to the first. */
	step: number;
	/** A mark's radius, ring included. */
	radius: number;
}): StackedMark<T>[] {
	const fits = (room: number) => Math.max(0, Math.floor((room - radius) / step));
	const stopsBelow = stops.length <= fits(below);

	const up = [
		...starts.map((item) => ({ kind: 'started' as const, item })),
		...(stopsBelow ? [] : stops.map((item) => ({ kind: 'stopped' as const, item })))
	];
	// Always room for one mark, so a month's changes never vanish from a very short chart.
	const places = Math.max(1, fits(above));
	const shown = up.length > places ? up.slice(0, places - 1) : up;
	const hidden = up.slice(shown.length);

	const marks: StackedMark<T>[] = shown.map((mark, index) => ({
		...mark,
		offset: -(index + 1) * step
	}));
	if (hidden.length) {
		// Stops come last, so whatever is left out ends with them.
		marks.push({
			kind: hidden[hidden.length - 1].kind,
			more: hidden.length,
			offset: -(shown.length + 1) * step
		});
	}
	if (stopsBelow) {
		marks.push(
			...stops.map((item, index) => ({
				kind: 'stopped' as const,
				item,
				offset: (index + 1) * step
			}))
		);
	}
	return marks;
}
