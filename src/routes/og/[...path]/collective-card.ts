/** The picture of a collective, which says how long it is funded for, or of a fund, what it has given. */
import type { VNode } from '@cf-wasm/satori';
import { formatMoney } from '#lib/format.js';
import {
	forecast,
	forecastDates,
	monthEnd,
	monthsBetween,
	unpaidTotals,
	type Forecast
} from '#lib/financials.js';
import { givingYear, toRecipients, type Recipient } from '#lib/grants.js';
import type { CollectiveStats } from '#lib/collective-stats.remote.js';
import {
	BORDER,
	DESTRUCTIVE,
	FADE,
	GIVING,
	h,
	logoImage,
	MARGIN,
	MUTED,
	NAVY,
	PAID,
	sentence,
	shorten,
	WIDTH
} from './draw';

/** The logo as a data URL, or nothing when Open Collective has none or is slow. */
export async function logo(slug: string): Promise<string | undefined> {
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
	// Approved expenses are taken out first, as on the dashboard.
	const available = balance - unpaidTotals(stats.unpaid).committed;
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

export function collectiveCard(stats: CollectiveStats, image: string | undefined): VNode {
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

/** A project the fund gave to, with its logo as a data URL if Open Collective has one. */
type Given = Recipient & { image: string | undefined };

/**
 * The most a fund's card shows along the bottom, more than fit so the row runs off both ends.
 * Each logo is fetched while the card is drawn, so this also bounds the wait.
 */
const MOST_GIVEN = 16;
/** The largest and smallest logo along a fund's card, across. */
const LARGEST = 112;
const SMALLEST = 56;
/** The space between logos, and below them. */
const LOGO_GAP = 14;

/** The projects a fund gave most to, each with its logo, to draw along its card. */
export async function given(stats: CollectiveStats): Promise<Given[]> {
	const recipients = toRecipients({
		grants: stats.grants,
		commitments: stats.commitments,
		currency: stats.currency,
		year: givingYear({ grants: stats.grants, now: new Date(stats.fetchedAt) })
	}).slice(0, MOST_GIVEN);
	const images = await Promise.all(recipients.map((r) => logo(r.slug)));
	return recipients.map((r, i) => ({ ...r, image: images[i] }));
}

/**
 * The card of a fund, which passes its money on, so how long it is funded for says nothing of it.
 * It says what the fund has given and to how many, over the logos of those it gave most to.
 */
export function fundCard(
	stats: CollectiveStats,
	image: string | undefined,
	recipients: Given[]
): VNode {
	const granted = stats.grants.reduce((sum, grant) => sum + grant.amount, 0);
	const count = new Set(stats.grants.map((grant) => grant.slug)).size;
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
				padding: `36px ${MARGIN}px ${BAND + GAP}px`,
				backgroundColor: 'white',
				fontFamily: 'Source Serif 4'
			}
		},
		[
			...givenRow(recipients),
			...logoImage(image),
			sentence([
				{ text: shorten(stats.name, 40), strong: true },
				{ text: ' has contributed ' },
				{
					text: formatMoney(Math.round(granted), stats.currency)
						.replace(/\.00$/, '')
						.replaceAll(' ', '\u00a0'),
					strong: true
				},
				{ text: ' to ' },
				{ text: `${count}\u00a0project${count === 1 ? '' : 's'}`, strong: true },
				{ text: '.' }
			])
		]
	);
}

/**
 * The logos of those a fund gave most to, in a row along the bottom where a collective's chart
 * goes: each sized by what it was given, as on the dashboard, in the order the fund first gave to
 * them, and ringed when it still gives every month. A row too long for the card runs off both ends
 * and fades there, as the chart does.
 */
function givenRow(recipients: Given[]): VNode[] {
	if (!recipients.length) return [];
	const most = recipients[0].total;
	// By area, so a project given four times as much looks four times as big, not sixteen.
	const sized = recipients
		.map((r) => ({ ...r, size: Math.max(SMALLEST, Math.sqrt(r.total / most) * LARGEST) }))
		.sort((a, b) => a.first.localeCompare(b.first));
	const length = sized.reduce((sum, r) => sum + r.size, 0) + LOGO_GAP * (sized.length - 1);
	// A short row lines up with the text; a long one sits in the middle and runs off both ends.
	let x = length <= WIDTH - 2 * MARGIN ? MARGIN : (WIDTH - length) / 2;
	return sized.map((r) => {
		const left = x;
		x += r.size + LOGO_GAP;
		const middle = left + r.size / 2;
		const ring = r.monthly > 0;
		return h(
			'div',
			{
				style: {
					position: 'absolute',
					left,
					bottom: LOGO_GAP * 2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: r.size,
					height: r.size,
					borderRadius: '50%',
					// The ring sits inside the disc, so a ringed logo takes no more room than the rest.
					border: ring ? `3px solid ${GIVING}` : `2px solid ${BORDER}`,
					padding: ring ? 3 : 0,
					backgroundColor: 'white',
					opacity: Math.min(1, Math.max(0, Math.min(middle, WIDTH - middle) / FADE))
				}
			},
			[
				r.image
					? h('img', {
							src: r.image,
							width: r.size - (ring ? 12 : 4),
							height: r.size - (ring ? 12 : 4),
							style: { borderRadius: '50%', objectFit: 'cover' }
						})
					: h(
							'div',
							{ style: { fontSize: r.size * 0.45, fontWeight: 600, color: MUTED } },
							r.name.slice(0, 1).toUpperCase()
						)
			]
		);
	});
}

/** How many months of history the chart shows and how far ahead, as on the dashboard by default. */
const HISTORY = 24;
const AHEAD = 24;

/** The height of the chart's band along the bottom, below the sentence. */
const BAND = 160;
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
