/**
 * The companies and people that contribute to open source projects on Open Collective, found
 * from the larger contributions through the main open source hosts, and ranked by what they
 * contributed in the past year or in all, with their place in each of the past few calendar years.
 */

/**
 * The hosts scanned for contributors. Open Collective cannot list the accounts that contribute to
 * others, nor sort accounts by what they have contributed, but it can list a host's transactions.
 */
export const HOSTS = ['opensource', 'europe', 'numfocus'];

/** The smallest contribution scanned for, in US dollars, to keep the scan to a few requests. */
export const MIN_CONTRIBUTION = 1000;

/** How many transactions one scan request lists, the most Open Collective allows. */
export const SCAN_PAGE = 1000;

/** How many contributors are ranked: those that gave the most in the contributions scanned. */
export const LIMIT = 15;

/**
 * Accounts of the kinds that hold money for projects, which contribute what others gave them. Funds
 * stay in: a company's fund contributes the company's own money.
 */
const PASS_ON_TYPES = new Set(['COLLECTIVE', 'PROJECT', 'EVENT', 'VENDOR']);

/** Platforms that pay out what their own donors gave, so would count it twice. */
const PASS_ON_SLUGS = new Set(['thanks-dev']);

/** One contribution of `MIN_CONTRIBUTION` or more to a project the host holds money for. */
export interface ScanNode {
	amount: { value: number };
	fromAccount: { slug: string; name: string | null; type: string; isIncognito: boolean } | null;
}

/** A page of a host's contributions of `MIN_CONTRIBUTION` or more since `$since`. */
export const SCAN_QUERY = /* GraphQL */ `
	query ContributorsScan(
		$host: AccountReferenceInput!
		$since: DateTime!
		$offset: Int!
		$min: Int!
		$limit: Int!
	) {
		transactions(
			host: $host
			kind: [CONTRIBUTION]
			type: CREDIT
			amount: { gte: { valueInCents: $min, currency: USD } }
			dateFrom: $since
			limit: $limit
			offset: $offset
		) {
			totalCount
			nodes {
				amount {
					value
				}
				fromAccount {
					slug
					name
					type
					isIncognito
				}
			}
		}
	}
`;

/**
 * The slugs of those that gave the most in the contributions scanned, up to `LIMIT`. Leaves out
 * accounts that pass on what others gave, and contributors who chose not to be named. Amounts are
 * added whatever their currency, which is near enough for choosing whom to rank: the ranking itself
 * is in US dollars.
 */
export function toCandidates(nodes: ScanNode[]): string[] {
	const given = new Map<string, number>();
	for (const { amount, fromAccount: from } of nodes) {
		if (!from || from.isIncognito || PASS_ON_TYPES.has(from.type) || PASS_ON_SLUGS.has(from.slug))
			continue;
		// Guest contributors who gave no name.
		if (!from.name || from.name === 'Guest') continue;
		given.set(from.slug, (given.get(from.slug) ?? 0) + amount.value);
	}
	return [...given]
		.sort(([, a], [, b]) => b - a)
		.slice(0, LIMIT)
		.map(([slug]) => slug);
}

/**
 * How many accounts one query asks about. Open Collective refuses a query with more than 100
 * aliases, and each account takes four: its own and three for its sums.
 */
export const BATCH_SIZE = 20;

/**
 * How many calendar years are ranked, this one included. Further back, few of those ranked had
 * contributed anything, so places there say little.
 */
export const YEARS_RANKED = 6;

/** The first calendar year ranked, given the last. */
const firstYear = (lastYear: number) => lastYear - YEARS_RANKED + 1;

/** One contributor's contributions in US dollars, as Open Collective's account stats report them. */
export interface ContributorNode {
	slug: string;
	name: string | null;
	type: string;
	imageUrl: string | null;
	/** Each negative, as money spent, or zero. */
	stats: {
		recent: { value: number };
		previous: { value: number };
		total: { value: number };
		/**
		 * One node per calendar year with contributions, the latest first. Unlike the sums above,
		 * these amounts are positive.
		 */
		totalAmountSpentTimeSeries: { nodes: { date: string; amount: { value: number } }[] };
	};
}

/**
 * The query for a batch of accounts, each under its own alias, with `$yearAgo` and `$twoYearsAgo`
 * bounding the two years compared and `$firstYear` starting the yearly sums. Each sum is in US
 * dollars, so contributors in other currencies rank alongside. Slugs are written into the query,
 * as JSON strings.
 */
