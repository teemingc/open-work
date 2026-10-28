/** The pieces every shared picture is drawn from: its size, Open Collective's colours and text. */
import type { VNode } from '@cf-wasm/satori';
import logoSvg from '#lib/assets/favicon.svg?raw';

export const WIDTH = 1200;
/** The space at either side, which the text and the chart both keep to so their edges line up. */
export const MARGIN = 80;
export const HEIGHT = 630;

/** Open Collective's colours, as in layout.css. */
export const NAVY = '#0c2764';
export const SLATE = '#475569';
export const BORDER = '#e2e8f0';
export const MUTED = '#5d6b80';
/** The dashboard's colour for giving, which rings a project given to every month. */
export const GIVING = '#e0577d';
/** The dashboard's colours for a balance lower and higher than a year before. */
export const DESTRUCTIVE = '#c42a4f';
export const PAID = '#0a7b4d';

/** The mark from the header. */
const LOGO = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

/** A satori element. Every `div` with more than one child needs `display: flex`. */
export function h(
	type: string,
	props: Record<string, unknown> & { style?: Record<string, unknown> },
	children?: VNode['props']['children']
): VNode {
	return { type, props: { ...props, children } };
}

/** The mark and name, as in the header. */
export function wordmark(size: number): VNode {
	return h('div', { style: { display: 'flex', alignItems: 'center', gap: size * 0.4 } }, [
		h('img', { src: LOGO, width: size, height: size }),
		h(
			'div',
			{ style: { fontFamily: 'Besley', fontSize: size, fontWeight: 700, color: NAVY } },
			'Open Work'
		)
	]);
}

/** How far in from each end the chart fades: the past carries on before it, and the forecast grows less sure. */
export const FADE = 2 * MARGIN;

/** Cut to a length, with an ellipsis, so a long name leaves room for the rest of the sentence. */
export function shorten(text: string, length: number): string {
	return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

/**
 * Text in runs, some heavier. Satori cannot set mixed runs inline, so each word is its own box in a
 * wrapping row. A word split between runs, like a figure and the comma after it, stays together, and
 * so do words joined by a non-breaking space.
 */
export function sentence(runs: { text: string; strong?: boolean }[]): VNode {
	// As large as fits in three lines above the chart.
	const length = runs.reduce((sum, { text }) => sum + text.length, 0);
	const fontSize = length <= 64 ? 76 : length <= 84 ? 64 : 56;
	const words: { text: string; strong?: boolean }[][] = [];
	let joined = false;
	for (const { text, strong } of runs) {
		text.split(/( +)/).forEach((part) => {
			if (!part) return;
			if (part.startsWith(' ')) {
				joined = false;
				return;
			}
			if (joined) words.at(-1)?.push({ text: part, strong });
			else words.push([{ text: part, strong }]);
			joined = true;
		});
	}
	return h(
		'div',
		{
			style: {
				display: 'flex',
				flexWrap: 'wrap',
				columnGap: fontSize * 0.25,
				fontSize,
				lineHeight: 1.2,
				color: SLATE
			}
		},
		words.map((parts) =>
			h(
				'div',
				{ style: { display: 'flex' } },
				parts.map(({ text, strong }) =>
					h('span', { style: strong ? { fontWeight: 600, color: NAVY } : {} }, text)
				)
			)
		)
	);
}

export function logoImage(image: string | undefined): VNode[] {
	return image
		? [
				h('img', {
					src: image,
					width: 80,
					height: 80,
					// Logos are not always square, so fit them inside the box as the page does
					style: {
						borderRadius: 16,
						border: `1px solid ${BORDER}`,
						backgroundColor: 'white',
						objectFit: 'contain'
					}
				})
			]
		: [];
}

/** Cut short with an ellipsis, one line unless told otherwise. Satori clamps only a block that hides its overflow. */
export function clamped(text: string, style: Record<string, unknown>, lines = 1): VNode {
	return h(
		'div',
		{ style: { display: 'block', overflow: 'hidden', lineClamp: lines, ...style } },
		text
	);
}
