import { describe, expect, it } from 'vitest';
import {
	accountName,
	accountsByMonth,
	byQuarter,
	quarterStart,
	change,
	forecast,
	previousAverages,
	toMonths,
	paidTo,
	backerHistory,
	backerStatus,
	recurringChanges,
	categoriesByMonth,
	categoryName,
	flowGraph,
	forecastDates,
	passesOn,
	lastMonthKeys,
	toContributions,
	othersBySize,
	waffleCells,
	topAccounts,
	toPayouts,
	toTransfers,
	transactionsUrl,
	oneOffSummary,
	withRecurringIncome,
	type Month,
	type TimeSeriesNode
} from './financials';

const node = (month: string, value: number): TimeSeriesNode => ({
	date: `${month}-01T00:00:00.000Z`,
	amount: { value }
});

const month = (key: string, net: number, balance: number, partial = false): Month => ({
	key,
	income: Math.max(net, 0),
	expenses: Math.max(-net, 0),
	net,
	balance,
	partial
});

describe('toMonths', () => {
	it('merges series, drops empty leading months and fills gaps with 0', () => {
		const months = toMonths({
			balance: [node('2020-08', 0), node('2020-09', 100), node('2020-10', 80), node('2020-11', 80)],
			received: [node('2020-09', 100), node('2020-10', 10)],
			spent: [node('2020-10', 30)],
			now: new Date('2020-11-15T00:00:00Z')
		});

		expect(months).toEqual([
			{ key: '2020-09', income: 100, expenses: 0, net: 100, balance: 100, partial: false },
			{ key: '2020-10', income: 10, expenses: 30, net: -20, balance: 80, partial: false },
			{ key: '2020-11', income: 0, expenses: 0, net: 0, balance: 80, partial: true }
		]);
	});

	it('returns nothing for a collective without money', () => {
		const months = toMonths({
			balance: [node('2020-08', 0)],
			received: [],
			spent: [],
			now: new Date('2020-11-15T00:00:00Z')
		});
		expect(months).toEqual([]);
	});
});

describe('forecast', () => {
	const now = new Date('2026-10-16T00:00:00Z');

	it('averages complete months only and finds when the balance hits 0', () => {
		const months = [
			month('2026-07', -1000, 3000),
			month('2026-08', -1000, 2000),
			month('2026-09', -1000, 1000),
			month('2026-10', -5000, 1000, true)
		];
		const result = forecast({ months, basis: 12, now });

		expect(result.basis).toBe(3);
		expect(result.avgNet).toBe(-1000);
		// 1000 left at 1000 a month is about 30 days.
		expect(result.zeroDate?.toISOString().slice(0, 10)).toBe('2026-11-15');
		expect(result.points.at(0)).toEqual({ date: now, balance: 1000 });
		expect(result.points.at(-1)).toEqual({ date: result.zeroDate, balance: 0 });
	});

	it('uses the last `basis` months', () => {
		const months = [month('2026-07', 5000, 6000), month('2026-08', -1000, 5000)];
		expect(forecast({ months, basis: 1, now }).avgNet).toBe(-1000);
		expect(forecast({ months, basis: 2, now }).avgNet).toBe(2000);
	});

	it('has no zero date when the balance is growing', () => {
		const months = [month('2026-08', 500, 1500), month('2026-09', 500, 2000)];
		const result = forecast({ months, basis: 12, now, horizon: 6 });

		expect(result.zeroDate).toBeNull();
		expect(result.points).toHaveLength(7);
		expect(result.points.at(-1)!.balance).toBeGreaterThan(2000);
	});
});

describe('previousAverages', () => {
	it('averages the window before the latest one, skipping the partial month', () => {
		const months = [
			month('2026-06', 1000, 0),
			month('2026-07', -2000, 0),
			month('2026-08', 3000, 0),
			month('2026-09', -1000, 0),
			month('2026-10', 500, 0, true)
		];
		expect(previousAverages({ months, basis: 2 })).toEqual({ avgIncome: 500, avgExpenses: 1000 });
		expect(previousAverages({ months, basis: 3 })).toBeUndefined();
	});

	it('gives the relative change, or nothing from zero', () => {
		expect(change(1000, 1250)).toBe(0.25);
		expect(change(-1000, -500)).toBe(0.5);
		expect(change(0, 10)).toBeUndefined();
	});
});

