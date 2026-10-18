/** Pure helpers that turn Open Collective's monthly stats into chart rows and a runway forecast. */

export interface TimeSeriesNode {
	date: string;
	amount: { value: number };
}

export interface Month {
	/** YYYY-MM */
	key: string;
	/** Received, after host and payment processor fees. */
	income: number;
	/** Spent, including payment processor fees. */
	expenses: number;
	net: number;
	/** Balance at the end of the month, or now for the current month. */
	balance: number;
	/** The current month, which is still in progress. */
	partial: boolean;
}

/** An expense the collective paid out, as Open Collective's transactions report it. */
export interface PayoutNode {
	createdAt: string;
	/** Negative, and includes payment processor fees. */
	netAmount: { value: number };
	oppositeAccount: { slug: string; name: string } | null;
	expense: { type: string; accountingCategory: { name: string } | null } | null;
}

/** Money between the collective and one account in one month. */
export interface AccountMonth {
	/** YYYY-MM */
	month: string;
	slug: string;
	name: string;
	amount: number;
}

/** What the collective paid one account for one category in one month. */
export interface Payout extends AccountMonth {
	category: string;
}

/** A contribution to the collective, as Open Collective's transactions report it. */
export interface ContributionNode {
	createdAt: string;
	/** After host and payment processor fees. */
	netAmount: { value: number };
	fromAccount: { slug: string; name: string } | null;
	order: { frequency: string | null } | null;
}

/** An expense that is approved or awaiting approval but not paid yet. */
export interface Unpaid {
	slug: string;
	amount: number;
	/** Approved (or scheduled or processing) expenses are committed; pending ones are not. */
	approved: boolean;
}

export interface Forecast {
	/** Number of complete months the averages are based on. */
	basis: number;
	avgIncome: number;
	avgExpenses: number;
	avgNet: number;
	/** When the balance reaches 0 at the average net rate, or null if it is not shrinking. */
	zeroDate: Date | null;
	/** Projected balance at the end of each future month, until it reaches 0 or `horizon` months. */
	points: { date: Date; balance: number }[];
}

const DAYS_PER_MONTH = 365.25 / 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const monthKey = (iso: string) => iso.slice(0, 7);

function byMonth(nodes: TimeSeriesNode[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const node of nodes) {
		const key = monthKey(node.date);
		map.set(key, (map.get(key) ?? 0) + node.amount.value);
	}
	return map;
}

/** Last moment of the month `key` (YYYY-MM), in UTC. */
export function monthEnd(key: string): Date {
	const [year, month] = key.split('-').map(Number);
	return new Date(Date.UTC(year, month, 1) - 1);
}

function nextMonthKey(key: string): string {
	return new Date(monthEnd(key).getTime() + 1).toISOString().slice(0, 7);
}

/**
 * Merge the three time series into one row per month. Months before the collective
 * had any money are dropped, and months without activity count as 0.
 */
export function toMonths({
	balance,
	received,
	spent,
	now
}: {
	balance: TimeSeriesNode[];
	received: TimeSeriesNode[];
	spent: TimeSeriesNode[];
	now: Date;
}): Month[] {
	const balances = byMonth(balance);
	const incomes = byMonth(received);
	const expenses = byMonth(spent);
	const current = now.toISOString().slice(0, 7);

	const keys = [...new Set([...balances.keys(), ...incomes.keys(), ...expenses.keys()])].sort();
	const first = keys.findIndex(
		(key) => (balances.get(key) ?? 0) !== 0 || incomes.has(key) || expenses.has(key)
	);
	if (first === -1) return [];

	let lastBalance = 0;
	return keys.slice(first).map((key) => {
		const income = incomes.get(key) ?? 0;
		const spentInMonth = expenses.get(key) ?? 0;
		lastBalance = balances.get(key) ?? lastBalance + income - spentInMonth;
		return {
			key,
			income,
			expenses: spentInMonth,
			net: income - spentInMonth,
			balance: lastBalance,
			partial: key === current
		};
	});
}

const TYPE_CATEGORIES: Record<string, string> = {
	INVOICE: 'Uncategorised invoices',
	RECEIPT: 'Uncategorised receipts',
	CHARGE: 'Card charges',
	GRANT: 'Grants'
};

/** A short category name, such as "Hosting & Subscriptions" from "Expenses - Hosting & Subscriptions". */
export function categoryName(expense: PayoutNode['expense']): string {
	const name = expense?.accountingCategory?.name;
	if (name) return name.split(/ · | - /).at(-1) ?? name;
	return TYPE_CATEGORIES[expense?.type ?? ''] ?? 'Uncategorised';
}

