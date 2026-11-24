import { describe, expect, it } from 'vitest';
import { stackMarks } from './mark-stack.js';

/** The recurring contributors chart: marks 19px apart, 9px in radius. */
const size = { step: 19, radius: 9 };

describe('stackMarks', () => {
	it('moves the stops above the line when there is no room below it', () => {
		// e18e in November 2026: four top backers stopped, leaving 3 of a 20-high axis, so the point
		// is 25px above the baseline.
		const marks = stackMarks({
			starts: [],
			stops: ['a', 'b', 'c', 'd'],
			above: 172,
			below: 25,
			...size
		});
		expect(marks.map((mark) => mark.offset)).toEqual([-19, -38, -57, -76]);
		expect(marks.every((mark) => mark.kind === 'stopped')).toBe(true);
	});

	it('keeps the stops that fit below the line and moves only the rest above it', () => {
		const marks = stackMarks({
			starts: ['a', 'b', 'c'],
			stops: ['d', 'e', 'f', 'g', 'h'],
			above: 108,
			below: 90,
			...size
		});
		expect(marks).toEqual([
			{ kind: 'started', item: 'a', offset: -19 },
			{ kind: 'started', item: 'b', offset: -38 },
			{ kind: 'started', item: 'c', offset: -57 },
			{ kind: 'stopped', item: 'h', offset: -76 },
			{ kind: 'stopped', item: 'd', offset: 19 },
			{ kind: 'stopped', item: 'e', offset: 38 },
			{ kind: 'stopped', item: 'f', offset: 57 },
			{ kind: 'stopped', item: 'g', offset: 76 }
		]);
	});

	it('puts a start below the line when the point is too near the top for it', () => {
		const marks = stackMarks({ starts: ['a', 'b'], stops: [], above: 28, below: 170, ...size });
		expect(marks).toEqual([
			{ kind: 'started', item: 'a', offset: -19 },
			{ kind: 'started', item: 'b', offset: 19 }
		]);
	});

	it('counts the marks that fit on neither side, as mixed when they are of both kinds', () => {
		const marks = stackMarks({
			starts: ['a', 'b', 'c'],
			stops: ['d'],
			above: 50,
			below: 0,
			...size
		});
		expect(marks).toEqual([
			{ kind: 'started', item: 'a', offset: -19 },
			{ kind: 'mixed', more: 3, offset: -38 }
		]);
	});

	it('counts those who started without a mark of their own after the marks', () => {
		// e18e in November 2025: six started giving regularly, three of them top backers with logos,
		// and the three logos alone read as three starts.
		const marks = stackMarks({
			starts: ['a', 'b', 'c'],
			stops: [],
			otherStarts: 3,
			above: 110,
			below: 95,
			...size
		});
		expect(marks).toEqual([
			{ kind: 'started', item: 'a', offset: -19 },
			{ kind: 'started', item: 'b', offset: -38 },
			{ kind: 'started', item: 'c', offset: -57 },
			{ kind: 'started', more: 3, offset: -76 }
		]);
	});

	it('counts unmarked starts above the line when the only mark is a stop below it', () => {
		// e18e in July 2026: a top backer stopped and three others started, with more room below the
		// point than above it, and a count of starts under the stopped logo read as part of the stop.
		const marks = stackMarks({
			starts: [],
			stops: ['a'],
			otherStarts: 3,
			above: 80,
			below: 120,
			...size
		});
		expect(marks).toEqual([
			{ kind: 'stopped', item: 'a', offset: 19 },
			{ kind: 'started', more: 3, offset: -19 }
		]);
	});

	it('counts unmarked starts and stops apart, each on its own side', () => {
		// e18e in August 2026: a top backer started, and of the others one started and one stopped,
		// which a single grey "+2" did not tell apart.
		const marks = stackMarks({
			starts: ['a'],
			stops: [],
			otherStarts: 1,
			otherStops: 1,
			above: 80,
			below: 120,
			...size
		});
		expect(marks).toEqual([
			{ kind: 'started', item: 'a', offset: -19 },
			{ kind: 'started', more: 1, offset: -38 },
			{ kind: 'stopped', more: 1, offset: 19 }
		]);
	});
});
