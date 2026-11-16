import { describe, expect, it } from 'vitest';
import {
	contributorsQuery,
	contributorsWindow,
	giftsPaid,
	standings,
	toCandidates,
	toContributors,
	withGifts,
	yearlyRanks,
	type ContributorNode,
	type ExpenseNode,
	type PaidNode,
	type ScanNode
} from './contributors';

const node = ({
	slug,
	recent,
	previous,
	total = recent + previous,
	years = {}
}: {
	slug: string;
	recent: number;
	previous: number;
	total?: number;
	years?: Record<number, number>;
}): ContributorNode => ({
	slug,
	name: slug.toUpperCase(),
	type: 'ORGANIZATION',
	imageUrl: null,
	stats: {
		recent: { value: -recent },
		previous: { value: -previous },
		total: { value: -total },
		totalAmountSpentTimeSeries: {
			nodes: Object.entries(years).map(([year, value]) => ({
				date: `${year}-01-01T00:00:00.000Z`,
				amount: { value }
			}))
		}
	}
});

describe('toContributors', () => {
	it('keeps the accounts found, with what they gave each year', () => {
		const contributors = toContributors([
			node({ slug: 'netlify', recent: 150000, previous: 82500, years: { 2025: 150000, 2023: 0 } }),
			node({ slug: 'invoices-only', recent: 0, previous: 0 }),
			null
		]);
		expect(contributors).toEqual([
			expect.objectContaining({
				slug: 'netlify',
				name: 'NETLIFY',
				recent: 150000,
				previous: 82500,
				total: 232500,
				years: { 2025: 150000 }
			}),
			expect.objectContaining({ slug: 'invoices-only', total: 0, years: {} })
		]);
	});
});

describe('standings', () => {
	const contributors = toContributors([
		node({ slug: 'airbnb', recent: 80000, previous: 154000, total: 907000 }),
		node({ slug: 'netlify', recent: 150000, previous: 157000, total: 377000 }),
		node({ slug: 'sentry', recent: 132000, previous: 0, total: 243000 }),
		node({ slug: 'vercel', recent: 0, previous: 1500, total: 242000 }),
		node({ slug: 'storyblok', recent: 0, previous: 0, total: 40000 }),
		node({ slug: 'indeed', recent: 0, previous: 900, total: 137000 })
	]);

	it('ranks the past 12 months, with places moved since the 12 before', () => {
		expect(
			standings(contributors, 'recent').map((s) => [s.contributor.slug, s.rank, s.moved])
		).toEqual([
			['netlify', 1, 0],
			['sentry', 2, null],
			['airbnb', 3, -1],
			['vercel', 0, null],
			['indeed', 0, null],
			['storyblok', 0, null]
		]);
	});

	it('ranks all time, with places moved since what each had given a year ago', () => {
		expect(
			standings(contributors, 'total').map((s) => [s.contributor.slug, s.rank, s.moved])
		).toEqual([
			['airbnb', 1, 0],
			['netlify', 2, 1],
			['sentry', 3, 2],
			['vercel', 4, -2],
			['indeed', 5, -1],
			['storyblok', 6, 0]
		]);
	});
});

describe('yearlyRanks', () => {
	it('places each year ranked, leaving years with nothing empty and earlier years out', () => {
		const { years, ranks } = yearlyRanks(
			toContributors([
				node({ slug: 'a', recent: 1, previous: 0, years: { 2020: 50, 2021: 10, 2023: 5 } }),
				node({ slug: 'b', recent: 1, previous: 0, years: { 2021: 20, 2022: 5, 2026: 1 } })
			]),
			2026
		);
		expect(years).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
		expect(ranks.get('a')).toEqual([2, null, 1, null, null, null]);
		expect(ranks.get('b')).toEqual([1, 1, null, null, null, 1]);
	});
});

