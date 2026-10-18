import { periodFromTitle } from '#lib/format.js';
import type { Expense } from '#lib/opencollective.remote.js';

/** Statuses that mean the expense will not be paid, so its period still needs invoicing. */
const DEAD_STATUSES = new Set(['REJECTED', 'SPAM', 'CANCELED', 'INVITE_DECLINED']);

export function isDead(status: string): boolean {
	return DEAD_STATUSES.has(status);
}

export function statusLabel(status: string): string {
	if (status === 'SCHEDULED_FOR_PAYMENT') return 'Scheduled';
	if (status === 'INVITE_DECLINED') return 'Declined';
	const words = status.toLowerCase().replaceAll('_', ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The end of the latest period already invoiced, read from expense titles. */
export function lastInvoicedEnd(expenses: Expense[]): string | undefined {
	let latest: string | undefined;
	for (const expense of expenses) {
		if (isDead(expense.status)) continue;
		const end = periodFromTitle(expense.title)?.endDate;
		if (end && (!latest || end > latest)) latest = end;
	}
	return latest;
}

/** Statuses in the order an expense moves through them, for sorting. */
const STATUS_ORDER = [
	'DRAFT',
	'UNVERIFIED',
	'INCOMPLETE',
	'PENDING',
	'APPROVED',
	'SCHEDULED_FOR_PAYMENT',
	'PROCESSING',
	'PAID',
	'ERROR',
	'REJECTED',
	'CANCELED',
	'INVITE_DECLINED',
	'SPAM'
];

export type ExpenseSortKey = 'title' | 'createdAt' | 'amount' | 'status';

export function sortExpenses({
	expenses,
	key,
	descending
}: {
	expenses: Expense[];
	key: ExpenseSortKey;
	descending: boolean;
}): Expense[] {
	const rank = (status: string) => {
		const index = STATUS_ORDER.indexOf(status);
		return index === -1 ? STATUS_ORDER.length : index;
	};
	const compare = (a: Expense, b: Expense): number => {
		switch (key) {
			case 'title':
				return a.title.localeCompare(b.title, undefined, { numeric: true });
			case 'createdAt':
				return a.createdAt.localeCompare(b.createdAt);
			case 'amount':
				return a.sortCents - b.sortCents;
			case 'status':
				return rank(a.status) - rank(b.status);
		}
	};
	// Newest first breaks ties, whichever way the column is sorted.
	return [...expenses].sort(
		(a, b) =>
			(descending ? -compare(a, b) : compare(a, b)) || b.createdAt.localeCompare(a.createdAt)
	);
}
