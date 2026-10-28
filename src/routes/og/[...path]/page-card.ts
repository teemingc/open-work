/** The picture of a page other than a collective's: its title and what it is for, over a motif. */
import type { VNode } from '@cf-wasm/satori';
import {
	BORDER,
	clamped,
	FADE,
	h,
	MARGIN,
	MUTED,
	NAVY,
	PAID,
	SLATE,
	WIDTH,
	wordmark
} from './draw';

/** Each page's title and description, as in its `<svelte:head>`. */
export const PAGES: Record<string, { title: string; description: string; motif: Motif }> = {
	collective: {
		title: 'Collective',
		description:
			'Look up a collective on Open Collective and see its balance, runway and who funds it.',
		motif: 'balance'
	},
	worklog: {
		title: 'Work log',
		description: 'Log your hours and keep track of your pace for the month.',
		motif: 'hours'
	},
	'worklog/setup': {
		title: 'Clients and days off',
		description: 'Set the clients you log hours for and the days you’ve taken off.',
		motif: 'hours'
	},
	invoices: {
		title: 'Invoices',
		description: 'Send invoices to Open Collective in a few clicks, and keep track of each one.',
		motif: 'invoices'
	},
	'invoices/new': {
		title: 'New invoice',
		description: 'Send an invoice to Open Collective along with your work log.',
		motif: 'invoices'
	},
	settings: {
		title: 'Settings',
		description: 'Connect to Open Collective to start sending invoices.',
		motif: 'tiles'
	},
	privacy: {
		title: 'Privacy policy',
		description: 'What Open Work stores about you, where it lives and who sees it.',
		motif: 'tiles'
	}
};

/** The picture along the bottom of a page's card, drawn from what the page is for. */
type Motif = 'balance' | 'hours' | 'invoices' | 'tiles';

/**
 * The whole picture, edge to edge, so it fills the preview in a chat. Who it is about sits at the
 * top, what it says below it, and a picture of what the page is for along the bottom. Chats print the page's title and address under the picture,
 * so neither is repeated here.
 */
function canvas({ top, bottom, motif }: { top?: VNode; bottom: VNode[]; motif: Motif }): VNode {
	return h(
		'div',
		{
			style: {
				display: 'flex',
				flexDirection: 'column',
				// With nothing at the top, what is left sits in the middle rather than leaving the top bare.
				justifyContent: top ? 'space-between' : 'center',
				width: '100%',
				height: '100%',
				padding: `64px ${MARGIN}px ${PAGE_BAND + 40}px`,
				backgroundColor: 'white',
				fontFamily: 'Source Serif 4'
			}
		},
		[
			band(MOTIFS[motif]()),
			...(top ? [top] : []),
			h('div', { style: { display: 'flex', flexDirection: 'column' } }, bottom)
		]
	);
}

/** Text is at least this size, so it can still be read when a chat shows the picture a quarter as wide. */
const TEXT = 44;

function title(text: string): VNode {
	return clamped(
		text,
		{
			fontFamily: 'Besley',
			fontSize: 96,
			fontWeight: 700,
			lineHeight: 1.1,
			// The clamp hides what falls outside the box, which would cut off descenders like the g in
			// "Work log".
			paddingBottom: 24,
			color: NAVY
		},
		2
	);
}

function description(text: string): VNode {
	return clamped(text, { marginTop: 20, fontSize: TEXT, lineHeight: 1.3, color: SLATE }, 2);
}

export function pageCard(page: (typeof PAGES)[string]): VNode {
	return canvas({
		top: wordmark(44),
		bottom: [title(page.title), description(page.description)],
		motif: page.motif
	});
}

/** The home page is the collective lookup under the name, so the wordmark takes the title's place. */
export function homeCard(): VNode {
	return canvas({
		bottom: [wordmark(96), description(PAGES.collective.description)],
		motif: PAGES.collective.motif
	});
}

/** The height of the band along the bottom of a page's card, a little shorter than a collective's. */
const PAGE_BAND = 132;

/** The logo's four shades, darkest first. */
const TINTS = [NAVY, '#334d8a', '#6b7fae', '#a9b5d1'];
/** The dashboard's colour for a submitted invoice. */
const SUBMITTED = '#1153d6';

/** The same made-up figures every time, so the picture does not change between renders. */
function seeded(seed: number): () => number {
	return () => {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		return seed / 2147483648;
	};
}

