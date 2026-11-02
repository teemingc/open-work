const hex = (rgb: number[]) =>
	`#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/**
 * The colour a logo is mostly drawn in, from its pixels as RGBA bytes. Vivid pixels count first,
 * grouped by hue so a logo's one colour wins over its outline or shading; a logo with none, drawn in
 * black or grey, gives its darker tone. White and see-through pixels are background, not the logo.
 */
export function dominantColor(pixels: Uint8ClampedArray): string | null {
	const hues = new Map<number, { sum: number[]; count: number }>();
	const plain = { sum: [0, 0, 0], count: 0 };
	let opaque = 0;
	for (let i = 0; i < pixels.length; i += 4) {
		if (pixels[i + 3] < 128) continue;
		opaque++;
		const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
		const max = Math.max(...rgb) / 255;
		const min = Math.min(...rgb) / 255;
		const lightness = (max + min) / 2;
		if (lightness > 0.9) continue;
		const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
		let group = plain;
		if (saturation >= 0.3 && lightness >= 0.15 && lightness <= 0.85) {
			const key = Math.floor(hue(rgb) / 30);
			group = hues.get(key) ?? { sum: [0, 0, 0], count: 0 };
			hues.set(key, group);
		}
		group.count++;
		rgb.forEach((c, index) => (group.sum[index] += c));
	}
	const vivid = [...hues.values()].sort((a, b) => b.count - a.count)[0];
	// A few vivid pixels are a logo's shading, not its colour.
	const chosen = vivid && vivid.count >= opaque * 0.05 ? vivid : plain;
	return chosen.count > 0 ? hex(chosen.sum.map((c) => c / chosen.count)) : null;
}

/** The hue of an RGB colour, in degrees. */
function hue([r, g, b]: number[]): number {
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	if (delta === 0) return 0;
	const degrees =
		max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
	return (degrees * 60 + 360) % 360;
}

/** The colour the logo at `src`, a `data:` image, is mostly drawn in. */
export async function logoColor(src: string): Promise<string | null> {
	const image = new Image();
	image.src = src;
	await image.decode();
	const size = 48;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;
	context.drawImage(image, 0, 0, size, size);
	return dominantColor(context.getImageData(0, 0, size, size).data);
}
