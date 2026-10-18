import { describe, expect, it } from 'vitest';
import type { Expense } from '#lib/opencollective.remote.js';
import { sortExpenses } from './expenses';

const expense = (id: string, patch: Partial<Expense>): Expense => ({
	id,
	title: id,
	status: 'PAID',
	createdAt: '2026-01-01T00:00:00Z',
	amountInCents: 100,
	currency: 'USD',
	sortCents: 100,
	url: '',
	...patch
});

describe('sortExpenses', () => {
	const expenses = [
		expense('a', { createdAt: '2026-03-01T00:00:00Z', sortCents: 500, status: 'PAID' }),
		expense('b', { createdAt: '2026-01-01T00:00:00Z', sortCents: 900, status: 'PENDING' }),
		expense('c', { createdAt: '2026-02-01T00:00:00Z', sortCents: 100, status: 'APPROVED' })
	];
	const ids = (list: Expense[]) => list.map((e) => e.id);

	it('sorts by date, amount in the collective currency, and status in workflow order', () => {
		expect(ids(sortExpenses({ expenses, key: 'createdAt', descending: true }))).toEqual([
			'a',
			'c',
			'b'
		]);
		expect(ids(sortExpenses({ expenses, key: 'amount', descending: true }))).toEqual([
			'b',
			'a',
			'c'
		]);
		expect(ids(sortExpenses({ expenses, key: 'status', descending: false }))).toEqual([
			'b',
			'c',
			'a'
		]);
	});

	it('sorts titles with numbers in them naturally', () => {
		const titled = [expense('x', { title: 'Item 10' }), expense('y', { title: 'Item 9' })];
		expect(ids(sortExpenses({ expenses: titled, key: 'title', descending: false }))).toEqual([
			'y',
			'x'
		]);
	});
});