/** A motif drawn edge to edge in the band along the bottom, fading out at both ends like a collective's chart. */
function band(inner: string): VNode {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${PAGE_BAND}" viewBox="0 0 ${WIDTH} ${PAGE_BAND}">
		<defs>
			<pattern id="hatch" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
				<line x1="0" y1="0" x2="0" y2="20" stroke="${MUTED}" stroke-opacity="0.3" stroke-width="2.5"/>
			</pattern>
			<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="white" stop-opacity="0"/>
				<stop offset="${(FADE / WIDTH).toFixed(3)}" stop-color="white"/>
				<stop offset="${(1 - FADE / WIDTH).toFixed(3)}" stop-color="white"/>
				<stop offset="1" stop-color="white" stop-opacity="0"/>
			</linearGradient>
			<mask id="ends" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${PAGE_BAND}">
				<rect x="0" y="0" width="${WIDTH}" height="${PAGE_BAND}" fill="url(#fade)"/>
			</mask>
		</defs>
		<g mask="url(#ends)">${inner}</g>
	</svg>`;
	return h('img', {
		src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
		width: WIDTH,
		height: PAGE_BAND,
		style: { position: 'absolute', bottom: 0, left: 0 }
	});
}

const MOTIFS: Record<Motif, () => string> = {
	/** A collective's balance and its forecast, as the dashboard draws them. */
	balance() {
		const random = seeded(7);
		const points: [number, number][] = [];
		let balance = 0.3;
		for (let i = 0; i <= 30; i++) {
			balance = Math.min(0.95, Math.max(0.1, balance + (random() - 0.4) * 0.3));
			points.push([(i / 30) * WIDTH, PAGE_BAND - 12 - balance * (PAGE_BAND - 24)]);
		}
		const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
		const today = points[20][0];
		return `<rect x="${today}" y="0" width="${WIDTH - today}" height="${PAGE_BAND}" fill="url(#hatch)"/>
			<path d="${line.join(' ')} L${WIDTH} ${PAGE_BAND} L0 ${PAGE_BAND} Z" fill="${TINTS[3]}" fill-opacity="0.25"/>
			<path d="${line.join(' ')}" fill="none" stroke="${NAVY}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
			<line x1="${today}" y1="0" x2="${today}" y2="${PAGE_BAND}" stroke="${MUTED}" stroke-opacity="0.6" stroke-width="3" stroke-dasharray="5 7.5"/>`;
	},
	/** A month of logged days, one of the logo's squares for every two hours, shaded by client. Weekends are left open. */
	hours() {
		const random = seeded(3);
		const days = 31;
		const pitch = WIDTH / days;
		const size = pitch - 8;
		let out = '';
		for (let day = 0; day < days; day++) {
			const x = day * pitch + 4;
			if (day % 7 >= 5) {
				out += `<rect x="${x}" y="${PAGE_BAND - size}" width="${size}" height="${size}" rx="5" fill="none" stroke="${BORDER}" stroke-width="2"/>`;
				continue;
			}
			const blocks = 1 + Math.floor(random() * 3);
			const client = Math.floor(random() * 3);
			for (let block = 0; block < blocks; block++) {
				const y = PAGE_BAND - (block + 1) * (size + 6) + 6;
				const tint = TINTS[(client + (block === blocks - 1 ? 1 : 0)) % TINTS.length];
				out += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="5" fill="${tint}"/>`;
			}
		}
		return out;
	},
	/** A slip for each month's invoice, its stripe the colour of where it is: paid, then submitted, then a draft. */
	invoices() {
		const random = seeded(11);
		const width = 150;
		const gap = 30;
		const count = Math.ceil(WIDTH / (width + gap));
		let out = '';
		for (let i = 0; i < count; i++) {
			const x = i * (width + gap) + 12;
			const status = i < count - 2 ? PAID : i === count - 2 ? SUBMITTED : MUTED;
			const y = 20;
			out += `<rect x="${x}" y="${y}" width="${width}" height="${PAGE_BAND}" rx="8" fill="white" stroke="${BORDER}" stroke-width="2"/>
				<rect x="${x}" y="${y}" width="${width}" height="10" rx="4" fill="${status}"/>
				<rect x="${x + 18}" y="${y + 30}" width="${60 + random() * 40}" height="10" rx="5" fill="${TINTS[2]}"/>`;
			for (let row = 0; row < 3; row++) {
				const rowY = y + 56 + row * 18;
				out += `<rect x="${x + 18}" y="${rowY}" width="${50 + random() * 30}" height="6" rx="3" fill="${BORDER}"/>
					<rect x="${x + width - 48}" y="${rowY}" width="30" height="6" rx="3" fill="${TINTS[3]}"/>`;
			}
		}
		return out;
	},
	/** The logo's squares, set out in a row and growing lighter towards the bottom. */
	tiles() {
		const size = 36;
		const pitch = size + 8;
		const columns = Math.ceil(WIDTH / pitch);
		const rows = Math.floor(PAGE_BAND / pitch);
		let out = '';
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const tint = TINTS[(row + column) % 2 ? 3 : 2 + ((column >> 2) % 2)];
				out += `<rect x="${column * pitch + 4}" y="${PAGE_BAND - (rows - row) * pitch + 8}" width="${size}" height="${size}" rx="6" fill="${tint}" fill-opacity="${(0.25 + row * 0.2).toFixed(2)}"/>`;
			}
		}
		return out;
	}
};
