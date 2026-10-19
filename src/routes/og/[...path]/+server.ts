/**
 * The picture shown when a page is shared: `/og` followed by the page's path, like
 * `/og/collective/svelte`. A collective's shows when it runs out of money; every other page shows its
 * title and what it is for.
 */
import { read } from '$app/server';
import { render } from 'svelte/server';
import { Hourglass, TrendingDown, TrendingUp, type LucideIcon } from '@lucide/svelte';
import { waitUntil } from 'cloudflare:workers';
import { Resvg } from '@cf-wasm/resvg';
import { satori, type Font, type VNode } from '@cf-wasm/satori';
import { formatMoney } from '#lib/format.js';
import { publicGraphql } from '#lib/server/opencollective.js';
import { forecast, monthsBetween } from '../../collective/[handle]/financials';
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
const HEIGHT = 630;

/** Open Collective's colours, as in layout.css. */
const NAVY = '#0c2764';
const SLATE = '#475569';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const PAGE = '#f8fafc';
/** The dashboard's colours for money running down and for growth. */
const DESTRUCTIVE = '#c42a4f';
const PAID = '#0a7b4d';

/** The mark from the header. */
const LOGO = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

/** Each page's title and description, as in its `<svelte:head>`. */
const PAGES: Record<string, { title: string; description: string }> = {
	'': {
		title: 'Open Work',
		description:
			'Look up an open source collective on Open Collective and see its balance, runway and who funds it.'
	},
	collective: {
		title: 'Collective',
		description:
			'Look up an open source collective on Open Collective and see its balance, runway and who funds it.'
	},
	worklog: {
		title: 'Work log',
		description:
			'Log your hours and the pull requests and issues you worked on, and see whether you are on pace for the month.'
	},
	'worklog/setup': {
		title: 'Clients and days off',
		description: 'Set the clients you log hours for and the days you take off.'
	},
	invoices: {
		title: 'Invoices',
		description:
			'Send invoices to Open Collective in a few clicks, and see whether each one is paid.'
	},
	'invoices/new': {
		title: 'New invoice',
		description:
			'Turn a period of logged work into an invoice and submit it to Open Collective as an expense.'
	},
	settings: {
		title: 'Settings',
		description:
			'Connect Open Collective and GitHub, set your billing details and back up your work log.'
	},
	privacy: {
		title: 'Privacy policy',
		description: 'What Open Work stores about you, where it lives and who sees it.'
	}
};

const COLLECTIVE_QUERY = /* GraphQL */ `
	query OgCollective($slug: String!) {
		account(slug: $slug) {
			description
		}
	}
`;

interface CollectiveResult {
	account: {
		description: string | null;
	} | null;
}

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
 * The white sheet on the page's background, with the address along the bottom, and the wordmark
 * beside it unless the body already shows it.
 */
function card(body: VNode[], { signed = true } = {}): VNode {
	return h(
		'div',
		{
			style: {
				display: 'flex',
				width: '100%',
				height: '100%',
				padding: 40,
				backgroundColor: PAGE,
				fontFamily: 'Source Serif 4'
			}
		},
		h(
			'div',
			{
				style: {
					display: 'flex',
					flexDirection: 'column',
					flex: 1,
					overflow: 'hidden',
					backgroundColor: 'white',
					border: `1px solid ${BORDER}`,
					borderRadius: 6
				}
			},
			[
				h('div', { style: { height: 12, backgroundColor: NAVY } }),
				h(
					'div',
					{
						style: {
							display: 'flex',
							flexDirection: 'column',
							flex: 1,
							padding: '44px 72px 40px'
						}
					},
					[
						h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } }, body),
						// A single rule, so the only double one is under a collective's balance.
						h('div', { style: { borderTop: `1.5px solid ${BORDER}` } }),
						h(
							'div',
							{
								style: {
									display: 'flex',
									justifyContent: signed ? 'space-between' : 'flex-end',
									alignItems: 'center',
									paddingTop: 24
								}
							},
							[
								...(signed ? [wordmark(36)] : []),
								h('div', { style: { fontSize: 28, color: MUTED } }, 'openwork.ing')
							]
						)
					]
				)
			]
		)
	);
}

function title(text: string): VNode {
	return h(
		'div',
		{
			style: {
				fontFamily: 'Besley',
				fontSize: 76,
				fontWeight: 700,
				lineHeight: 1.1,
				color: NAVY,
				lineClamp: 2
			}
		},
		text
	);
}

function description(text: string): VNode {
	return h(
		'div',
		{
			style: {
				// Satori clamps only a block that hides its overflow.
				display: 'block',
				overflow: 'hidden',
				flexShrink: 0,
				marginTop: 24,
				fontSize: 36,
				lineHeight: 1.35,
				color: SLATE,
				lineClamp: 3
			}
		},
		text
	);
}

function pageCard(page: { title: string; description: string }): VNode {
	return card([title(page.title), description(page.description)]);
}

/** The home page's title is the name, so the wordmark takes its place rather than repeating. */
function homeCard(): VNode {
	return card([wordmark(76), description(PAGES[''].description)], { signed: false });
}

/** How far the forecast looks back, as on the dashboard by default. */
const BASIS = 6;