describe('transactionsUrl', () => {
	it('filters the transactions page to the whole month in UTC', () => {
		const url = new URL(transactionsUrl({ slug: 'svelte', month: '2026-02' }));
		expect(url.pathname).toBe('/svelte/transactions');
		expect(url.searchParams.get('date[type]')).toBe('BETWEEN');
		expect(url.searchParams.get('date[gte]')).toBe('2026-02-01');
		expect(url.searchParams.get('date[lte]')).toBe('2026-02-28');
		expect(url.searchParams.get('date[tz]')).toBe('UTC');
	});

	it('filters to a range of months', () => {
		const url = new URL(
			transactionsUrl({ slug: 'svelte', between: { from: '2025-11', to: '2026-10' } })
		);
		expect(url.searchParams.get('date[gte]')).toBe('2025-11-01');
		expect(url.searchParams.get('date[lte]')).toBe('2026-10-31');
	});

	it('narrows to one account and kinds of transaction', () => {
		const url = new URL(
			transactionsUrl({ slug: 'svelte', account: 'drips', kinds: ['CONTRIBUTION', 'ADDED_FUNDS'] })
		);
		expect(url.searchParams.get('searchTerm')).toBe('@drips');
		expect(url.searchParams.getAll('kind')).toEqual(['CONTRIBUTION', 'ADDED_FUNDS']);
		expect(url.searchParams.has('date[type]')).toBe(false);
	});
});

describe('toPayouts', () => {
	it('sums payouts per month, payee and category as positive amounts', () => {
		const payout = (createdAt: string, value: number, slug: string) => ({
			createdAt,
			netAmount: { value },
			oppositeAccount: { slug, name: slug.toUpperCase() },
			expense: { type: 'INVOICE', accountingCategory: { name: 'Consultants · Development' } }
		});
		expect(
			toPayouts([
				payout('2026-09-01T10:00:00Z', -100, 'me'),
				payout('2026-09-20T10:00:00Z', -50.5, 'me'),
				payout('2026-09-21T10:00:00Z', -30, 'host'),
				payout('2026-10-01T10:00:00Z', -10, 'me')
			])
		).toEqual([
			{ month: '2026-09', slug: 'me', name: 'ME', category: 'Development', amount: 150.5 },
			{ month: '2026-09', slug: 'host', name: 'HOST', category: 'Development', amount: 30 },
			{ month: '2026-10', slug: 'me', name: 'ME', category: 'Development', amount: 10 }
		]);
	});
});

describe('paidTo', () => {
	it("sums one payee's payouts per month, capped at that month's expenses", () => {
		const paid = paidTo({
			payouts: [
				{ month: '2026-08', slug: 'me', name: 'Me', category: 'Dev', amount: 500 },
				{ month: '2026-09', slug: 'me', name: 'Me', category: 'Dev', amount: 100 },
				{ month: '2026-09', slug: 'me', name: 'Me', category: 'Dev', amount: 50 },
				{ month: '2026-09', slug: 'you', name: 'You', category: 'Dev', amount: 30 }
			],
			slug: 'me',
			months: [month('2026-08', -400, 0), month('2026-09', -200, 0), month('2026-10', 0, 0)]
		});
		expect([...paid]).toEqual([
			['2026-08', 400],
			['2026-09', 150],
			['2026-10', 0]
		]);
	});
});

describe('topAccounts', () => {
	it('ranks payees in the given months and groups the rest', () => {
		const payout = (month: string, slug: string, amount: number) => ({
			month,
			slug,
			name: slug,
			amount
		});
		expect(
			topAccounts({
				rows: [
					payout('2026-08', 'a', 1000),
					payout('2026-09', 'a', 10),
					payout('2026-09', 'b', 50),
					payout('2026-09', 'c', 5),
					payout('2026-09', 'd', 1)
				],
				months: ['2026-09'],
				limit: 2
			})
		).toEqual([
			{ slug: 'b', name: 'b', amount: 50 },
			{ slug: 'a', name: 'a', amount: 10 },
			{ slug: '', name: '2 others', amount: 6 }
		]);
	});
});

