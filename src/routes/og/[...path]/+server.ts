/**
 * The picture shown when a page is shared: `/og` followed by the page's path, like
 * `/og/collective/svelte`. A collective's says in a sentence how long it is funded for; every other
 * page shows its title and what it is for.
 */
import { read } from '$app/server';
import { waitUntil } from 'cloudflare:workers';
import { Resvg } from '@cf-wasm/resvg';
import { satori, type Font, type VNode } from '@cf-wasm/satori';
import { formatMoney } from '#lib/format.js';
import {
	forecast,
	forecastDates,
	monthEnd,
	monthsBetween,
	type Forecast
} from '../../collective/[handle]/financials';
import { getCollectiveStats, type CollectiveStats } from '../../collective/[handle]/stats.remote';
import logoSvg from '#lib/assets/favicon.svg?raw';
import type { RequestHandler } from './$types';
import besleyLatin from './fonts/besley-700-latin.ttf?url';
import besleyLatinExt from './fonts/besley-700-latin-ext.ttf?url';
import serifLatin from './fonts/source-serif-4-400-latin.ttf?url';
import serifLatinExt from './fonts/source-serif-4-400-latin-ext.ttf?url';
import serifBoldLatin from './fonts/source-serif-4-600-latin.ttf?url';
import serifBoldLatinExt from './fonts/source-serif-4-600-latin-ext.ttf?url';

const WIDTH = 1200;
/** The space at either side, which the text and the chart both keep to so their edges line up. */
const MARGIN = 80;
const HEIGHT = 630;

/** Open Collective's colours, as in layout.css. */
const NAVY = '#0c2764';
const SLATE = '#475569';
const BORDER = '#e2e8f0';
const MUTED = '#5d6b80';
/** The dashboard's colours for a balance lower and higher than a year before. */
const DESTRUCTIVE = '#c42a4f';
const PAID = '#0a7b4d';

/** The mark from the header. */
const LOGO = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