export function contributorsQuery(slugs: string[]): string {
	const accounts = slugs
		.map(
			(slug, i) =>
				`a${i}: account(slug: ${JSON.stringify(slug)}, throwIfMissing: false) { ...Contributor }`
		)
		.join('\n');
	return /* GraphQL */ `
		query Contributors($yearAgo: DateTime!, $twoYearsAgo: DateTime!, $firstYear: DateTime!) {
			${accounts}
		}
		fragment Contributor on Account {
			slug
			name
			type
			imageUrl(height: 64)
			stats {
				recent: totalAmountSpent(dateFrom: $yearAgo, kind: [CONTRIBUTION], currency: USD) { value }
				previous: totalAmountSpent(dateFrom: $twoYearsAgo, dateTo: $yearAgo, kind: [CONTRIBUTION], currency: USD) { value }
				total: totalAmountSpent(kind: [CONTRIBUTION], currency: USD) { value }
				totalAmountSpentTimeSeries(dateFrom: $firstYear, timeUnit: YEAR, kind: [CONTRIBUTION], currency: USD) {
					nodes { date amount { value } }
				}
			}
		}
	`;
}

/** The start of the past year, of the year before it and of the first year ranked. */
export function contributorsWindow(now: Date): {
	yearAgo: string;
	twoYearsAgo: string;
	firstYear: string;
} {
	const yearsBefore = (years: number) =>
		new Date(
			Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate())
		).toISOString();
	return {
		yearAgo: yearsBefore(1),
		twoYearsAgo: yearsBefore(2),
		firstYear: new Date(Date.UTC(firstYear(now.getUTCFullYear()), 0, 1)).toISOString()
	};
}

export interface Contributor {
	slug: string;
	name: string;
	/** Whether it is a person's own account, rather than a company's or its fund's. */
	person: boolean;
	imageUrl: string | null;
	/** What it contributed in the past 12 months. */
	recent: number;
	/** What it contributed in the 12 months before those. */
	previous: number;
	/** What it has contributed in all. */
	total: number;
	/** What it contributed in each calendar year, by year. Years with nothing are left out. */
	years: Record<number, number>;
}

/** Those that have contributed anything, in the order asked about. */
export function toContributors(nodes: (ContributorNode | null)[]): Contributor[] {
	return nodes
		.filter((node): node is ContributorNode => !!node && node.stats.total.value < 0)
		.map((node) => {
			const years: Record<number, number> = {};
			for (const { date, amount } of node.stats.totalAmountSpentTimeSeries.nodes) {
				if (amount.value) years[new Date(date).getUTCFullYear()] = Math.abs(amount.value);
			}
			return {
				slug: node.slug,
				name: node.name || node.slug,
				person: node.type === 'INDIVIDUAL',
				imageUrl: node.imageUrl,
				recent: Math.abs(node.stats.recent.value),
				previous: Math.abs(node.stats.previous.value),
				total: Math.abs(node.stats.total.value),
				years
			};
		});
}

/** What the table ranks by: the past 12 months, or everything contributed. */
export type RankBy = 'recent' | 'total';

export interface Standing {
	contributor: Contributor;
	/** 1 for the most, among those with anything to rank by. */
	rank: number;
	/**
	 * Places gained since a year ago, negative for places lost, or `null` for one that had nothing
	 * to rank by then.
	 */
	moved: number | null;
}

/** Ranks by what each had contributed a year ago, for comparing with now. */
function amountYearAgo(contributor: Contributor, by: RankBy): number {
	return by === 'recent' ? contributor.previous : contributor.total - contributor.recent;
}

/** Each slug's place among those with more than nothing, the most first, a tie to the most in all. */
function places(contributors: Contributor[], amount: (c: Contributor) => number) {
	const ranked = contributors
		.filter((c) => amount(c) > 0)
		.sort((a, b) => amount(b) - amount(a) || b.total - a.total || a.name.localeCompare(b.name));
	return new Map(ranked.map((c, i) => [c.slug, i + 1]));
}

/**
 * The table's rows: those with anything to rank by, the most first, then those with nothing, the
 * most in all first, unranked.
 */
export function standings(contributors: Contributor[], by: RankBy): Standing[] {
	const now = places(contributors, (c) => c[by]);
	const before = places(contributors, (c) => amountYearAgo(c, by));
	return contributors
		.toSorted((a, b) => b[by] - a[by] || b.total - a.total || a.name.localeCompare(b.name))
		.map((contributor) => {
			const rank = now.get(contributor.slug) ?? 0;
			const was = before.get(contributor.slug);
			return { contributor, rank, moved: rank && was ? was - rank : null };
		});
}

/**
 * Each contributor's place in each of the `YEARS_RANKED` years to `lastYear`, `null` in years it
 * contributed nothing.
 */
export function yearlyRanks(
	contributors: Contributor[],
	lastYear: number
): { years: number[]; ranks: Map<string, (number | null)[]> } {
	const years = Array.from({ length: YEARS_RANKED }, (_, i) => firstYear(lastYear) + i);
	const byYear = years.map((year) => places(contributors, (c) => c.years[year] ?? 0));
	return {
		years,
		ranks: new Map(
			contributors.map((c) => [c.slug, byYear.map((places) => places.get(c.slug) ?? null)])
		)
	};
}
