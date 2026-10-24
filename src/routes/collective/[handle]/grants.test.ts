import { describe, expect, it } from 'vitest';
import type { Month } from './financials';
import {
	givingAhead,
	givingHistory,
	isFund,
	toCommitments,
	toGrants,
	toRecipients,
	toRounds,
	type GrantNode
} from './grants';

const grant = (
	date: string,
	slug: string,
	value: number,
	frequency = 'ONETIME',
	income?: { value: number; currency: string }
): GrantNode => ({
	createdAt: `${date}T10:00:00.000Z`,
	netAmount: { value: -value },
	oppositeAccount: {
		slug,
		name: slug.toUpperCase(),
		imageUrl: null,
		currency: income?.currency,
		stats: income ? { totalAmountReceived: { value: income.value } } : null
	},
	order: { frequency }
});

const month = (key: string, income: number, expenses: number): Month => ({
	key,
	income,
	expenses,
	net: income - expenses,
	balance: 0,
	partial: false
});

describe('toGrants', () => {
	it('makes amounts positive, oldest first, and tells recurring from one-off', () => {
		expect(
			toGrants([grant('2026-10-22', 'vue', 500, 'MONTHLY'), grant('2026-10-08', 'vite', 36000)])
		).toEqual([
			{
				date: '2026-10-08T10:00:00.000Z',
				slug: 'vite',
				name: 'VITE',
				imageUrl: null,
				amount: 36000,
				recurring: false,
				theirIncome: null
			},
			{
				date: '2026-10-22T10:00:00.000Z',
				slug: 'vue',
				name: 'VUE',
				imageUrl: null,
				amount: 500,
				recurring: true,
				theirIncome: null
			}
		]);
	});
});

describe('toCommitments', () => {
	it('turns each frequency into a monthly amount and drops one-offs', () => {
		expect(
			toCommitments([
				{ frequency: 'YEARLY', amount: { value: 1200 }, toAccount: { slug: 'a', name: 'A' } },
				{ frequency: 'MONTHLY', amount: { value: 500 }, toAccount: { slug: 'b', name: 'B' } },
				{ frequency: 'ONETIME', amount: { value: 900 }, toAccount: { slug: 'c', name: 'C' } }
			])
		).toEqual([
			{ slug: 'b', name: 'B', monthly: 500 },
			{ slug: 'a', name: 'A', monthly: 100 }
		]);
	});
});

describe('isFund', () => {
	const grants = toGrants([grant('2026-10-08', 'vite', 600)]);

	it('is a fund when contributions to others are at least half of its spending', () => {
		expect(isFund({ grants, months: [month('2026-10', 2000, 1000)] })).toBe(true);
	});

	it('is not when it mostly pays expenses', () => {
		expect(isFund({ grants, months: [month('2026-10', 2000, 1300)] })).toBe(false);
		expect(isFund({ grants: [], months: [month('2026-10', 2000, 0)] })).toBe(false);
	});
});

describe('toRecipients', () => {
	it('totals each recipient, biggest first, with what it still gets a month', () => {
		const recipients = toRecipients({
			grants: toGrants([
				grant('2026-10-08', 'vite', 36000),
				grant('2026-10-22', 'vue', 500, 'MONTHLY'),
				grant('2026-11-22', 'vue', 500, 'MONTHLY')
			]),
			commitments: [{ slug: 'vue', name: 'VUE', monthly: 500 }],
			currency: 'USD',
			now: new Date('2026-11-24T00:00:00Z')
		});
		expect(recipients.map((r) => [r.slug, r.oneOff, r.recurring, r.count, r.monthly])).toEqual([
			['vite', 36000, 0, 1, 0],
			['vue', 0, 1000, 2, 500]
		]);
		expect(recipients[1].first).toBe('2026-10-22T10:00:00.000Z');
		expect(recipients[1].last).toBe('2026-11-22T10:00:00.000Z');
	});
});

