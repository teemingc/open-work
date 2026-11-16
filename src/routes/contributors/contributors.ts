/**
 * The companies and people that contribute to open source projects on Open Collective, found
 * from the larger contributions through the main open source hosts, and ranked by what they
 * contributed in the past year or in all, with their place in each of the past few calendar years.
 */

import { yearsBefore, type PayoutNode } from '#lib/financials.js';
import { GIVING_KINDS, isGift } from '#lib/grants.js';

/**
 * The hosts scanned for contributors. Open Collective cannot list the accounts that contribute to
 * others, nor sort accounts by what they have contributed, but it can list a host's transactions.
 */
export const HOSTS = ['opensource', 'europe', 'numfocus'];

/** The smallest contribution scanned for, in US dollars, to keep the scan to a few requests. */
export const MIN_CONTRIBUTION = 500;

/** How many transactions one scan request lists, the most Open Collective allows. */
export const SCAN_PAGE = 1000;

/** How many contributors are ranked: those that gave the most in the contributions scanned. */
export const LIMIT = 15;

/**
 * Accounts of the kinds that hold money for projects, which contribute what others gave them. Funds
 * stay in: a company's fund contributes the company's own money.
 */
const PASS_ON_TYPES = new Set(['COLLECTIVE', 'PROJECT', 'EVENT', 'VENDOR']);

/** The kinds a fund's own parts have: they contribute the fund's money, so stay in as well. */
const PART_TYPES = new Set(['PROJECT', 'EVENT']);

/** Platforms that pay out what their own donors gave, so would count it twice. */
const PASS_ON_SLUGS = new Set(['thanks-dev', 'github-sponsors']);

/** `GIVING_KINDS` as a query writes them, so those who pay a host by invoice count as givers too. */
const KINDS = `[${GIVING_KINDS.join(', ')}]`;

/** One contribution of `MIN_CONTRIBUTION` or more to a project the host holds money for. */
export interface ScanNode {
	amount: { value: number };
	fromAccount: {
		slug: string;
		name: string | null;
		type: string;
		isIncognito: boolean;
		/** The account a project or event belongs to. */
		parent?: { type: string } | null;
	} | null;
	toAccount: { type: string } | null;
	/** Given back since, as an invoice entered by mistake is. */
	isRefunded: boolean;
}

/**
 * Whether an account contributes what others gave it. A project or event of a fund doesn't: the
 * Vite Ecosystem Fund is a project of Cloudflare's fund, which gives nothing under its own name.
 */
function passesOn(from: NonNullable<ScanNode['fromAccount']>): boolean {
	if (PASS_ON_SLUGS.has(from.slug)) return true;
	if (PART_TYPES.has(from.type) && from.parent?.type === 'FUND') return false;
	return PASS_ON_TYPES.has(from.type);
}

/** A page of a host's contributions of `MIN_CONTRIBUTION` or more from `$since` to `$until`. */
export const SCAN_QUERY = /* GraphQL */ `
	query ContributorsScan(
		$host: AccountReferenceInput!
		$since: DateTime!
		$until: DateTime!
		$offset: Int!
		$min: Int!
		$limit: Int!
	) {
		transactions(
			host: $host
			kind: ${KINDS}
			type: CREDIT
			amount: { gte: { valueInCents: $min, currency: USD } }
			dateFrom: $since
			dateTo: $until
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
					... on AccountWithParent {
						parent {
							type
						}
					}
				}
				toAccount {
					type
				}
				isRefunded
			}
		}
	}
`;

/** One expense of `MIN_CONTRIBUTION` or more that an account with the host paid. */
export interface PaidNode extends Pick<PayoutNode, 'expense'> {
	/** Negative, and includes payment processor fees. */
	netAmount: { value: number };
	/** The account that paid. */
	account: ScanNode['fromAccount'];
	isRefunded: boolean;
}