/** Sum payouts per month, payee and category. */
export function toPayouts(nodes: PayoutNode[]): Payout[] {
	const payouts = new Map<string, Payout>();
	for (const node of nodes) {
		const month = monthKey(node.createdAt);
		const slug = node.oppositeAccount?.slug ?? '';
		const category = categoryName(node.expense);
		const id = `${month} ${slug} ${category}`;
		const payout = payouts.get(id) ?? {
			month,
			slug,
			name: node.oppositeAccount?.name ?? 'Unknown',
			category,
			amount: 0
		};
		payout.amount -= node.netAmount.value;
		payouts.set(id, payout);
	}
	return [...payouts.values()];
}

/** Contributions per month: what recurring and one-off contributions brought in. */
export interface ContributionMonth {
	month: string;
	recurring: number;
	oneOff: number;
}

/** Sum contributions per month by frequency, and per month and backer. */
export function toContributions(nodes: ContributionNode[]): {
	months: ContributionMonth[];
	backers: AccountMonth[];
} {
	const months = new Map<string, ContributionMonth>();
	const backers = new Map<string, AccountMonth>();
	for (const node of nodes) {
		const month = monthKey(node.createdAt);
		const amount = node.netAmount.value;
		const row = months.get(month) ?? { month, recurring: 0, oneOff: 0 };
		const frequency = node.order?.frequency;
		if (frequency === 'MONTHLY' || frequency === 'YEARLY') row.recurring += amount;
		else row.oneOff += amount;
		months.set(month, row);

		const slug = node.fromAccount?.slug ?? '';
		const id = `${month} ${slug}`;
		const backer = backers.get(id) ?? {
			month,
			slug,
			name: node.fromAccount?.name ?? 'Unknown',
			amount: 0
		};
		backer.amount += amount;
		backers.set(id, backer);
	}
	return {
		months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
		backers: [...backers.values()]
	};
}

/** When a backer contributed and how often they were set to give. */
export interface BackerHistory {
	/** ISO date of the first contribution. */
	first: string;
	/** ISO date of the latest contribution. */
	last: string;
	contributions: number;
	/** The frequency of the latest contribution, or null for one-off contributions and added funds. */
	frequency: 'MONTHLY' | 'YEARLY' | null;
	/** What the latest contribution brought in, after fees. For a recurring backer, what each one gives. */
	lastAmount: number;
}

export function backerHistory(nodes: ContributionNode[]): Map<string, BackerHistory> {
	const history = new Map<string, BackerHistory>();
	for (const node of nodes) {
		const slug = node.fromAccount?.slug ?? '';
		const frequency = node.order?.frequency;
		const recurring = frequency === 'MONTHLY' || frequency === 'YEARLY' ? frequency : null;
		const backer = history.get(slug);
		if (!backer) {
			history.set(slug, {
				first: node.createdAt,
				last: node.createdAt,
				contributions: 1,
				frequency: recurring,
				lastAmount: node.netAmount.value
			});
			continue;
		}
		backer.contributions++;
		if (node.createdAt < backer.first) backer.first = node.createdAt;
		if (node.createdAt > backer.last) {
			backer.last = node.createdAt;
			backer.frequency = recurring;
			backer.lastAmount = node.netAmount.value;
		}
	}
	return history;
}

/** Whether a backer still gives: a recurring contribution counts as stopped once a payment is overdue. */
export function backerStatus({
	frequency,
	last,
	now
}: Pick<BackerHistory, 'frequency' | 'last'> & { now: Date }):
	'Monthly' | 'Yearly' | 'Stopped' | 'One-off' {
	if (!frequency) return 'One-off';
	const days = (now.getTime() - new Date(last).getTime()) / DAY_MS;
	if (frequency === 'MONTHLY') return days <= 45 ? 'Monthly' : 'Stopped';
	return days <= 380 ? 'Yearly' : 'Stopped';
}

/** The `count` month keys up to and including the month of `now`, oldest first. */
export function lastMonthKeys(now: Date, count: number): string[] {
	const keys: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
		keys.push(date.toISOString().slice(0, 7));
	}
	return keys;
}

/**
 * Payouts in `months` per month for the `limit` biggest categories, with the rest in "Other".
 * Rows use the keys `c0`, `c1`, … in the order of `categories`.
 */