describe('toRecipients share', () => {
	it('is how much of its past year of contributions came from the collective, in the same currency only', () => {
		const recipients = toRecipients({
			grants: toGrants([
				grant('2026-10-08', 'oxc', 36000, 'ONETIME', { value: 40000, currency: 'USD' }),
				grant('2026-10-08', 'vite-plus', 36000, 'ONETIME', { value: 30000, currency: 'USD' }),
				grant('2026-10-08', 'nuxt', 2000, 'ONETIME', { value: 9000, currency: 'EUR' }),
				grant('2026-10-08', 'none', 1000),
				grant('2025-06-01', 'babel', 5000, 'ONETIME', { value: 250000, currency: 'USD' }),
				grant('2025-09-01', 'vitest', 4000, 'ONETIME', { value: 50000, currency: 'USD' }),
				grant('2026-10-08', 'vitest', 1000, 'ONETIME', { value: 50000, currency: 'USD' })
			]),
			commitments: [],
			currency: 'USD',
			now: new Date('2026-10-24T00:00:00Z')
		});
		expect(recipients.map((r) => [r.slug, r.recent, r.contributions, r.share])).toEqual([
			['oxc', 36000, 40000, 0.9],
			['vite-plus', 36000, 36000, 1],
			['babel', 0, null, null],
			['vitest', 1000, 50000, 0.02],
			['nuxt', 2000, null, null],
			['none', 1000, null, null]
		]);
	});
});

describe('toRounds', () => {
	it('gathers what each account was given each day, oldest first', () => {
		const rounds = toRounds(
			toGrants([
				grant('2026-10-08', 'vite', 100),
				grant('2026-10-22', 'vue', 20, 'MONTHLY'),
				grant('2026-10-22', 'pnpm', 30),
				grant('2026-10-22', 'pnpm', 10)
			])
		);
		expect(rounds.map((r) => [r.key, r.total])).toEqual([
			['2026-10-08', 100],
			['2026-10-22', 60]
		]);
		expect(rounds[1].gifts.map((g) => [g.slug, g.amount, g.recurring])).toEqual([
			['pnpm', 40, false],
			['vue', 20, true]
		]);
		expect(toRounds([])).toEqual([]);
	});
});

describe('givingHistory', () => {
	it('keeps running totals, received by the month and given by the day', () => {
		const points = givingHistory({
			grants: toGrants([grant('2026-10-08', 'vite', 100), grant('2026-11-02', 'vue', 20)]),
			months: [month('2026-10', 500, 100), month('2026-11', 0, 20)],
			now: new Date('2026-11-05T00:00:00Z')
		});
		expect(points.map((p) => [p.date.toISOString().slice(0, 10), p.received, p.given])).toEqual([
			['2026-10-01', 500, 0],
			['2026-10-08', 500, 100],
			['2026-11-01', 500, 100],
			['2026-11-02', 500, 120],
			['2026-11-05', 500, 120]
		]);
	});
});

describe('givingAhead', () => {
	const now = new Date('2026-10-24T00:00:00Z');
	const months = (points: { date: Date; given: number }[]) =>
		points.map((p) => [p.date.toISOString().slice(0, 10), p.given]);

	it('adds the monthly gifts each month for as long as what came in pays for them', () => {
		expect(months(givingAhead({ given: 100, received: 135, monthly: 10, now, limit: 60 }))).toEqual(
			[
				['2026-10-24', 100],
				['2026-11-01', 110],
				['2026-12-01', 120],
				['2027-01-01', 130]
			]
		);
	});

	it('stops at the limit', () => {
		expect(givingAhead({ given: 0, received: 1000, monthly: 10, now, limit: 2 })).toHaveLength(3);
	});

	it('is empty without monthly gifts or the money for one more', () => {
		expect(givingAhead({ given: 0, received: 1000, monthly: 0, now, limit: 60 })).toEqual([]);
		expect(givingAhead({ given: 995, received: 1000, monthly: 10, now, limit: 60 })).toEqual([]);
	});
});