/** A page of the expenses of `MIN_CONTRIBUTION` or more a host paid from `$since` to `$until`. */
export const PAID_QUERY = /* GraphQL */ `
	query ContributorsPaid(
		$host: AccountReferenceInput!
		$since: DateTime!
		$until: DateTime!
		$offset: Int!
		$min: Int!
		$limit: Int!
	) {
		transactions(
			host: $host
			kind: [EXPENSE]
			type: DEBIT
			amount: { gte: { valueInCents: $min, currency: USD } }
			dateFrom: $since
			dateTo: $until
			limit: $limit
			offset: $offset
		) {
			totalCount
			nodes {
				netAmount {
					value
				}
				isRefunded
				account {
					slug
					name
					type
					isIncognito
					... on AccountWithParent {
						parent {
							type
						}
					}
				}
				expense {
					type
					tags
					accountingCategory {
						name
					}
				}
			}
		}
	}
`;

/**
 * The gifts among a host's paid expenses, as the contributions they stand for. A gift paid by
 * invoice to a maintainer with no collective of their own is as much a contribution as one to a
 * collective, so counts towards who is ranked.
 */
export function giftsPaid(nodes: PaidNode[]): ScanNode[] {
	return nodes
		.filter((node) => !!node.account && isGift({ node, slug: node.account.slug }))
		.map((node) => ({
			amount: { value: -node.netAmount.value },
			fromAccount: node.account,
			toAccount: null,
			isRefunded: node.isRefunded
		}));
}

/**
 * The slugs of those that gave the most in the contributions scanned, up to `LIMIT`. Leaves out
 * accounts that pass on what others gave, and contributors who chose not to be named. A host adding
 * funds to its own projects is passing on what it was paid for them, and what a company puts in its
 * own fund is counted when the fund gives it, so neither is a gift here, nor is one refunded since. Amounts are added whatever
 * their currency, which is near enough for choosing whom to rank: the ranking itself is in US
 * dollars.
 */
export function toCandidates(nodes: ScanNode[]): string[] {
	const given = new Map<string, number>();
	for (const { amount, fromAccount: from, toAccount: to, isRefunded } of nodes) {
		if (!from || isRefunded || from.isIncognito || passesOn(from)) continue;
		if (HOSTS.includes(from.slug) || to?.type === 'FUND') continue;
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
				recent: totalAmountSpent(dateFrom: $yearAgo, kind: ${KINDS}, currency: USD) { value }
				previous: totalAmountSpent(dateFrom: $twoYearsAgo, dateTo: $yearAgo, kind: ${KINDS}, currency: USD) { value }
				total: totalAmountSpent(kind: ${KINDS}, currency: USD) { value }
				totalAmountSpentTimeSeries(dateFrom: $firstYear, timeUnit: YEAR, kind: ${KINDS}, currency: USD) {
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
	return {
		yearAgo: yearsBefore(now, 1),
		twoYearsAgo: yearsBefore(now, 2),
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
	/** How what it contributed is spread over those it gave to, in the past 12 months and in all. */
	spread: Record<RankBy, Spread>;
}

/** How many recipients a spread names: those given the most. The rest count together. */
export const SEGMENTS = 4;

/** How what a contributor gave is spread over those it gave to. */
export interface Spread {
	/** How many it gave to. */
	count: number;
	/** The `SEGMENTS` given the most, the most first, each with its part of the whole, from 0 to 1. */
	top: { name: string; share: number }[];
}

/**
 * The accounts Open Collective knows, in the order asked about. One may have contributed nothing by
 * these sums, having given by invoice alone: `withGifts` adds those. `spreadOf` fills in the spread.
 */
export function toContributors(nodes: (ContributorNode | null)[]): Contributor[] {
	return nodes
		.filter((node): node is ContributorNode => !!node)
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
				years,
				spread: { recent: { count: 0, top: [] }, total: { count: 0, top: [] } }
			};
		});
}

/** An expense a contributor paid, in its own currency. */
export interface ExpenseNode extends Pick<PayoutNode, 'createdAt' | 'expense'> {
	/** Negative, and includes payment processor fees. */
	netAmount: { value: number; currency: string };
	/** Whom it was paid to. */
	toAccount?: GivenNode['toAccount'];
}

/** A page of the expenses an account has paid, the latest first. */
export const EXPENSES_QUERY = /* GraphQL */ `
	query ContributorExpenses($slug: String!, $limit: Int!, $offset: Int!) {
		transactions(
			account: [{ slug: $slug }]
			type: DEBIT
			kind: [EXPENSE]
			limit: $limit
			offset: $offset
		) {
			totalCount
			nodes {
				createdAt
				netAmount {
					value
					currency
				}
				toAccount {
					slug
					name
				}
				expense {
					type
					tags
					accountingCategory {
						name
					}
				}
			}
		}
	}
`;