export function categoriesByMonth({
	payouts,
	months,
	limit
}: {
	payouts: Payout[];
	months: string[];
	limit: number;
}): { categories: string[]; rows: ({ month: string } & Record<string, number | string>)[] } {
	const keys = new Set(months);
	const totals = new Map<string, number>();
	for (const payout of payouts) {
		if (!keys.has(payout.month)) continue;
		totals.set(payout.category, (totals.get(payout.category) ?? 0) + payout.amount);
	}
	const sorted = [...totals].sort(([, a], [, b]) => b - a).map(([category]) => category);
	const categories = sorted.length > limit ? [...sorted.slice(0, limit), 'Other'] : sorted;
	const index = (category: string) => {
		const i = categories.indexOf(category);
		return i === -1 ? categories.length - 1 : i;
	};

	const rows = months.map((month) => {
		const row: { month: string } & Record<string, number | string> = { month };
		categories.forEach((_, i) => (row[`c${i}`] = 0));
		return row;
	});
	const byMonth = new Map(rows.map((row) => [row.month, row]));
	for (const payout of payouts) {
		const row = byMonth.get(payout.month);
		if (!row) continue;
		const key = `c${index(payout.category)}`;
		row[key] = Math.round((row[key] as number) + payout.amount);
	}
	return { categories, rows };
}

/** What the collective paid `slug` each month, capped at that month's expenses. */
export function paidTo({
	payouts,
	slug,
	months
}: {
	payouts: Payout[];
	slug: string | undefined;
	months: Month[];
}): Map<string, number> {
	const paid = new Map<string, number>();
	for (const payout of payouts) {
		if (payout.slug !== slug) continue;
		paid.set(payout.month, (paid.get(payout.month) ?? 0) + payout.amount);
	}
	for (const m of months) paid.set(m.key, Math.min(paid.get(m.key) ?? 0, m.expenses));
	return paid;
}

/**
 * The accounts with the most money in `months` (all months if omitted), biggest first.
 * Everyone past `limit` is summed into one row with an empty slug.
 */
/** Each account's total in the given months, biggest first. */
function accountTotals({
	rows,
	months
}: {
	rows: AccountMonth[];
	months?: string[];
}): { slug: string; name: string; amount: number }[] {
	const keys = months && new Set(months);
	const bySlug = new Map<string, { slug: string; name: string; amount: number }>();
	for (const row of rows) {
		if (keys && !keys.has(row.month)) continue;
		const account = bySlug.get(row.slug) ?? { slug: row.slug, name: row.name, amount: 0 };
		account.amount += row.amount;
		bySlug.set(row.slug, account);
	}
	return [...bySlug.values()].sort((a, b) => b.amount - a.amount);
}

export function topAccounts({
	rows,
	months,
	limit
}: {
	rows: AccountMonth[];
	months?: string[];
	limit: number;
}): { slug: string; name: string; amount: number }[] {
	const sorted = accountTotals({ rows, months });
	const rest = sorted.slice(limit);
	if (rest.length === 0) return sorted;
	return [
		...sorted.slice(0, limit),
		{
			slug: '',
			name: `${rest.length} others`,
			amount: rest.reduce((sum, payee) => sum + payee.amount, 0)
		}
	];
}

/**
 * Split `cells` squares between the values in proportion, rounding so they still add up to
 * `cells`: the largest remainders get the leftover squares.
 */
export function waffleCells(values: number[], cells = 100): number[] {
	const total = values.reduce((sum, value) => sum + value, 0);
	if (total <= 0) return values.map(() => 0);
	const exact = values.map((value) => (value / total) * cells);
	const counts = exact.map(Math.floor);
	let left = cells - counts.reduce((sum, count) => sum + count, 0);
	const byRemainder = exact
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder);
	for (const { index } of byRemainder) {
		if (left <= 0) break;
		counts[index]++;
		left--;
	}
	return counts;
}

export interface SizeTier {
	/** The smallest total in the tier. */
	min: number;
	/** Where the next tier up starts, or null for the top tier. */
	max: number | null;
	count: number;
	amount: number;
}

const TIER_MINIMUMS = [1000, 100, 0];

/**
 * The accounts outside the top `limit`, grouped by how much each gave in total, so the "others"
 * row can show its make-up without sending every account to the page.
 */
export function othersBySize({
	rows,
	months,
	limit
}: {
	rows: AccountMonth[];
	months?: string[];
	limit: number;
}): SizeTier[] {
	const tiers = TIER_MINIMUMS.map((min, index) => ({
		min,
		max: index === 0 ? null : TIER_MINIMUMS[index - 1],
		count: 0,
		amount: 0
	}));
	for (const account of accountTotals({ rows, months }).slice(limit)) {
		const tier = tiers.find((t) => account.amount >= t.min) ?? tiers[tiers.length - 1];
		tier.count++;
		tier.amount += account.amount;
	}
	return tiers.filter((tier) => tier.count > 0);
}

/**
 * Project the balance forward using the average of the last `basis` complete months.
 * The projection starts at `now` from `start`, or from the latest balance.
 */
