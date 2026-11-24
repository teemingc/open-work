import { describe, expect, it } from 'vitest';
import { stackMarks } from './mark-stack.js';

/** The recurring contributors chart: marks 19px apart, 9px in radius. */
const size = { step: 19, radius: 9 };

describe('stackMarks', () => {
	it('puts starts above the line and stops below it when both fit', () => {
		const marks = stackMarks({ starts: ['a'], stops: ['b', 'c'], above: 100, below: 100, ...size });
		expect(marks).toEqual([
			{ kind: 'started', item: 'a', offset: -19 },
			{ kind: 'stopped', item: 'b', offset: 19 },
			{ kind: 'stopped', item: 'c', offset: 38 }
		]);
	});

	it('moves the stops above the line when they do not all fit below it', () => {
		// e18e in November 2026: four top backers stopped, leaving 3, so the point is 27px above the
		// baseline of a 180px plot with 18px of padding over it.
		const marks = stackMarks({
			starts: [],
			stops: ['a', 'b', 'c', 'd'],
			above: 171,
			below: 27,
			...size
		});
		expect(marks.map((mark) => mark.offset)).toEqual([-19, -38, -57, -76]);
		expect(marks.every((mark) => mark.kind === 'stopped')).toBe(true);
	});

	it('counts the marks that do not fit above the line in its last place', () => {
		const marks = stackMarks({
			starts: ['a', 'b'],
			stops: ['c', 'd', 'e'],
			above: 70,
			below: 0,
			...size
		});
		expect(marks).toEqual([
			{ kind: 'started', item: 'a', offset: -19 },
			{ kind: 'started', item: 'b', offset: -38 },
			{ kind: 'stopped', more: 3, offset: -57 }
		]);
	});
});