/** What a gift paid as an expense came to, or 0 for an expense that doesn't count as one. */
function giftAmount(node: ExpenseNode, slug: string): number {
	const amount = -node.netAmount.value;
	if (node.netAmount.currency !== 'USD' || amount <= 0) return 0;
	return isGift({ node, slug }) ? amount : 0;
}

/**
 * A contributor with the gifts it paid as expenses added to what it contributed. A fund pays
 * maintainers who have no collective of their own by expense, as the Vite Ecosystem Fund does, and
 * Open Collective's sums can't tell those from what an account pays for its own costs. Only gifts
 * in US dollars count, as an expense's amount comes in the account's currency alone.
 */
export function withGifts({
	contributor,
	expenses,
	now
}: {
	contributor: Contributor;
	expenses: ExpenseNode[];
	now: Date;
}): Contributor {
	const { yearAgo, twoYearsAgo, firstYear } = contributorsWindow(now);
	const result = { ...contributor, years: { ...contributor.years } };
	for (const node of expenses) {
		const amount = giftAmount(node, contributor.slug);
		if (!amount) continue;
		result.total += amount;
		if (node.createdAt >= yearAgo) result.recent += amount;
		else if (node.createdAt >= twoYearsAgo) result.previous += amount;
		if (node.createdAt >= firstYear) {
			const year = new Date(node.createdAt).getUTCFullYear();
			result.years[year] = (result.years[year] ?? 0) + amount;
		}
	}
	return result;
}

/** One contribution an account made, in the currency of the host that holds it. */
export interface GivenNode {
	createdAt: string;
	amount: { value: number };
	/** Given back since. */
	isRefunded: boolean;
	toAccount: { slug: string; name: string | null } | null;
}

/** A page of the contributions an account has made, the latest first. */
export const GIVEN_QUERY = /* GraphQL */ `
	query ContributorGiven($slug: String!, $limit: Int!, $offset: Int!) {
		transactions(
			fromAccount: { slug: $slug }
			type: CREDIT
			kind: ${KINDS}
			limit: $limit
			offset: $offset
		) {
			totalCount
			nodes {
				createdAt
				amount {
					value
				}
				isRefunded
				toAccount {
					slug
					name
				}
			}
		}
	}
`;

/** The recipients given anything, the most first, as their parts of what all of them were given. */
function toSpread(amounts: { name: string; amount: number }[]): Spread {
	const given = amounts.filter(({ amount }) => amount > 0).sort((a, b) => b.amount - a.amount);
	const sum = given.reduce((total, { amount }) => total + amount, 0);
	return {
		count: given.length,
		top: given.slice(0, SEGMENTS).map(({ name, amount }) => ({ name, share: amount / sum }))
	};
}

/**
 * How what `slug` gave is spread over those it gave to: its contributions, and the gifts it paid
 * as expenses. Amounts are added whatever their currency, which is near enough for the parts of a
 * bar a few pixels tall.
 */
export function spreadOf({
	slug,
	given,
	expenses,
	now
}: {
	slug: string;
	given: GivenNode[];
	expenses: ExpenseNode[];
	now: Date;
}): Record<RankBy, Spread> {
	const { yearAgo } = contributorsWindow(now);
	const recipients = new Map<string, { name: string; recent: number; total: number }>();
	const add = (node: { createdAt: string; toAccount?: GivenNode['toAccount'] }, amount: number) => {
		const to = node.toAccount;
		if (!to || amount <= 0) return;
		const recipient = recipients.get(to.slug) ?? { name: to.name || to.slug, recent: 0, total: 0 };
		recipient.total += amount;
		if (node.createdAt >= yearAgo) recipient.recent += amount;
		recipients.set(to.slug, recipient);
	};
	for (const node of given) if (!node.isRefunded) add(node, node.amount.value);
	for (const node of expenses) add(node, giftAmount(node, slug));
	const all = [...recipients.values()];
	return {
		recent: toSpread(all.map(({ name, recent }) => ({ name, amount: recent }))),
		total: toSpread(all.map(({ name, total }) => ({ name, amount: total })))
	};
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