describe('waffleCells', () => {
	it('splits 100 squares in proportion and always adds up to 100', () => {
		expect(waffleCells([32053, 11494, 6000, 20550])).toEqual([46, 16, 9, 29]);
		expect(waffleCells([1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
		expect(waffleCells([0, 0])).toEqual([0, 0]);
	});
});

describe('othersBySize', () => {
	it('groups everyone outside the top accounts by how much they gave', () => {
		const backer = (slug: string, amount: number, month = '2026-09') => ({
			month,
			slug,
			name: slug,
			amount
		});
		expect(
			othersBySize({
				rows: [
					backer('top', 9000),
					backer('a', 1500),
					backer('b', 600),
					backer('b', 600),
					backer('c', 250),
					backer('d', 20),
					backer('old', 5000, '2025-01')
				],
				months: ['2026-09'],
				limit: 1
			})
		).toEqual([
			{ min: 1000, max: null, count: 2, amount: 2700 },
			{ min: 100, max: 1000, count: 1, amount: 250 },
			{ min: 0, max: 100, count: 1, amount: 20 }
		]);
	});
});

describe('categoryName', () => {
	it('shortens accounting categories and falls back to the expense type', () => {
		expect(
			categoryName({
				type: 'CHARGE',
				accountingCategory: { name: 'Expenses - Hosting & Subscriptions' }
			})
		).toBe('Hosting & Subscriptions');
		expect(categoryName({ type: 'RECEIPT', accountingCategory: null })).toBe(
			'Uncategorised receipts'
		);
		expect(categoryName(null)).toBe('Uncategorised');
	});
});

describe('categoriesByMonth', () => {
	it('keeps the biggest categories and folds the rest into Other', () => {
		const payout = (month: string, category: string, amount: number) => ({
			month,
			slug: 'x',
			name: 'X',
			category,
			amount
		});
		const result = categoriesByMonth({
			payouts: [
				payout('2026-09', 'Dev', 100),
				payout('2026-09', 'Travel', 30),
				payout('2026-10', 'Hosting', 10),
				payout('2026-10', 'Dev', 50),
				payout('2026-01', 'Travel', 1000)
			],
			months: ['2026-09', '2026-10'],
			limit: 1
		});
		expect(result.categories).toEqual(['Dev', 'Other']);
		expect(result.rows).toEqual([
			{ month: '2026-09', c0: 100, c1: 30 },
			{ month: '2026-10', c0: 50, c1: 10 }
		]);
	});
});

describe('toContributions', () => {
	it('splits recurring and one-off income and sums per backer', () => {
		const node = (createdAt: string, value: number, slug: string, frequency: string | null) => ({
			id: crypto.randomUUID(),
			createdAt,
			netAmount: { value },
			fromAccount: { slug, name: slug },
			order: frequency ? { frequency } : null,
			kind: slug === 'company' ? 'BALANCE_TRANSFER' : 'CONTRIBUTION'
		});
		const result = toContributions([
			node('2026-10-02T00:00:00Z', 5, 'a', 'MONTHLY'),
			node('2026-09-02T00:00:00Z', 5, 'a', 'MONTHLY'),
			node('2026-09-10T00:00:00Z', 100, 'b', 'ONETIME'),
			node('2026-09-12T00:00:00Z', 50, 'host', null),
			node('2026-10-20T00:00:00Z', 300, 'company', null)
		]);
		expect(result.months).toEqual([
			{ month: '2026-09', recurring: 5, oneOff: 150, transferred: 0, steady: 5 },
			{ month: '2026-10', recurring: 5, oneOff: 300, transferred: 300, steady: 5 }
		]);
		expect(topAccounts({ rows: result.backers, limit: 5 })).toEqual([
			{ slug: 'company', name: 'company', amount: 300 },
			{ slug: 'b', name: 'b', amount: 100 },
			{ slug: 'host', name: 'host', amount: 50 },
			{ slug: 'a', name: 'a', amount: 10 }
		]);
	});
});

describe('recurring and one-off income', () => {
	const node = (createdAt: string, value: number, slug: string, frequency: string | null) => ({
		id: crypto.randomUUID(),
		createdAt,
		netAmount: { value },
		fromAccount: { slug, name: slug },
		order: frequency ? { frequency } : null,
		kind: 'CONTRIBUTION'
	});
	const nodes = [
		node('2026-08-05T00:00:00Z', 120, 'yearly', 'YEARLY'),
		node('2026-08-30T00:00:00Z', 50, 'github-sponsors', 'ONETIME'),
		node('2026-09-10T00:00:00Z', 1000, 'big', 'ONETIME'),
		node('2026-10-01T00:00:00Z', 30, 'small', null)
	];
	const channels = new Set(['github-sponsors']);

	it('counts channels as recurring and spreads yearly contributions up to the newest month', () => {
		expect(toContributions(nodes, channels).months).toEqual([
			{ month: '2026-08', recurring: 170, oneOff: 0, transferred: 0, steady: 60 },
			{ month: '2026-09', recurring: 0, oneOff: 1000, transferred: 0, steady: 10 },
			{ month: '2026-10', recurring: 0, oneOff: 30, transferred: 0, steady: 10 }
		]);
	});

	it('sums the one-offs in the months asked for and finds the largest', () => {
		expect(oneOffSummary({ nodes, months: ['2026-09', '2026-10'], channels })).toEqual({
			total: 1030,
			count: 2,
			largest: { name: 'big', amount: 1000, month: '2026-09' }
		});
		expect(oneOffSummary({ nodes, months: ['2026-08'], channels })).toEqual({
			total: 0,
			count: 0,
			largest: null
		});
	});

	it("swaps each month's income for its recurring income", () => {
		const month = (key: string, income: number, expenses: number) => ({
			key,
			income,
			expenses,
			net: income - expenses,
			balance: 0,
			partial: false
		});
		const { months: contributions } = toContributions(nodes, channels);
		expect(
			withRecurringIncome({
				months: [month('2026-07', 0, 5), month('2026-09', 1000, 20)],
				contributions
			})
		).toEqual([month('2026-07', 0, 5), month('2026-09', 10, 20)]);
	});
});

describe('quarters', () => {
	it('finds the first month of a quarter', () => {
		expect(['2026-01', '2026-03', '2026-04', '2026-08', '2026-12'].map(quarterStart)).toEqual([
			'2026-01',
			'2026-01',
			'2026-04',
			'2026-07',
			'2026-10'
		]);
	});

	it('sums cells per quarter and account', () => {
		const cell = (month: string, slug: string, amount: number) => ({
			month,
			slug,
			name: slug,
			amount
		});
		expect(
			byQuarter([
				cell('2026-07', 'a', 10),
				cell('2026-09', 'a', 5),
				cell('2026-08', 'b', 1),
				cell('2026-10', 'a', 2)
			])
		).toEqual([cell('2026-07', 'a', 15), cell('2026-07', 'b', 1), cell('2026-10', 'a', 2)]);
	});
});

describe('lastMonthKeys', () => {
	it('counts back across a year boundary', () => {
		expect(lastMonthKeys(new Date('2026-02-15T00:00:00Z'), 3)).toEqual([
			'2025-12',
			'2026-01',
			'2026-02'
		]);
	});
});

describe('forecastDates', () => {
	it('starts now and ends each month after', () => {
		const now = new Date('2026-07-15T00:00:00Z');
		expect(forecastDates({ now, horizon: 2 })).toEqual([
			now,
			new Date('2026-07-31T23:59:59.999Z'),
			new Date('2026-08-31T23:59:59.999Z')
		]);
	});
});

describe('backerHistory', () => {
	it('tracks first and latest contribution, and the latest frequency and amount', () => {
		const node = (createdAt: string, frequency: string | null, value = 5) => ({
			id: crypto.randomUUID(),
			createdAt,
			netAmount: { value },
			fromAccount: { slug: 'a', name: 'A' },
			order: frequency ? { frequency } : null,
			kind: frequency ? 'CONTRIBUTION' : 'BALANCE_TRANSFER'
		});
		const history = backerHistory([
			node('2026-10-01T00:00:00Z', 'MONTHLY', 190),
			node('2024-01-01T00:00:00Z', 'ONETIME', 1000),
			node('2026-09-01T00:00:00Z', 'MONTHLY', 95)
		]);
		expect(history.get('a')).toEqual({
			first: '2024-01-01T00:00:00Z',
			last: '2026-10-01T00:00:00Z',
			contributions: 3,
			frequency: 'MONTHLY',
			lastAmount: 190,
			lastTransfer: false
		});
		expect(backerHistory([node('2026-10-01T00:00:00Z', null, 300)]).get('a')?.lastTransfer).toBe(
			true
		);
	});
});

describe('backerStatus', () => {
	const now = new Date('2026-10-16T00:00:00Z');
	it('counts a recurring backer as stopped once a payment is overdue', () => {
		expect(backerStatus({ frequency: 'MONTHLY', last: '2026-10-01T00:00:00Z', now })).toBe(
			'Monthly'
		);
		expect(backerStatus({ frequency: 'MONTHLY', last: '2026-06-01T00:00:00Z', now })).toBe(
			'Stopped'
		);
		expect(backerStatus({ frequency: 'YEARLY', last: '2026-01-01T00:00:00Z', now })).toBe('Yearly');
		expect(backerStatus({ frequency: null, last: '2026-10-01T00:00:00Z', now })).toBe('One-off');
	});
});

describe('accountsByMonth', () => {
	const payout = (month: string, slug: string, amount: number) => ({
		month,
		slug,
		name: slug,
		amount
	});

	it('sums each top account per month and groups the rest into one row', () => {
		expect(
			accountsByMonth({
				rows: [
					payout('2026-08', 'a', 100),
					payout('2026-09', 'a', 30),
					payout('2026-09', 'a', 20),
					payout('2026-09', 'b', 5),
					payout('2026-09', 'c', 1),
					payout('2026-07', 'a', 999)
				],
				months: ['2026-08', '2026-09'],
				limit: 1
			})
		).toEqual({
			accounts: [
				{ slug: 'a', name: 'a' },
				{ slug: '', name: '2 others' }
			],
			cells: [
				{ month: '2026-08', slug: 'a', name: 'a', amount: 100 },
				{ month: '2026-09', slug: 'a', name: 'a', amount: 50 },
				{ month: '2026-09', slug: '', name: '2 others', amount: 6 }
			]
		});
	});

	it('leaves out months where an account was paid nothing overall', () => {
		expect(
			accountsByMonth({
				rows: [payout('2026-09', 'a', 10), payout('2026-09', 'a', -10)],
				months: ['2026-09'],
				limit: 5
			}).cells
		).toEqual([]);
	});
});

describe('recurringChanges', () => {
	const node = (slug: string, createdAt: string, frequency: string | null = 'MONTHLY') => ({
		id: crypto.randomUUID(),
		createdAt,
		netAmount: { value: 5 },
		fromAccount: { slug, name: slug },
		order: frequency ? { frequency } : null,
		kind: 'CONTRIBUTION'
	});

	it('counts starts, stops once a payment is overdue, and restarts', () => {
		const months = recurringChanges({
			nodes: [
				// Gives monthly, misses April and May, then resumes in June.
				node('a', '2026-01-10T00:00:00Z'),
				node('a', '2026-02-10T00:00:00Z'),
				node('a', '2026-03-10T00:00:00Z'),
				node('a', '2026-06-10T00:00:00Z'),
				node('a', '2026-07-10T00:00:00Z'),
				// Still within a year of its yearly payment.
				node('b', '2026-02-01T00:00:00Z', 'YEARLY'),
				// One-off and skipped backers are left out.
				node('c', '2026-03-01T00:00:00Z', null),
				node('github-sponsors', '2026-03-01T00:00:00Z')
			],
			now: new Date('2026-10-01T00:00:00Z'),
			skip: new Set(['github-sponsors'])
		});
		expect(months).toEqual([
			{ month: '2026-01', started: 1, stopped: 0, active: 1 },
			{ month: '2026-02', started: 1, stopped: 0, active: 2 },
			{ month: '2026-04', started: 0, stopped: 1, active: 1 },
			{ month: '2026-06', started: 1, stopped: 0, active: 2 },
			{ month: '2026-08', started: 0, stopped: 1, active: 1 }
		]);
	});
});

describe('accountName', () => {
	it('names guests with no name "Anonymous" and other nameless accounts "Unknown"', () => {
		expect(accountName({ slug: 'mochajs', name: 'Mocha' })).toBe('Mocha');
		expect(accountName({ slug: 'guest-a3c3ba7a', name: '' })).toBe('Anonymous');
		expect(accountName({ slug: 'someone', name: '' })).toBe('Unknown');
		expect(accountName(null)).toBe('Unknown');
	});
});

describe('toTransfers', () => {
	it('sums what each collective was given per month', () => {
		const transfer = (createdAt: string, value: number, slug: string) => ({
			createdAt,
			netAmount: { value },
			oppositeAccount: { slug, name: slug.toUpperCase() }
		});
		expect(
			toTransfers([
				transfer('2026-10-08T09:00:00Z', -35000, 'vite'),
				transfer('2026-10-08T09:19:00Z', -1000, 'vite'),
				transfer('2026-10-22T11:00:00Z', -500, 'vuejs')
			])
		).toEqual([
			{ day: '2026-10-08', month: '2026-10', slug: 'vite', name: 'VITE', amount: 36000 },
			{ day: '2026-10-22', month: '2026-10', slug: 'vuejs', name: 'VUEJS', amount: 500 }
		]);
	});
});

describe('passesOn', () => {
	const now = new Date('2026-10-23T00:00:00Z');
	const months = [month('2026-09', -1000, 0), month('2026-10', -1000, 0)];

	it('is true when most spending went to other collectives', () => {
		const transfers = [{ month: '2026-10', slug: 'vite', name: 'Vite', amount: 1500 }];
		expect(passesOn({ months, transfers, now })).toBe(true);
	});

	it('is false when most spending was expenses', () => {
		const transfers = [{ month: '2026-10', slug: 'vite', name: 'Vite', amount: 500 }];
		expect(passesOn({ months, transfers, now })).toBe(false);
	});

	it('leaves out transfers from over a year ago', () => {
		const transfers = [{ month: '2024-10', slug: 'vite', name: 'Vite', amount: 5000 }];
		expect(passesOn({ months, transfers, now })).toBe(false);
	});
});

describe('flowGraph', () => {
	const transfers = [
		{ month: '2026-10', slug: 'vite', name: 'Vite', amount: 36000 },
		{ month: '2026-10', slug: 'oxc', name: 'Oxc', amount: 36000 },
		{ month: '2026-10', slug: 'vuejs', name: 'Vue', amount: 500 }
	];

	it('runs from backers through the collective to recipients, expenses and what is kept', () => {
		const graph = flowGraph({
			name: 'Fund',
			backers: [{ slug: 'cloudflare', name: 'Cloudflare', amount: 100000 }],
			income: 100000,
			spent: 80000,
			transfers,
			limit: 2,
			keptName: 'Not yet given out'
		});
		expect(graph.links).toEqual([
			{ source: 'in:cloudflare', target: 'collective', value: 100000 },
			{ source: 'collective', target: 'out:vite', value: 36000 },
			{ source: 'collective', target: 'out:oxc', value: 36000 },
			{ source: 'collective', target: 'out:others', value: 500 },
			{ source: 'collective', target: 'out:expenses', value: 7500 },
			{ source: 'collective', target: 'out:kept', value: 20000 }
		]);
		expect(graph.nodes.find((n) => n.id === 'out:kept')?.name).toBe('Not yet given out');
	});

	it('scales backers down to the income when they add up to more', () => {
		const graph = flowGraph({
			name: 'Fund',
			backers: [{ slug: 'cloudflare', name: 'Cloudflare', amount: 320000 }],
			income: 300000,
			spent: 300000,
			transfers: [{ month: '2026-10', slug: 'f', name: 'F', amount: 300000 }],
			limit: 5
		});
		expect(graph.links).toEqual([
			{ source: 'in:cloudflare', target: 'collective', value: 300000 },
			{ source: 'collective', target: 'out:f', value: 300000 }
		]);
	});

	it('follows a recipient that got most of its income from the collective a step further', () => {
		const graph = flowGraph({
			name: 'Cloudflare',
			backers: null,
			income: 300000,
			spent: 300000,
			transfers: [{ month: '2026-10', slug: 'fund', name: 'Fund', amount: 300000 }],
			limit: 5,
			downstream: [
				{
					slug: 'fund',
					received: 300000,
					spent: 150000,
					transfers: [
						{ month: '2026-10', slug: 'vite', name: 'Vite', amount: 100000 },
						{ month: '2026-10', slug: 'oxc', name: 'Oxc', amount: 50000 }
					]
				}
			]
		});
		expect(graph.links.filter((l) => l.source === 'out:fund')).toEqual([
			{ source: 'out:fund', target: 'out:fund>vite', value: 100000 },
			{ source: 'out:fund', target: 'out:fund>oxc', value: 50000 },
			{ source: 'out:fund', target: 'out:fund>kept', value: 150000 }
		]);
	});

	it('scales onward gifts to the share of income that came from the collective', () => {
		const graph = flowGraph({
			name: 'Backer',
			backers: null,
			income: 1000,
			spent: 1000,
			transfers: [{ month: '2026-10', slug: 'fund', name: 'Fund', amount: 1000 }],
			limit: 5,
			downstream: [
				{
					slug: 'fund',
					received: 1600,
					spent: 1200,
					transfers: [{ month: '2026-10', slug: 'vite', name: 'Vite', amount: 800 }]
				}
			]
		});
		expect(graph.links.filter((l) => l.source === 'out:fund')).toEqual([
			{ source: 'out:fund', target: 'out:fund>vite', value: 500 },
			{ source: 'out:fund', target: 'out:fund>expenses', value: 250 },
			{ source: 'out:fund', target: 'out:fund>kept', value: 250 }
		]);
	});

	it('leaves a recipient that gave nothing on where it is', () => {
		const graph = flowGraph({
			name: 'Fund',
			backers: null,
			income: 1000,
			spent: 1000,
			transfers: [{ month: '2026-10', slug: 'oxc', name: 'Oxc', amount: 1000 }],
			limit: 5,
			downstream: [{ slug: 'oxc', received: 1000, spent: 400, transfers: [] }]
		});
		expect(graph.links.some((l) => l.source === 'out:oxc')).toBe(false);
	});

	it('leaves a recipient with mostly other income where it is', () => {
		const graph = flowGraph({
			name: 'Backer',
			backers: null,
			income: 1000,
			spent: 1000,
			transfers: [{ month: '2026-10', slug: 'vite', name: 'Vite', amount: 1000 }],
			limit: 5,
			downstream: [
				{
					slug: 'vite',
					received: 50000,
					spent: 800,
					transfers: [{ month: '2026-10', slug: 'oxc', name: 'Oxc', amount: 800 }]
				}
			]
		});
		expect(graph.links.some((l) => l.source === 'out:vite')).toBe(false);
	});

	it('draws on the earlier balance when more went out than came in', () => {
		const graph = flowGraph({
			name: 'Fund',
			backers: null,
			income: 50000,
			spent: 72500,
			transfers,
			limit: 5
		});
		expect(graph.links[0]).toEqual({ source: 'in:other', target: 'collective', value: 50000 });
		expect(graph.nodes.find((n) => n.id === 'in:other')?.name).toBe('Contributions');
		expect(graph.links.at(-1)).toEqual({
			source: 'in:balance',
			target: 'collective',
			value: 22500
		});
		expect(graph.links.some((l) => l.target === 'out:expenses')).toBe(false);
	});
});
