/** A mark stacked off a point on a line, `offset` pixels from it: negative above, positive below. */
export type StackedMark<T> =
	| { kind: 'started' | 'stopped'; item: T; offset: number }
	/**
	 * A count of `more` who started or stopped with no mark of their own, or whose mark did not fit:
	 * `mixed` only when there is no room to count the two apart.
	 */
	| { kind: 'started' | 'stopped' | 'mixed'; more: number; offset: number };

/**
 * Where a month's marks go around its point on the line. Starts go above and stops below, as far
 * as each side has room; those that do not fit on their own side go on the other, after the marks
 * already there, so none lands on the axis labels or outside the chart.
 *
 * A count closes a side for the marks that fit on neither, and for those who started or stopped
 * without a mark of their own, so the marks at a point add up to its change. Starts are counted
 * above and stops below, each apart, as a single count of both does not say how many did which.
 * A count with no room on its own side goes on the other, and the two are counted together, as
 * `mixed`, only when counting them apart would leave no room for any mark.
 */
export function stackMarks<T>({
	starts,
	stops,
	otherStarts = 0,
	otherStops = 0,
	above,
	below,
	step,
	radius
}: {
	starts: T[];
	stops: T[];
	/** How many more started or stopped who get no mark of their own, only a place in a count. */
	otherStarts?: number;
	otherStops?: number;
	/** Pixels of room above the point, and below it down to the baseline. */
	above: number;
	below: number;
	/** Pixels between the centres of neighbouring marks, and from the point to the first. */
	step: number;
	/** A mark's radius, ring included. */
	radius: number;
}): StackedMark<T>[] {
	const fits = (room: number) => Math.max(0, Math.floor((room - radius) / step));
	const roomier: Side = above >= below ? 'up' : 'down';

	// A count's place can push a mark out, and that mark then needs counting too.
	let countStarts = otherStarts > 0;
	let countStops = otherStops > 0;
	let placed = place({ countStarts, countStops });
	while ((placed.hiddenStarts > 0 && !countStarts) || (placed.hiddenStops > 0 && !countStops)) {
		countStarts ||= placed.hiddenStarts > 0;
		countStops ||= placed.hiddenStops > 0;
		placed = place({ countStarts, countStops });
	}

	const { upper, lower, hiddenStarts, hiddenStops, counts } = placed;
	const sides = { up: upper.length, down: lower.length };
	return [
		...upper.map((mark, index) => ({ ...mark, offset: -(index + 1) * step })),
		...lower.map((mark, index) => ({ ...mark, offset: (index + 1) * step })),
		...counts.map(({ kind, side }) => {
			sides[side] += 1;
			return {
				kind,
				more:
					kind === 'started'
						? hiddenStarts
						: kind === 'stopped'
							? hiddenStops
							: hiddenStarts + hiddenStops,
				offset: (side === 'up' ? -1 : 1) * sides[side] * step
			};
		})
	];

	function place({ countStarts, countStops }: { countStarts: boolean; countStops: boolean }) {
		const room = { up: fits(above), down: fits(below) };
		const counts: { kind: 'started' | 'stopped' | 'mixed'; side: Side }[] = [];
		/** A place for a count on the side it belongs, the other when that is full, or over the edge of the roomier. */
		const take = (kind: 'started' | 'stopped' | 'mixed', own: Side) => {
			const other: Side = own === 'up' ? 'down' : 'up';
			const side = room[own] ? own : room[other] ? other : roomier;
			room[side] = Math.max(0, room[side] - 1);
			counts.push({ kind, side });
		};
		const apart = room.up + room.down - 2 >= Math.min(1, starts.length + stops.length);
		if (countStarts && countStops && !apart) take('mixed', roomier);
		else {
			if (countStarts) take('started', 'up');
			if (countStops) take('stopped', 'down');
		}

		const startsUp = Math.min(starts.length, room.up);
		const stopsDown = Math.min(stops.length, room.down);
		const stopsUp = Math.min(stops.length - stopsDown, room.up - startsUp);
		const startsDown = Math.min(starts.length - startsUp, room.down - stopsDown);

		const started = (item: T) => ({ kind: 'started' as const, item });
		const stopped = (item: T) => ({ kind: 'stopped' as const, item });
		return {
			upper: [
				...starts.slice(0, startsUp).map(started),
				...stops.slice(stopsDown, stopsDown + stopsUp).map(stopped)
			],
			lower: [
				...stops.slice(0, stopsDown).map(stopped),
				...starts.slice(startsUp, startsUp + startsDown).map(started)
			],
			hiddenStarts: starts.length - startsUp - startsDown + otherStarts,
			hiddenStops: stops.length - stopsDown - stopsUp + otherStops,
			counts
		};
	}
}

type Side = 'up' | 'down';
