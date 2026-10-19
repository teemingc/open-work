/** Pure helpers for dates, invoice text and the work log. No browser or storage access. */

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Parse a YYYY-MM-DD string as a local date (no timezone shift). */
export function parseIsoDate(iso: string): Date {
	const [year, month, day] = iso.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/** Format a local date as YYYY-MM-DD. */
export function toIsoDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatDMY(iso: string): string {
	const [year, month, day] = iso.split('-');
	return `${day}/${month}/${year}`;
}

export function ordinal(day: number): string {
	const rem100 = day % 100;
	if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

/** YYYY-MM-DD → "1st October 2026" */
export function formatLongDate(iso: string): string {
	const date = parseIsoDate(iso);
	return `${ordinal(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function addDays(iso: string, days: number): string {
	const date = parseIsoDate(iso);
	date.setDate(date.getDate() + days);
	return toIsoDate(date);
}

/** Invoices run 1st–15th and 16th–end of month. */
export function endOfPeriod(startIso: string): string {
	const start = parseIsoDate(startIso);
	if (start.getDate() <= 15) {
		return toIsoDate(new Date(start.getFullYear(), start.getMonth(), 15));
	}
	return toIsoDate(new Date(start.getFullYear(), start.getMonth() + 1, 0));
}

/**
 * The period to invoice next: the day after the last invoice ended, or, with no
 * invoices yet, the most recent half-month that has finished.
 */
export function nextPeriod({ lastEnd, today = new Date() }: { lastEnd?: string; today?: Date }): {
	startDate: string;
	endDate: string;
} {
	if (lastEnd) {
		const startDate = addDays(lastEnd, 1);
		return { startDate, endDate: endOfPeriod(startDate) };
	}
	if (today.getDate() >= 16) {
		const startDate = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
		return { startDate, endDate: endOfPeriod(startDate) };
	}
	const startDate = toIsoDate(new Date(today.getFullYear(), today.getMonth() - 1, 16));
	return { startDate, endDate: endOfPeriod(startDate) };
}

export function formatMoney(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency}`;
	}
}

export function formatHours(hours: number): string {
	return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '');
}

export function totalCents({ hours, rate }: { hours: number; rate: number }): number {
	return Math.round(hours * rate * 100);
}

export function invoiceTitle({
	startDate,
	endDate
}: {
	startDate: string;
	endDate: string;
}): string {
	return `Maintenance and Development (${formatDMY(startDate)}-${formatDMY(endDate)})`;
}

const TITLE_PERIOD = /(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/;

/** The period an expense covers, read back from a title made by `invoiceTitle`. */
export function periodFromTitle(title: string): { startDate: string; endDate: string } | undefined {
	const match = TITLE_PERIOD.exec(title);
	if (!match) return undefined;
	const [, d1, m1, y1, d2, m2, y2] = match;
	return { startDate: `${y1}-${m1}-${d1}`, endDate: `${y2}-${m2}-${d2}` };
}

export function lineItemDescription({
	hours,
	rate,
	currency,
	startDate,
	endDate,
	averaged = false
}: {
	hours: number;
	rate: number;
	currency: string;
	startDate: string;
	endDate: string;
	/** The hours were billed at more than one rate, and `rate` is their average. */
	averaged?: boolean;
}): string {
	return `${formatHours(hours)} hours of work from ${formatLongDate(startDate)} to ${formatLongDate(endDate)} at ${averaged ? 'an average rate' : 'a rate'} of ${rate} ${currency} per hour`;
}

/** The note for Open Collective's "Additional invoice information", if there is one. */
export function invoiceInfoText(note: string | undefined): string | undefined {
	return note?.trim() || undefined;
}

/* ---------------------------------- Work log ---------------------------------- */

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** Open Collective stores notes as HTML. */
export function workLogToHtml(text: string): string {
	return text
		.split('\n')
		.map((line) => escapeHtml(line.trimEnd()))
		.join('<br>')
		.trim();
}

/** Split a "a | b | c" line into cells for display. */
export function splitWorkLogLine(line: string): string[] {
	return line.split('|').map((cell) => cell.trim());
}
