/** Number and date formatting shared by the collective's charts. */
import { monthEnd } from './financials';

export function moneyFormat(currency: string): Intl.NumberFormat {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
}

export function compactFormat(currency: string): Intl.NumberFormat {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		notation: 'compact',
		maximumFractionDigits: 1
	});
}

const monthYear = new Intl.DateTimeFormat('en', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});
const shortMonthYear = new Intl.DateTimeFormat('en', {
	month: 'short',
	year: '2-digit',
	timeZone: 'UTC'
});

/** "Oct 2026", or "Oct 2026 (so far)" for the month still in progress. */
export function monthLabel({ key, partialKey }: { key: string; partialKey?: string }): string {
	return monthYear.format(monthEnd(key)) + (key === partialKey ? ' (so far)' : '');
}

/**
 * The months on screen as a phrase that finishes "contributed …": "in the last year",
 * "in the last 2 years", or "since Mar 2019" for any other span, like all time.
 */
export function periodPhrase(keys: string[]): string {
	if (keys.length === 12) return 'in the last year';
	if (keys.length === 24) return 'in the last 2 years';
	return keys.length ? `since ${monthYear.format(monthEnd(keys[0]))}` : '';
}

/**
 * The months a band axis labels: every few, counting back from the latest, about six in all. Given
 * as the axis's only ticks, so on a narrow chart its overlap check thins these rather than every
 * month, which would leave mostly unlabelled ones.
 */
export function bandTicks(keys: string[]): string[] {
	const every = Math.max(1, Math.ceil(keys.length / 6));
	return keys.filter((_, index) => (keys.length - 1 - index) % every === 0);
}

/** A band axis label, like "Oct 26". */
export function bandTickLabel(key: string): string {
	return shortMonthYear.format(monthEnd(key));
}
