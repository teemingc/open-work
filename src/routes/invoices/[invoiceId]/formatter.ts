import type { MonthlyInvoice, ManualWorkItem } from '../../../lib/invoice.svelte';
import type { GitHubContribution } from './github';

/**
 * Get the date range for an invoice (custom or default month)
 */
export function getInvoiceDateRange(invoice: MonthlyInvoice): { start: Date; end: Date } {
	const start = invoice.customStartDate
		? new Date(invoice.customStartDate)
		: new Date(invoice.year, invoice.month - 1, 1);
	const end = invoice.customEndDate
		? new Date(invoice.customEndDate)
		: new Date(invoice.year, invoice.month, 0, 23, 59, 59);
	return { start, end };
}

/**
 * Check if a date falls within the invoice date range
 */
export function isWithinInvoiceDateRange(invoice: MonthlyInvoice, dateStr: string): boolean {
	const date = new Date(dateStr);
	const { start, end } = getInvoiceDateRange(invoice);
	return date >= start && date <= end;
}

/**
 * Filter contributions by invoice date range
 */
export function filterContributionsByDateRange(
	invoice: MonthlyInvoice,
	contributions: GitHubContribution[]
): GitHubContribution[] {
	const { start, end } = getInvoiceDateRange(invoice);
	return contributions.filter((c) => {
		const date = new Date(c.date);
		return date >= start && date <= end;
	});
}

/**
 * Filter manual work items by invoice date range
 */
export function filterManualWorkByDateRange(
	invoice: MonthlyInvoice,
	items: ManualWorkItem[]
): ManualWorkItem[] {
	const { start, end } = getInvoiceDateRange(invoice);
	return items.filter((item) => {
		const date = new Date(item.date);
		return date >= start && date <= end;
	});
}

/**
 * Generate OpenCollective-compliant expense title
 */
export function generateExpenseTitle(invoice: MonthlyInvoice): string {
	const { start, end } = getInvoiceDateRange(invoice);
	if (invoice.customStartDate || invoice.customEndDate) {
		const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		return `Maintenance and Development (${startStr} - ${endStr})`;
	}
	const monthName = new Date(invoice.year, invoice.month - 1).toLocaleString('en-US', {
		month: '2-digit'
	});
	return `Maintenance and Development (${monthName}/${invoice.year})`;
}

/**
 * Generate OpenCollective-compliant expense description
 */
export function generateExpenseDescription(
	invoice: MonthlyInvoice,
	hourlyRate?: number,
	currency = 'USD'
): string {
	const totalHours = calculateTotalHours(invoice);
	const { start, end } = getInvoiceDateRange(invoice);
	
	let dateDescription: string;
	if (invoice.customStartDate || invoice.customEndDate) {
		const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		dateDescription = `${startStr} - ${endStr}`;
	} else {
		const monthName = new Date(invoice.year, invoice.month - 1).toLocaleString('en-US', {
			month: 'long'
		});
		dateDescription = `${monthName} ${invoice.year}`;
	}

	let description = `Contributions to Svelte ecosystem in ${dateDescription}`;

	// Add hours and amount if available
	if (totalHours > 0) {
		description += ` (${totalHours} hours`;
		if (hourlyRate) {
			const amount = calculateTotalAmount(totalHours, hourlyRate);
			if (amount !== undefined) {
				description += `, ${formatCurrency(amount, currency)}`;
			}
		}
		description += ')';
	}
	description += ':\n\n';

	// Filter items by date range
	const filteredContributions = filterContributionsByDateRange(invoice, invoice.githubContributions);
	const filteredManualItems = filterManualWorkByDateRange(invoice, invoice.manualItems);

	// Group GitHub contributions by repository
	const byRepo = groupByRepository(filteredContributions);
	const repoNames = Object.keys(byRepo).sort();

	if (repoNames.length > 0) {
		for (const repo of repoNames) {
			const contributions = byRepo[repo].filter((c) => (c.hours ?? 0) > 0);
			if (contributions.length === 0) continue;

			description += `**${repo}:**\n`;
			for (const contrib of contributions) {
				const hours = contrib.hours ? ` - ${contrib.hours}h` : '';
				const typeLabel = formatContributionType(contrib.type);
				description += `- ${typeLabel}${contrib.title} (${getShortId(contrib)})${hours}\n`;
			}
			description += '\n';
		}
	}

	// Add manual work items
	const manualWithHours = filteredManualItems.filter((i) => i.hours > 0);
	if (manualWithHours.length > 0) {
		description += '**Additional work:**\n';
		for (const item of manualWithHours) {
			description += `- ${formatWorkType(item.type)}: ${item.title} - ${item.hours}h\n`;
		}
		description += '\n';
	}

	// Add supporting links
	const links = collectLinks(invoice);
	if (links.length > 0) {
		description += 'Supporting links:\n';
		for (const link of links) {
			description += `- ${link}\n`;
		}
	}

	return description.trim();
}

/**
 * Group contributions by repository
 */