describe('contributorsQuery', () => {
	it('stays within Open Collective’s 100 aliases for a full batch', () => {
		const query = contributorsQuery(Array.from({ length: 20 }, (_, i) => `org-${i}`));
		const aliases = query.match(/\b\w+:\s*(account|totalAmountSpent)\(/g) ?? [];
		expect(aliases.length - 1).toBeLessThanOrEqual(100);
	});
});

describe('contributorsWindow', () => {
	it('bounds the past year, the year before and the first year ranked', () => {
		expect(contributorsWindow(new Date('2026-10-26T05:00:00Z'))).toEqual({
			yearAgo: '2025-10-26T00:00:00.000Z',
			twoYearsAgo: '2024-10-26T00:00:00.000Z',
			firstYear: '2021-01-01T00:00:00.000Z'
		});
	});
});

describe('toCandidates', () => {
	const gift = (
		slug: string,
		value: number,
		{
			type = 'ORGANIZATION',
			name = slug,
			isIncognito = false,
			to = 'COLLECTIVE',
			isRefunded = false,
			parent
		}: {
			type?: string;
			name?: string;
			isIncognito?: boolean;
			to?: string;
			isRefunded?: boolean;
			parent?: string;
		} = {}
	): ScanNode => ({
		amount: { value },
		fromAccount: { slug, name, type, isIncognito, parent: parent ? { type: parent } : null },
		toAccount: { type: to },
		isRefunded
	});

	it('ranks those that gave the most, leaving out those that pass money on or gave no name', () => {
		expect(
			toCandidates([
				gift('sentry', 50000, { type: 'FUND' }),
				gift('pavan', 30000, { type: 'INDIVIDUAL', name: 'Pavan' }),
				gift('pavan', 30000, { type: 'INDIVIDUAL', name: 'Pavan' }),
				gift('webpack-docs', 157000, { type: 'PROJECT', parent: 'COLLECTIVE' }),
				gift('maplibre', 290000, { type: 'COLLECTIVE' }),
				gift('thanks-dev', 74000),
				gift('github-sponsors', 1700000),
				// A host adding funds to its own projects, and a company filling its own fund.
				gift('numfocus', 6300000),
				gift('bloomberg', 130000, { to: 'FUND' }),
				gift('the-linux-foundation', 165000, { isRefunded: true }),
				gift('incognito-1', 50000, { type: 'INDIVIDUAL', isIncognito: true }),
				gift('guest-1', 40000, { type: 'INDIVIDUAL', name: 'Guest' }),
				{ amount: { value: 90000 }, fromAccount: null, toAccount: null, isRefunded: false }
			])
		).toEqual(['pavan', 'sentry']);
	});

	it("keeps a fund's projects and events, which give the fund's own money", () => {
		expect(
			toCandidates([
				gift('vite-ecosystem-fund', 157000, { type: 'PROJECT', parent: 'FUND' }),
				gift('fund-summit', 20000, { type: 'EVENT', parent: 'FUND' }),
				gift('orphan', 90000, { type: 'PROJECT' }),
				gift('thanks-dev', 74000, { type: 'PROJECT', parent: 'FUND' })
			])
		).toEqual(['vite-ecosystem-fund', 'fund-summit']);
	});
});

describe('withGifts', () => {
	const now = new Date('2026-11-16T00:00:00.000Z');
	const [fund] = toContributors([
		node({ slug: 'vite-ecosystem-fund', recent: 159000, previous: 0, years: { 2026: 159000 } })
	]);
	const expense = (
		createdAt: string,
		value: number,
		{ type = 'INVOICE', tags = ['vite-ecosystem-fund'], currency = 'USD' } = {}
	): ExpenseNode => ({
		createdAt,
		netAmount: { value: -value, currency },
		expense: { type, tags, accountingCategory: null }
	});

	it('adds gifts paid as expenses to the past year, the year before and their calendar years', () => {
		const result = withGifts({
			contributor: fund,
			expenses: [
				expense('2026-10-22T00:00:00.000Z', 40000),
				expense('2025-06-01T00:00:00.000Z', 10000, { type: 'GRANT', tags: [] }),
				expense('2019-06-01T00:00:00.000Z', 2400)
			],
			now
		});
		expect(result).toMatchObject({
			recent: 199000,
			previous: 10000,
			total: 211400,
			years: { 2026: 199000, 2025: 10000 }
		});
		expect(fund.years).toEqual({ 2026: 159000 });
	});

	it('leaves out what the contributor paid for itself, and gifts in other currencies', () => {
		const result = withGifts({
			contributor: fund,
			expenses: [
				expense('2026-10-22T00:00:00.000Z', 900, { tags: ['hosting'] }),
				expense('2026-10-22T00:00:00.000Z', 5000, { currency: 'EUR' })
			],
			now
		});
		expect(result).toEqual(fund);
	});
});

describe('giftsPaid', () => {
	const paid = (
		slug: string,
		value: number,
		{ type = 'INVOICE', tags = [] as string[], category = '', parent = 'FUND' } = {}
	): PaidNode => ({
		netAmount: { value: -value },
		isRefunded: false,
		account: { slug, name: slug, type: 'PROJECT', isIncognito: false, parent: { type: parent } },
		expense: { type, tags, accountingCategory: category ? { name: category } : null }
	});

	it('counts gifts paid by invoice towards who is ranked, and not what an account paid for itself', () => {
		const gifts = giftsPaid([
			paid('vite-ecosystem-fund', 5000, { tags: ['vite-ecosystem-fund'] }),
			paid('vite-ecosystem-fund', 2500, { type: 'GRANT' }),
			paid('vite-ecosystem-fund', 800, { tags: ['hosting'] }),
			paid('doctrine', 6000, { tags: ['doctrine'], parent: 'COLLECTIVE' }),
			{ netAmount: { value: -900 }, isRefunded: false, account: null, expense: null }
		]);
		expect(gifts.map((gift) => [gift.fromAccount?.slug, gift.amount.value])).toEqual([
			['vite-ecosystem-fund', 5000],
			['vite-ecosystem-fund', 2500],
			['doctrine', 6000]
		]);
		expect(toCandidates(gifts)).toEqual(['vite-ecosystem-fund']);
	});
});
