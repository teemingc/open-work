/** A mark stacked off a point on a line, `offset` pixels from it: negative above, positive below. */
export type StackedMark<T> =
	| { kind: 'started' | 'stopped'; item: T; offset: number }
	/** In place of the `more` marks that did not fit: `mixed` when some started and some stopped. */
	| { kind: 'started' | 'stopped' | 'mixed'; more: number; offset: number };

/**
 * Where a month's marks go around its point on the line. Starts go above and stops below, as far
 * as each side has room; those that do not fit on their own side go on the other, after the marks
 * already there, so none lands on the axis labels or outside the chart. When both sides are full,
 * the last place on the roomier side counts the marks left out.
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
	let up = fits(above);
	let down = fits(below);
	const over = starts.length + stops.length > up + down;
	const countAbove = above >= below;
	if (over && countAbove) up = Math.max(0, up - 1);
	if (over && !countAbove) down = Math.max(0, down - 1);

	const startsUp = Math.min(starts.length, up);
	const stopsDown = Math.min(stops.length, down);
	const stopsUp = Math.min(stops.length - stopsDown, up - startsUp);
	const startsDown = Math.min(starts.length - startsUp, down - stopsDown);

	const started = (item: T) => ({ kind: 'started' as const, item });
	const stopped = (item: T) => ({ kind: 'stopped' as const, item });
	const upper = [
		...starts.slice(0, startsUp).map(started),
		...stops.slice(stopsDown, stopsDown + stopsUp).map(stopped)
	];
	const lower = [
		...stops.slice(0, stopsDown).map(stopped),
		...starts.slice(startsUp, startsUp + startsDown).map(started)
	];

	const marks: StackedMark<T>[] = [
		...upper.map((mark, index) => ({ ...mark, offset: -(index + 1) * step })),
		...lower.map((mark, index) => ({ ...mark, offset: (index + 1) * step }))
	];
	const hiddenStarts = starts.length - startsUp - startsDown;
	const hiddenStops = stops.length - stopsDown - stopsUp;
	if (hiddenStarts + hiddenStops) {
		marks.push({
			kind: !hiddenStops ? 'started' : !hiddenStarts ? 'stopped' : 'mixed',
			more: hiddenStarts + hiddenStops,
			offset: countAbove ? -(upper.length + 1) * step : (lower.length + 1) * step
		});
	}
	return marks;
}
