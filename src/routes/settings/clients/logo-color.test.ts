import { describe, expect, it } from 'vitest';
import { dominantColor } from './logo-color';

/** RGBA bytes for each colour, repeated `count` times. */
function pixels(...runs: [rgba: number[], count: number][]): Uint8ClampedArray {
	return new Uint8ClampedArray(runs.flatMap(([rgba, count]) => Array(count).fill(rgba).flat()));
}

const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

describe('dominantColor', () => {
	it('takes a logo’s colour over its black background', () => {
		// Like Zenos's icon: a yellow mark on a black square.
		expect(dominantColor(pixels([BLACK, 70], [[250, 200, 20, 255], 30]))).toBe('#fac814');
	});

	it('ignores white and see-through background', () => {
		expect(dominantColor(pixels([WHITE, 50], [CLEAR, 40], [[255, 81, 25, 255], 10]))).toBe(
			'#ff5119'
		);
	});

	it('gives the darker tone of a logo with no colour', () => {
		expect(dominantColor(pixels([WHITE, 50], [[40, 40, 40, 255], 50]))).toBe('#282828');
	});

	it('gives nothing for an empty image', () => {
		expect(dominantColor(pixels([CLEAR, 10]))).toBeNull();
	});
});