/** Each page's title and description, as in its `<svelte:head>`. */
const PAGES: Record<string, { title: string; description: string; motif: Motif }> = {
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

/** A satori element. Every `div` with more than one child needs `display: flex`. */
function h(
	type: string,
	props: Record<string, unknown> & { style?: Record<string, unknown> },
	children?: VNode['props']['children']
): VNode {
	return { type, props: { ...props, children } };
}

let fonts: Promise<Font[]> | undefined;

function loadFonts(): Promise<Font[]> {
	const load = async (name: string, weight: Font['weight'], url: string): Promise<Font> => ({
		name,
		weight,
		style: 'normal',
		data: await read(url).arrayBuffer()
	});
	fonts ??= Promise.all([
		load('Besley', 700, besleyLatin),
		load('Besley', 700, besleyLatinExt),
		load('Source Serif 4', 400, serifLatin),
		load('Source Serif 4', 400, serifLatinExt),
		load('Source Serif 4', 600, serifBoldLatin),
		load('Source Serif 4', 600, serifBoldLatinExt)
	]).catch((error) => {
		// Tried again on the next picture.
		fonts = undefined;
		throw error;
	});
	return fonts;
}

/** The logo as a data URL, or nothing when Open Collective has none or is slow. */
async function logo(slug: string): Promise<string | undefined> {
	try {
		const response = await fetch(`https://images.opencollective.com/${slug}/logo/256.png`, {
			signal: AbortSignal.timeout(3000)
		});
		if (!response.ok || response.headers.get('content-type') !== 'image/png') return undefined;
		const bytes = Buffer.from(await response.arrayBuffer());
		return `data:image/png;base64,${bytes.toString('base64')}`;
	} catch {
		return undefined;
	}
}

/** The mark and name, as in the header. */
function wordmark(size: number): VNode {
	return h('div', { style: { display: 'flex', alignItems: 'center', gap: size * 0.4 } }, [
		h('img', { src: LOGO, width: size, height: size }),
		h(
			'div',
			{ style: { fontFamily: 'Besley', fontSize: size, fontWeight: 700, color: NAVY } },
			'Open Work'
		)
	]);
}

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

function pageCard(page: (typeof PAGES)[string]): VNode {
	return canvas({
		top: wordmark(44),
		bottom: [title(page.title), description(page.description)],
		motif: page.motif
	});
}

/** The home page is the collective lookup under the name, so the wordmark takes the title's place. */
function homeCard(): VNode {
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

/** How far the forecast looks back, as on the dashboard by default. */
const BASIS = 6;

/** A sentence about the collective, in three parts around the figure, which is set heavier. */
interface Outlook {
	before: string;
	figure: string;
	after: string;
}

/** Where the balance is heading from the money available now, as the dashboard forecasts it. */
interface Projection {
	now: Date;
	available: number;
	result: Forecast;
}

function project(stats: CollectiveStats): Projection {
	const now = new Date(stats.fetchedAt);
	const balance = stats.months.at(-1)?.balance ?? 0;
	// Approved expenses will be paid soon, so they are taken out first, as on the dashboard.
	const committed = stats.unpaid.filter((e) => e.approved).reduce((sum, e) => sum + e.amount, 0);
	const available = balance - committed;
	return {
		now,
		available,
		result: forecast({ months: stats.months, basis: BASIS, now, start: available })
	};
}

/** How long the collective is funded for, or how it is doing if it is not running down. */
function outlook(stats: CollectiveStats, { now, available, result }: Projection): Outlook {
	const money = (amount: number) =>
		formatMoney(Math.round(amount), stats.currency).replace(/\.00$/, '');

	if (result.zeroDate) {
		const months = monthsBetween(now, result.zeroDate);
		const years = Math.floor(months / 12);
		// Said as how long it is funded for rather than when the money runs out: the picture invites
		// sponsors, and should not read as the project failing.
		if (months < 1)
			return { before: 'is funded for', figure: 'the rest of this month', after: '.' };
		return {
			before: 'is funded for the next',
			figure: months < 24 ? `${months} month${months === 1 ? '' : 's'}` : `${years} years`,
			after: '.'
		};
	}
	if (result.basis === 0 || result.avgNet <= 0) {
		return { before: 'has', figure: money(available), after: ' available.' };
	}
	return {
		before: 'is growing by',
		figure: money(result.avgNet),
		after: ' a\u00a0month on\u00a0average.'
	};
}

async function collectiveCard(slug: string): Promise<VNode | undefined> {
	const [stats, image] = await Promise.all([
		getCollectiveStats(slug).catch(() => undefined),
		logo(slug)
	]);
	if (!stats) return undefined;
	const projection = project(stats);
	const { before, figure, after } = outlook(stats, projection);

	// One sentence, read in a glance: who, then how they are doing, with the logo just above it. The
	// two sit in the middle of the space above the balance's band along the bottom.
	return h(
		'div',
		{
			style: {
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				gap: 24,
				width: '100%',
				height: '100%',
				// Clear of the chart by `GAP` even when the sentence takes three lines.
				padding: `36px ${MARGIN}px ${BAND + GAP}px`,
				backgroundColor: 'white',
				fontFamily: 'Source Serif 4'
			}
		},
		[
			...chart(stats, projection),
			...logoImage(image),
			sentence([
				{ text: shorten(stats.name, 40), strong: true },
				{ text: ` ${before} ` },
				// The figure is one thing to read, so it never breaks across lines.
				{ text: figure.replaceAll(' ', '\u00a0'), strong: true },
				{ text: after }
			])
		]
	);
}

/** How many months of history the chart shows and how far ahead, as on the dashboard by default. */
const HISTORY = 24;
const AHEAD = 24;

/** The height of the chart's band along the bottom, below the sentence. */
const BAND = 160;
/** How far in from each end the chart fades: the past carries on before it, and the forecast grows less sure. */
const FADE = 2 * MARGIN;
/** The least room between the sentence and the chart, so neither crowds the other. */
const GAP = 56;

/**
 * The dashboard's balance chart, drawn edge to edge in a band along the bottom without its axes:
 * the balance and its forecast as one line, the balance a year before dashed behind it, green
 * between the two where the collective has more than it did and red where it has less, the
 * forecast hatched. It leaves out the page's red mark where the money runs out, so the picture
 * does not alarm, and both ends fade instead. Lines are thicker than on the page, as a chat shows
 * the picture about a quarter as wide.
 */
function chart(stats: CollectiveStats, { now, available, result }: Projection): VNode[] {
	const history = stats.months
		.slice(-HISTORY)
		.map((m) => ({ date: m.partial ? now : monthEnd(m.key), balance: m.balance }));
	if (history.length < 2) return [];
	// The full span ahead, as on the dashboard, but ending where the money runs out within it.
	const horizon = forecastDates({ now, horizon: AHEAD }).at(-1) ?? now;
	const ahead = result.points.filter((p) => p.date <= horizon);
	const projection = [{ date: now, balance: available }, ...ahead.slice(1)];
	const end = result.zeroDate && result.zeroDate < horizon ? result.zeroDate : horizon;

	const key = (date: Date) => date.toISOString().slice(0, 7);
	const byMonth = new Map([
		...projection.map((p) => [key(p.date), p.balance] as const),
		...stats.months.map((m) => [m.key, m.balance] as const)
	]);
	const trend = [...history, ...projection].map((p) => {
		const [year, month] = key(p.date).split('-');
		return { ...p, yearBefore: byMonth.get(`${Number(year) - 1}-${month}`) };
	});
	const compared = trend.filter(
		(p): p is typeof p & { yearBefore: number } => p.yearBefore !== undefined
	);
	const top = Math.max(...trend.map((p) => Math.max(p.balance, p.yearBefore ?? 0)));
	if (top <= 0) return [];

	const start = history[0].date.getTime();
	// The chart runs to both edges of the picture and is half faded at the margins, so it lines up
	// with the text.
	const x = (date: Date) => ((date.getTime() - start) / (end.getTime() - start)) * WIDTH;
	// Room above the tallest point for the line, and below zero for the mark where it runs out.
	const y = (balance: number) => BAND - 14 - (Math.max(balance, 0) / top) * (BAND - 24);
	const path = (points: { date: Date; balance: number }[]) =>
		points
			.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.balance).toFixed(1)}`)
			.join(' ');
	const line = path(trend);
	const yearBefore = path(compared.map((p) => ({ date: p.date, balance: p.yearBefore })));
	const between = `${yearBefore} ${path([...compared].reverse()).replace('M', 'L')} Z`;
	const first = x(trend[0].date).toFixed(1);
	const last = x(end).toFixed(1);
	const today = x(now).toFixed(1);

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${BAND}" viewBox="0 0 ${WIDTH} ${BAND}">
		<defs>
			<pattern id="hatch" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
				<line x1="0" y1="0" x2="0" y2="20" stroke="${MUTED}" stroke-opacity="0.3" stroke-width="2.5"/>
			</pattern>
			<clipPath id="above"><path d="${line} L${last} 0 L${first} 0 Z"/></clipPath>
			<clipPath id="below"><path d="${line} L${last} ${BAND} L${first} ${BAND} Z"/></clipPath>
			<linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="${first}" y1="0" x2="${last}" y2="0">
				<stop offset="0" stop-color="white" stop-opacity="0"/>
				<stop offset="${(FADE / (Number(last) - Number(first))).toFixed(3)}" stop-color="white"/>
				<stop offset="${(1 - FADE / (Number(last) - Number(first))).toFixed(3)}" stop-color="white"/>
				<stop offset="1" stop-color="white" stop-opacity="0"/>
			</linearGradient>
			<mask id="ends" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${BAND}">
				<rect x="0" y="0" width="${WIDTH}" height="${BAND}" fill="url(#fade)"/>
			</mask>
		</defs>
		<g mask="url(#ends)">
		<rect x="${today}" y="0" width="${Number(last) - Number(today)}" height="${BAND}" fill="url(#hatch)"/>
		<path d="${between}" fill="${DESTRUCTIVE}" fill-opacity="0.22" clip-path="url(#above)"/>
		<path d="${between}" fill="${PAID}" fill-opacity="0.22" clip-path="url(#below)"/>
		<path d="${yearBefore}" fill="none" stroke="${MUTED}" stroke-width="3" stroke-dasharray="5 7.5"/>
		<path d="${line}" fill="none" stroke="${NAVY}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
		</g>
		<line x1="${today}" y1="0" x2="${today}" y2="${BAND}" stroke="${MUTED}" stroke-opacity="0.6" stroke-width="3" stroke-dasharray="5 7.5"/>
	</svg>`;
	return [
		h('img', {
			src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
			width: WIDTH,
			height: BAND,
			style: { position: 'absolute', bottom: 0, left: 0 }
		})
	];
}

