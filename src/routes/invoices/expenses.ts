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
