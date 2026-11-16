import { describe, expect, it } from 'vitest';
import type { Month, PayoutNode } from './financials';
import {
	giftToGrant,
	givingAhead,
	givingHistory,
	givingYear,
	isFund,
	isGift,
	findOwnFunds,
	isFundGift,
	ownFunds,
	recipientCount,
	reducedContributions,
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
	spent?: { value: number; currency: string }
): GrantNode => ({
	createdAt: `${date}T10:00:00.000Z`,
	netAmount: { value: -value },
	oppositeAccount: {
		slug,
		name: slug.toUpperCase(),
		imageUrl: null,
		currency: spent?.currency,
		stats: spent ? { totalAmountSpent: { value: -spent.value } } : null
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
				toPerson: false,
				theirSpending: null,
				via: null
			},
			{
				date: '2026-10-22T10:00:00.000Z',
				slug: 'vue',
				name: 'VUE',
				imageUrl: null,
				amount: 500,
				recurring: true,
				toPerson: false,
				theirSpending: null,
				via: null
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

	it('is a fund when contributions to others are at least nine tenths of its spending', () => {
		expect(isFund({ grants, months: [month('2026-10', 2000, 650)] })).toBe(true);
	});

	it('is not when it also pays its own expenses', () => {
		// Most of it given away, as Solid does, is still not a fund.
		expect(isFund({ grants, months: [month('2026-10', 2000, 700)] })).toBe(false);
		expect(isFund({ grants, months: [month('2026-10', 2000, 1300)] })).toBe(false);
		expect(isFund({ grants: [], months: [month('2026-10', 2000, 0)] })).toBe(false);
	});
});

describe('ownFunds', () => {
	const to = ({
		slug,
		given,
		received,
		type = 'FUND',
		parent
	}: {
		slug: string;
		given: number;
		received: number;
		type?: string;
		parent?: string;
	}): GrantNode => ({
		createdAt: '2026-10-08T00:00:00Z',
		netAmount: { value: -given },
		oppositeAccount: {
			slug,
			name: slug,
			imageUrl: null,
			type,
			parent: parent ? { type: 'FUND', slug: parent } : null,
			stats: { totalAmountSpent: null, totalAmountReceived: { value: received } }
		},
		order: null
	});

	it('finds the funds it put at least half the money into, and their projects', () => {
		const nodes = [
			to({ slug: 'chrome', given: 600, received: 1500 }),
			to({ slug: 'chrome', given: 400, received: 1500 }),
			to({ slug: 'ui-fund', given: 10, received: 300, type: 'PROJECT', parent: 'chrome' })
		];
		expect(ownFunds(nodes).map((fund) => fund.slug)).toEqual(['chrome', 'ui-fund']);
	});

	it("finds the collectives it mostly paid for that one person runs, or that its fund's admin runs", () => {
		const nodes = [
			to({ slug: 'chrome', given: 900, received: 1000 }),
			to({ slug: 'modern-js', given: 900, received: 1000, type: 'COLLECTIVE' }),
			to({ slug: 'chrome-vue', given: 100, received: 100, type: 'COLLECTIVE' }),
			to({ slug: 'css-day', given: 100, received: 100, type: 'COLLECTIVE' }),
			to({ slug: 'espruino', given: 100, received: 100, type: 'COLLECTIVE' }),
			to({ slug: 'eslint', given: 100, received: 1000, type: 'COLLECTIVE' })
		];
		const standing = (...admins: string[]) => ({ selfFunded: 0, admins });
		const family = { slugs: new Set(['google']), admins: new Set<string>() };
		const own = ownFunds(
			nodes,
			{
				chrome: standing('paul'),
				'modern-js': standing('addy'),
				'chrome-vue': standing('addy'),
				'css-day': standing('paul', 'rick'),
				espruino: standing('gordon'),
				// Run by the same person, but mostly paid for by others.
				eslint: standing('addy')
			},
			family
		);
		expect(own.map((fund) => fund.slug)).toEqual(['chrome', 'modern-js', 'chrome-vue', 'css-day']);
		expect([...family.admins].sort()).toEqual(['addy', 'paul', 'rick']);
	});

	it('finds the projects of the giver itself, whoever paid for them', () => {
		const nodes = [
			to({ slug: 'ui-fund', given: 10, received: 300, type: 'PROJECT', parent: 'chrome' })
		];
		expect(ownFunds(nodes)).toEqual([]);
		expect(
			ownFunds(nodes, {}, { slugs: new Set(['chrome']), admins: new Set() }).map((f) => f.slug)
		).toEqual(['ui-fund']);
	});

	it('leaves out projects, and funds that others mostly paid for', () => {
		const nodes = [
			to({ slug: 'vite', given: 900, received: 1000, type: 'COLLECTIVE' }),
			// Sentry paid for most of the Rust Fund, a project of Open Source Collective's funds.
			to({ slug: 'rust-fund', given: 900, received: 1000, type: 'PROJECT', parent: 'osc-funds' }),
			to({ slug: 'community-fund', given: 100, received: 1000 })
		];
		expect(ownFunds(nodes)).toEqual([]);
	});
});

describe('ownFunds of a fund that added money to itself', () => {
	const amp: GrantNode = {
		createdAt: '2026-10-08T00:00:00Z',
		netAmount: { value: -60 },
		oppositeAccount: {
			slug: 'amp',
			name: 'AMP',
			imageUrl: null,
			type: 'FUND',
			stats: { totalAmountSpent: null, totalAmountReceived: { value: 218 } }
		},
		order: null
	};

	it('sets what it gave against what the fund received from others', () => {
		expect(ownFunds([amp])).toEqual([]);
		expect(ownFunds([amp], { amp: { selfFunded: 158, admins: [] } })).toEqual([
			{ slug: 'amp', name: 'AMP' }
		]);
	});

	it('asks what each fund added to itself', async () => {
		const asked: string[] = [];
		const funds = await findOwnFunds({
			nodes: [amp],
			ask: async <R>({ query }: { query: string }) => {
				asked.push(query);
				return {
					f0: {
						slug: 'amp',
						members: {
							nodes: [
								{ role: 'BACKER', account: { slug: 'google' }, totalDonations: { value: 60 } },
								{ role: 'BACKER', account: { slug: 'amp' }, totalDonations: { value: 158 } }
							]
						}
					}
				} as R;
			}
		});
		expect(funds).toEqual([{ slug: 'amp', name: 'AMP' }]);
		expect(asked).toHaveLength(1);
		expect(asked[0]).toContain('account(slug: "amp"');
	});
});

describe('isFundGift', () => {
	const paid = (type: string, to = 'ORGANIZATION') => ({
		expense: { type, tags: [], accountingCategory: null },
		oppositeAccount: { slug: 'p5js', name: 'p5.js', type: to }
	});

	it('counts invoices and grants, and not costs paid back or payments to vendors', () => {
		expect(isFundGift(paid('INVOICE'))).toBe(true);
		expect(isFundGift(paid('GRANT', 'INDIVIDUAL'))).toBe(true);
		expect(isFundGift(paid('RECEIPT'))).toBe(false);
		expect(isFundGift(paid('INVOICE', 'VENDOR'))).toBe(false);
		expect(isFundGift({ expense: null, oppositeAccount: null })).toBe(false);
	});
});

describe('isFund with its own funds', () => {
	it('counts what it moved into its funds, not what they gave on', () => {
		const grants = toGrants([
			{ ...grant('2026-10-08', 'vite', 100), via: { slug: 'chrome', name: 'Chrome' } }
		]);
		const months = [month('2026-10', 0, 1000)];
		expect(isFund({ grants, months })).toBe(false);
		expect(isFund({ grants, months, funded: [{ amount: 1000 }] })).toBe(true);
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
			year: { from: '2025-11-24T00:00:00.000Z', to: '2026-11-24T00:00:00.000Z', stopped: false }
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
	it('is how much of their past year of spending the collective covers, in the same currency only', () => {
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
			year: { from: '2025-10-24T00:00:00.000Z', to: '2026-10-24T00:00:00.000Z', stopped: false }
		});
		expect(recipients.map((r) => [r.slug, r.recent, r.spending, r.share])).toEqual([
			['oxc', 36000, 40000, 0.9],
			['vite-plus', 36000, 30000, 1.2],
			['babel', 0, null, null],
			['vitest', 1000, 50000, 0.02],
			['nuxt', 2000, null, null],
			['none', 1000, null, null]
		]);
	});
});

describe('givingYear', () => {
	const grants = toGrants([grant('2024-03-01', 'babel', 5000), grant('2025-02-03', 'vite', 1000)]);

	it('is the past 12 months while it still gives', () => {
		expect(givingYear({ grants, now: new Date('2026-01-15T00:00:00Z') })).toEqual({
			from: '2025-01-15T00:00:00.000Z',
			to: '2026-01-15T00:00:00.000Z',
			stopped: false
		});
	});

	it('is the 12 months up to the last gift once it has stopped', () => {
		expect(givingYear({ grants, now: new Date('2026-10-26T00:00:00Z') })).toEqual({
			from: '2024-02-03T00:00:00.000Z',
			to: '2025-02-03T10:00:00.000Z',
			stopped: true
		});
	});

	it('sets its last year of gifts against what each project spends now', () => {
		const recipients = toRecipients({
			grants: toGrants([
				grant('2024-01-01', 'babel', 9000, 'ONETIME', { value: 1000, currency: 'USD' }),
				grant('2024-06-01', 'vite', 3000, 'ONETIME', { value: 9000, currency: 'USD' }),
				grant('2025-02-03', 'vite', 1000, 'ONETIME', { value: 9000, currency: 'USD' })
			]),
			commitments: [],
			currency: 'USD',
			year: { from: '2024-02-03T00:00:00.000Z', to: '2025-02-03T10:00:00.000Z', stopped: true }
		});
		expect(recipients.map((r) => [r.slug, r.recent, r.spending, r.share])).toEqual([
			['babel', 0, null, null],
			['vite', 4000, 9000, 4000 / 9000]
		]);
	});
});

describe('reducedContributions', () => {
	const now = new Date('2026-10-26T00:00:00Z');

	it('compares the past 12 months with the 12 months before, once they have dropped by a third', () => {
		const grants = toGrants([
			grant('2024-10-01', 'babel', 9000),
			grant('2024-11-01', 'babel', 6000),
			grant('2025-06-01', 'vite', 4000),
			grant('2025-12-01', 'vite', 3000),
			grant('2026-09-01', 'vite', 2000)
		]);
		expect(reducedContributions({ grants, now })).toEqual({ recent: 5000, previous: 10000 });
	});

	it('is undefined while it contributes more than two thirds as much', () => {
		const grants = toGrants([
			grant('2025-06-01', 'vite', 10000),
			grant('2026-09-01', 'vite', 6667)
		]);
		expect(reducedContributions({ grants, now })).toBeUndefined();
	});

	it('is undefined once it has stopped, or when it has only just started', () => {
		expect(
			reducedContributions({ grants: toGrants([grant('2025-06-01', 'vite', 10000)]), now })
		).toBeUndefined();
		expect(
			reducedContributions({ grants: toGrants([grant('2026-09-01', 'vite', 100)]), now })
		).toBeUndefined();
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

describe('isGift', () => {
	const expense = (expense: Partial<NonNullable<PayoutNode['expense']>>): PayoutNode => ({
		createdAt: '2026-11-06T10:00:00.000Z',
		netAmount: { value: -2500 },
		oppositeAccount: {
			slug: 'ari',
			name: 'Ari',
			type: 'INDIVIDUAL',
			imageUrl: 'https://example.com/ari.png'
		},
		expense: { type: 'INVOICE', accountingCategory: null, ...expense }
	});
	const slug = 'vite-ecosystem-fund';

	it('is a gift when tagged with the collective, booked as a donation, or a grant', () => {
		expect(isGift({ node: expense({ tags: [slug] }), slug })).toBe(true);
		expect(isGift({ node: expense({ tags: [slug] }), slug: 'Vite-Ecosystem-Fund' })).toBe(true);
		expect(
			isGift({
				node: expense({ accountingCategory: { name: 'Expenses - Donations & Sponsorships' } }),
				slug
			})
		).toBe(true);
		expect(isGift({ node: expense({ type: 'GRANT' }), slug })).toBe(true);
	});

	it('is not when it is payment for work', () => {
		expect(isGift({ node: expense({ tags: ['maintenance'] }), slug })).toBe(false);
		expect(
			isGift({
				node: expense({
					accountingCategory: { name: 'Consultants · Maintenance and Development' }
				}),
				slug
			})
		).toBe(false);
		expect(isGift({ node: { ...expense({}), expense: null }, slug })).toBe(false);
	});

	it('is to a person only when the payee is an individual', () => {
		const node = expense({ type: 'GRANT' });
		const toOrganization = {
			...node,
			oppositeAccount: { slug: 'numfocus', name: 'NumFOCUS', type: 'ORGANIZATION' }
		};
		expect(toGrants([giftToGrant(toOrganization)])[0].toPerson).toBe(false);
	});

	it('counts towards a fund as a one-off contribution to the payee', () => {
		expect(toGrants([giftToGrant(expense({ tags: [slug] }))])).toEqual([
			{
				date: '2026-11-06T10:00:00.000Z',
				slug: 'ari',
				name: 'Ari',
				imageUrl: 'https://example.com/ari.png',
				amount: 2500,
				recurring: false,
				toPerson: true,
				theirSpending: null,
				via: null
			}
		]);
	});

	it('carries what a collective paid by expense spends', () => {
		const node = expense({ type: 'GRANT' });
		const toCollective = {
			...node,
			oppositeAccount: {
				slug: 'aboutcode',
				name: 'AboutCode',
				type: 'COLLECTIVE',
				currency: 'USD',
				stats: { totalAmountSpent: { value: -2288.78 } }
			}
		};
		expect(toGrants([giftToGrant(toCollective)])[0].theirSpending).toEqual({
			value: 2288.78,
			currency: 'USD'
		});
	});
});

describe('recipientCount', () => {
	it('counts projects, and maintainers too when any were paid by expense', () => {
		expect(recipientCount({ count: 1, people: false })).toBe('1 project');
		expect(recipientCount({ count: 20, people: false })).toBe('20 projects');
		expect(recipientCount({ count: 39, people: true })).toBe('39 projects and maintainers');
		expect(recipientCount({ count: 1, people: true })).toBe('1 maintainer');
	});
});