/** Cut to a length, with an ellipsis, so a long name leaves room for the rest of the sentence. */
function shorten(text: string, length: number): string {
	return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

/**
 * Text in runs, some heavier. Satori cannot set mixed runs inline, so each word is its own box in a
 * wrapping row. A word split between runs, like a figure and the comma after it, stays together, and
 * so do words joined by a non-breaking space.
 */
function sentence(runs: { text: string; strong?: boolean }[]): VNode {
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

function logoImage(image: string | undefined): VNode[] {
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
function clamped(text: string, style: Record<string, unknown>, lines = 1): VNode {
	return h(
		'div',
		{ style: { display: 'block', overflow: 'hidden', lineClamp: lines, ...style } },
		text
	);
}

export const GET: RequestHandler = async ({ params, url }) => {
	const path = params.path.replace(/\/+$/, '').toLowerCase();
	// Cloudflare's shared cache, missing outside a Worker.
	const cache =
		typeof caches === 'undefined' ? undefined : (caches as unknown as { default?: Cache }).default;
	const key = new Request(url);
	const cached = await cache?.match(key);
	if (cached) return cached;

	const slug = /^collective\/([a-z0-9][a-z0-9-]{0,99})$/.exec(path)?.[1];
	// An unknown collective, or one Open Collective could not tell us about, gets the plain card.
	const collective = slug ? await collectiveCard(slug) : undefined;
	const page = PAGES[path];
	const element = collective ?? (page ? pageCard(page) : homeCard());

	const svg = await satori(element, { width: WIDTH, height: HEIGHT, fonts: await loadFonts() });
	const png = (await Resvg.async(svg)).render().asPng();

	// A collective's balance changes, and a plain card in its place may only mean Open Collective
	// was busy. The other pages only change with a deploy.
	const maxAge = collective ? 60 * 60 : slug ? 5 * 60 : 24 * 60 * 60;
	const response = new Response(png as Uint8Array<ArrayBuffer>, {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${maxAge}` }
	});
	if (cache) waitUntil(cache.put(key, response.clone()));
	return response;
};