export function forecast({
	months,
	basis,
	now,
	start,
	horizon = 120
}: {
	months: Month[];
	basis: number;
	now: Date;
	start?: number;
	horizon?: number;
}): Forecast {
	const complete = months.filter((m) => !m.partial).slice(-basis);
	const count = complete.length;
	const sum = (pick: (m: Month) => number) => complete.reduce((total, m) => total + pick(m), 0);
	const avgIncome = count ? sum((m) => m.income) / count : 0;
	const avgExpenses = count ? sum((m) => m.expenses) / count : 0;
	const avgNet = avgIncome - avgExpenses;

	const latest = months.at(-1);
	const balance = start ?? latest?.balance ?? 0;
	const perDay = avgNet / DAYS_PER_MONTH;

	const zeroDate =
		latest && avgNet < 0 && balance > 0
			? new Date(now.getTime() + (balance / -perDay) * DAY_MS)
			: null;

	const points: Forecast['points'] = [];
	if (latest) {
		points.push({ date: now, balance });
		let key = now.toISOString().slice(0, 7);
		for (let i = 0; i < horizon; i++) {
			const end = monthEnd(key);
			if (zeroDate && end >= zeroDate) {
				points.push({ date: zeroDate, balance: 0 });
				break;
			}
			const days = (end.getTime() - now.getTime()) / DAY_MS;
			points.push({ date: end, balance: balance + perDay * days });
			key = nextMonthKey(key);
		}
	}

	return { basis: count, avgIncome, avgExpenses, avgNet, zeroDate, points };
}

/**
 * Average income and expenses over the `basis` complete months before the latest `basis`, to
 * show how the current averages have moved. Undefined when there is no full earlier window.
 */
export function previousAverages({
	months,
	basis
}: {
	months: Month[];
	basis: number;
}): { avgIncome: number; avgExpenses: number } | undefined {
	const complete = months.filter((m) => !m.partial);
	const earlier = complete.slice(-2 * basis, -basis);
	if (basis <= 0 || earlier.length < basis) return undefined;
	const average = (pick: (m: Month) => number) =>
		earlier.reduce((total, m) => total + pick(m), 0) / earlier.length;
	return { avgIncome: average((m) => m.income), avgExpenses: average((m) => m.expenses) };
}

/** Relative change from `before` to `after`, or undefined when there is nothing to compare. */
export function change(before: number, after: number): number | undefined {
	return before === 0 ? undefined : (after - before) / Math.abs(before);
}

/** Whole months from `from` to `to`, rounded down. */
export function monthsBetween(from: Date, to: Date): number {
	return Math.floor((to.getTime() - from.getTime()) / DAY_MS / DAYS_PER_MONTH);
}

/** The collective's public transactions page, filtered to the month `key` (YYYY-MM) in UTC. */
export function transactionsUrl({
	slug,
	month,
	between,
	account,
	kinds = []
}: {
	slug: string;
	/** YYYY-MM, in UTC. */
	month?: string;
	/** A range of months, YYYY-MM in UTC, both included. Ignored when `month` is given. */
	between?: { from: string; to: string };
	/** Only transactions with this account. */
	account?: string;
	/** Such as EXPENSE or CONTRIBUTION. */
	kinds?: string[];
}): string {
	const params = new URLSearchParams();
	const range = month ? { from: month, to: month } : between;
	if (range) {
		params.set('date[type]', 'BETWEEN');
		params.set('date[gte]', `${range.from}-01`);
		params.set('date[lte]', monthEnd(range.to).toISOString().slice(0, 10));
		params.set('date[tz]', 'UTC');
	}
	// The page has no account filter, but its search matches "@slug" against the other account.
	if (account) params.set('searchTerm', `@${account}`);
	for (const kind of kinds) params.append('kind', kind);
	return `https://opencollective.com/${slug}/transactions?${params}`;
}

/**
 * The lowest and highest projected balance at each of `dates`, across forecasts based on
 * each of `bases`. Balances stop at 0.
 */
export function forecastRange({
	months,
	bases,
	now,
	start,
	dates
}: {
	months: Month[];
	bases: number[];
	now: Date;
	start: number;
	dates: Date[];
}): { date: Date; low: number; high: number }[] {
	const perDay = bases.map((basis) => forecast({ months, basis, now }).avgNet / DAYS_PER_MONTH);
	return dates.map((date) => {
		const days = (date.getTime() - now.getTime()) / DAY_MS;
		const values = perDay.map((rate) => Math.max(0, start + rate * days));
		return { date, low: Math.min(...values), high: Math.max(...values) };
	});
}
