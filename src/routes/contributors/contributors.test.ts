import { describe, expect, it } from 'vitest';
import {
	contributorsQuery,
	contributorsWindow,
	standings,
	toCandidates,
	toContributors,
	yearlyRanks,
	type ContributorNode,
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
	it('keeps those that have contributed, with what they gave each year', () => {
		const contributors = toContributors([
			node({ slug: 'netlify', recent: 150000, previous: 82500, years: { 2025: 150000, 2023: 0 } }),
			node({ slug: 'nobody', recent: 0, previous: 0 }),
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
			})
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
		{ type = 'ORGANIZATION', name = slug, isIncognito = false } = {}
	): ScanNode => ({ amount: { value }, fromAccount: { slug, name, type, isIncognito } });

	it('ranks those that gave the most, leaving out those that pass money on or gave no name', () => {
		expect(
			toCandidates([
				gift('sentry', 50000, { type: 'FUND' }),
				gift('pavan', 30000, { type: 'INDIVIDUAL', name: 'Pavan' }),
				gift('pavan', 30000, { type: 'INDIVIDUAL', name: 'Pavan' }),
				gift('vite-ecosystem-fund', 157000, { type: 'PROJECT' }),
				gift('maplibre', 290000, { type: 'COLLECTIVE' }),
				gift('thanks-dev', 74000),
				gift('incognito-1', 50000, { type: 'INDIVIDUAL', isIncognito: true }),
				gift('guest-1', 40000, { type: 'INDIVIDUAL', name: 'Guest' }),
				{ amount: { value: 90000 }, fromAccount: null }
			])
		).toEqual(['pavan', 'sentry']);
	});
});