function groupByRepository(
	contributions: GitHubContribution[]
): Record<string, GitHubContribution[]> {
	const grouped: Record<string, GitHubContribution[]> = {};

	for (const contrib of contributions) {
		if (!grouped[contrib.repository]) {
			grouped[contrib.repository] = [];
		}
		grouped[contrib.repository].push(contrib);
	}

	return grouped;
}

/**
 * Calculate total hours for an invoice (filtered by date range)
 */
export function calculateTotalHours(invoice: MonthlyInvoice): number {
	const filteredContributions = filterContributionsByDateRange(invoice, invoice.githubContributions);
	const filteredManualItems = filterManualWorkByDateRange(invoice, invoice.manualItems);
	
	const githubHours = filteredContributions.reduce((sum, c) => sum + (c.hours || 0), 0);
	const manualHours = filteredManualItems.reduce((sum, i) => sum + i.hours, 0);
	return githubHours + manualHours;
}

/**
 * Calculate total amount from hours and rate
 */
export function calculateTotalAmount(totalHours: number, hourlyRate?: number): number | undefined {
	if (hourlyRate === undefined) return undefined;
	return totalHours * hourlyRate;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
	const symbols: Record<string, string> = {
		USD: '$',
		EUR: '€',
		GBP: '£',
		CAD: 'CA$',
		AUD: 'A$'
	};

	const symbol = symbols[currency] || currency;
	const formatted = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	}).format(amount);

	return `${symbol}${formatted} ${currency}`;
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(current: number, goal?: number): number {
	if (!goal || goal === 0) return 0;
	return Math.round((current / goal) * 100);
}

/**
 * Calculate hours needed per remaining day to meet goal
 */
export function calculateDailyPace(
	currentHours: number,
	goalHours: number,
	daysInMonth: number,
	currentDay: number
): number {
	const remainingDays = daysInMonth - currentDay;
	if (remainingDays <= 0) return 0;

	const remainingHours = Math.max(0, goalHours - currentHours);
	return remainingHours / remainingDays;
}

/**
 * Get progress status based on pace
 */
export function getProgressStatus(
	currentHours: number,
	goalHours: number | undefined,
	daysElapsed: number,
	daysInMonth: number
): 'ahead' | 'on-track' | 'behind' | 'way-behind' | 'no-goal' {
	if (!goalHours) return 'no-goal';

	const expectedProgress = (daysElapsed / daysInMonth) * goalHours;
	const percentOfExpected = (currentHours / expectedProgress) * 100;

	if (percentOfExpected >= 110) return 'ahead';
	if (percentOfExpected >= 90) return 'on-track';
	if (percentOfExpected >= 70) return 'behind';
	return 'way-behind';
}

/**
 * Compare to last month's invoice
 */
export function compareToLastMonth(
	currentInvoice: MonthlyInvoice,
	previousInvoice?: MonthlyInvoice
): { hoursDiff: number; percentChange: number } {
	const currentHours = calculateTotalHours(currentInvoice);

	if (!previousInvoice) {
		return { hoursDiff: currentHours, percentChange: 0 };
	}

	const previousHours = calculateTotalHours(previousInvoice);
	const hoursDiff = currentHours - previousHours;
	const percentChange = previousHours > 0 ? (hoursDiff / previousHours) * 100 : 0;

	return { hoursDiff, percentChange };
}

/**
 * Format work type with readable label
 */
export function formatWorkType(type: ManualWorkItem['type']): string {
	const labels: Record<ManualWorkItem['type'], string> = {
		experimentation: 'Experimentation',
		investigation: 'Investigation',
		meeting: 'Meeting',
		research: 'Research',
		maintenance: 'Maintenance',
		triage: 'Triage',
		support: 'Support',
		other: 'Other'
	};
	return labels[type];
}

/**
 * Format contribution type for display
 */
function formatContributionType(type: GitHubContribution['type']): string {
	const labels: Record<GitHubContribution['type'], string> = {
		pr: '',
		commit: '',
		issue: '',
		review: 'Reviewed: ',
		discussion: 'Discussed: '
	};
	return labels[type];
}

/**
 * Get short ID from contribution for display
 */
function getShortId(contrib: GitHubContribution): string {
	if (contrib.type === 'pr') {
		return `#${contrib.id.replace('pr-', '')}`;
	}
	if (contrib.type === 'commit') {
		const sha = contrib.id.replace('commit-', '');
		return sha.substring(0, 7);
	}
	if (contrib.type === 'issue') {
		return `#${contrib.id.replace('issue-', '')}`;
	}
	return contrib.id;
}

/**
 * Collect all links from an invoice
 */
function collectLinks(invoice: MonthlyInvoice): string[] {
	const links = new Set<string>();

	// Add GitHub contribution links
	for (const contrib of invoice.githubContributions) {
		if ((contrib.hours ?? 0) > 0) {
			links.add(contrib.url);
		}
	}

	// Add manual work links
	for (const item of invoice.manualItems) {
		if (item.links) {
			for (const link of item.links) {
				links.add(link);
			}
		}
	}

	return Array.from(links).sort();
}

/**
 * Get days in month
 */
export function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

/**
 * Get current day of month
 */
export function getCurrentDay(): number {
	return new Date().getDate();
}