const MONTH_YEAR = new Intl.DateTimeFormat('en', {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

/** What the right-hand column says: a label, the figure, and where the figure comes from. */
interface Outlook {
	label: string;
	figure: string;
	note: string;
	/** The dashboard's icon for the trend, tinted red while the money runs down and green while it grows. */
	trend?: { icon: LucideIcon; color: string };
}

/** How long the collective is funded for, as the dashboard forecasts it, or how it is doing if it is not running down. */
function outlook(stats: CollectiveStats): Outlook {
	const now = new Date(stats.fetchedAt);
	const money = (amount: number) =>
		formatMoney(Math.round(amount), stats.currency).replace(/\.00$/, '');
	const balance = stats.months.at(-1)?.balance ?? 0;
	// Approved expenses will be paid soon, so they are taken out first, as on the dashboard.
	const committed = stats.unpaid.filter((e) => e.approved).reduce((sum, e) => sum + e.amount, 0);
	const available = balance - committed;
	const result = forecast({ months: stats.months, basis: BASIS, now, start: available });

	if (result.zeroDate) {
		const months = monthsBetween(now, result.zeroDate);
		const years = Math.floor(months / 12);
		return {
			label: 'Funded for',
			figure:
				months < 1
					? 'under a month'
					: months < 24
						? `${months} month${months === 1 ? '' : 's'}`
						: `${years} years`,
			note: `until around ${MONTH_YEAR.format(result.zeroDate)}`,
			trend: { icon: Hourglass, color: DESTRUCTIVE }
		};
	}
	if (result.basis === 0 || result.avgNet === 0) {
		return {
			label: 'Available',
			figure: money(available),
			note: 'on Open Collective'
		};
	}
	if (result.avgNet < 0) {
		return {
			label: 'Available',
			figure: money(available),
			note: 'and shrinking',
			trend: { icon: TrendingDown, color: DESTRUCTIVE }
		};
	}
	return {
		label: 'Growing by',
		figure: money(result.avgNet),
		note: 'a month on average',
		trend: { icon: TrendingUp, color: PAID }
	};
}

async function collectiveCard(slug: string): Promise<VNode | undefined> {
	const [stats, about, image] = await Promise.all([
		getCollectiveStats(slug).catch(() => undefined),
		publicGraphql<CollectiveResult>({ query: COLLECTIVE_QUERY, variables: { slug } }).catch(
			() => undefined
		),
		logo(slug)
	]);
	if (!stats) return undefined;
	const { label, figure, note, trend } = outlook(stats);
	// The collective's own words, as written.
	const tagline = about?.account?.description;

	return card([
		h(
			'div',
			{
				style: {
					display: 'flex',
					flexDirection: 'column',
					marginTop: 'auto',
					marginBottom: 'auto'
				}
			},
			[
				// The padding evens out the gaps between the ink, about 28px each. Besley's tall
				// ascender leaves room above the figures, and the label sits higher than the logo's
				// edge, so the right column needs less padding above the figure than the left.
				row({
					left: logoImage(image),
					right: [
						h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } }, [
							...(trend ? [iconImage(trend)] : []),
							line(label, SLATE)
						])
					],
					style: { alignItems: 'flex-end', paddingBottom: 16 },
					rightStyle: { paddingBottom: 8 }
				}),
				row({ left: [figureLine(stats.name)], right: [figureLine(figure)] }),
				// The tagline may take two lines; the note beside it keeps to the first.
				row({
					left: tagline ? [line(tagline, SLATE, 2)] : [],
					right: [line(note, MUTED)],
					style: { paddingTop: 12 }
				})
			]
		)
	]);
}

/** The right column: wide enough for "under a month" or a whole-dollar balance in the millions. */
const PANEL = 420;

/**
 * One row of the two columns, the collective on the left and its outlook on the right, so each
 * thing on the left lines up with its partner: the logo with the label, the name with the figure,
 * the tagline with the note. Each pair is the same font and size, so their baselines match.
 */
function row({
	left,
	right,
	style = {},
	rightStyle = {}
}: {
	left: VNode[];
	right: VNode[];
	/** For both cells. */
	style?: Record<string, unknown>;
	/** For the right cell only, over `style`. */
	rightStyle?: Record<string, unknown>;
}): VNode {
	// Only the cells take the padding, so the rule between them runs unbroken from row to row.
	return h('div', { style: { display: 'flex' } }, [
		h('div', { style: { display: 'flex', flex: 1, paddingRight: 48, ...style } }, left),
		h(
			'div',
			{
				style: {
					display: 'flex',
					width: PANEL,
					paddingLeft: 48,
					borderLeft: `1.5px solid ${BORDER}`,
					...style,
					...rightStyle
				}
			},
			right
		)
	]);
}

/**
 * A Lucide icon as an image. Satori cannot draw Svelte components, so the icon is rendered to its
 * SVG markup first, without the comments Svelte leaves for hydration.
 */
function iconImage({ icon, color }: { icon: LucideIcon; color: string }): VNode {
	const svg = render(icon, { props: { size: ICON, color, strokeWidth: 2 } }).body.replace(
		/<!--.*?-->/g,
		''
	);
	return h('img', {
		src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
		width: ICON,
		height: ICON
	});
}

const ICON = 30;

function logoImage(image: string | undefined): VNode[] {
	return image
		? [
				h('img', {
					src: image,
					width: 104,
					height: 104,
					style: { borderRadius: 20, border: `1px solid ${BORDER}` }
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

function figureLine(text: string, color = NAVY): VNode {
	return clamped(text, {
		fontFamily: 'Besley',
		fontSize: 56,
		fontWeight: 700,
		lineHeight: 1.15,
		color
	});
}

function line(text: string, color: string, lines = 1): VNode {
	return clamped(text, { fontSize: 30, lineHeight: 1.35, color }, lines);
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
	const element = collective ?? (page && path ? pageCard(page) : homeCard());

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
