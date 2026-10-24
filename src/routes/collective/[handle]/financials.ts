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
	oppositeAccount: { slug: string; name: string; imageUrl?: string | null } | null;
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
	id: string;
	createdAt: string;
	/** After host and payment processor fees. */
	netAmount: { value: number };
	fromAccount: { slug: string; name: string; imageUrl?: string | null } | null;
	order: { frequency: string | null } | null;
	/** CONTRIBUTION, ADDED_FUNDS or BALANCE_TRANSFER. */
	kind: string;
}

/**
 * Money moved from another account's balance on Open Collective, like a company passing on what it
 * holds there. Counted as a one-off contribution, but noted, since it is not a new payment.
 */
const isTransfer = (node: ContributionNode) => node.kind === 'BALANCE_TRANSFER';

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

/**
 * What to call an account. Guests, who give without signing up, can have an empty name, which Open
 * Collective shows as "Guest"; here they are "Anonymous".
 */
export function accountName(account: { slug: string; name: string } | null): string {
	if (account?.name) return account.name;
	return account?.slug.startsWith('guest-') ? 'Anonymous' : 'Unknown';
}

/** Each payee's avatar by slug, for the accounts Open Collective has one for. */
export function accountImages(nodes: PayoutNode[]): Record<string, string> {
	const images: Record<string, string> = {};
	for (const { oppositeAccount: account } of nodes) {
		if (account?.slug && account.imageUrl) images[account.slug] ??= account.imageUrl;
	}
	return images;
}

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
			name: accountName(node.oppositeAccount),
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
	/** The part of `oneOff` moved from other accounts' balances. */
	transferred: number;
	/**
	 * Recurring income as it is earned: a yearly contribution counts a twelfth in each of the 12
	 * months it pays for, so it does not look like a spike in the month it arrives.
	 */
	steady: number;
}

const isRecurring = (node: ContributionNode, channels: Set<string>) =>
	node.order?.frequency === 'MONTHLY' ||
	node.order?.frequency === 'YEARLY' ||
	channels.has(node.fromAccount?.slug ?? '');

/**
 * Sum contributions per month by frequency, and per month and backer. Platforms in `channels`,
 * like GitHub Sponsors, pass on people's monthly sponsorships in batches that Open Collective
 * records as one-off, so they count as recurring.
 */
export function toContributions(
	nodes: ContributionNode[],
	channels = new Set<string>()
): {
	months: ContributionMonth[];
	backers: AccountMonth[];
} {
	const months = new Map<string, ContributionMonth>();
	const backers = new Map<string, AccountMonth>();
	const row = (month: string) => {
		const found = months.get(month) ?? {
			month,
			recurring: 0,
			oneOff: 0,
			transferred: 0,
			steady: 0
		};
		months.set(month, found);
		return found;
	};
	const latest = nodes.reduce((max, node) => {
		const month = monthKey(node.createdAt);
		return month > max ? month : max;
	}, '');
	for (const node of nodes) {
		const month = monthKey(node.createdAt);
		const amount = node.netAmount.value;
		const current = row(month);
		if (isRecurring(node, channels)) {
			current.recurring += amount;
			if (node.order?.frequency === 'YEARLY') {
				// Spread up to the newest month on record; later months have not happened yet.
				let key = month;
				for (let i = 0; i < 12 && key <= latest; i++, key = nextMonthKey(key)) {
					row(key).steady += amount / 12;
				}
			} else {
				current.steady += amount;
			}
		} else {
			current.oneOff += amount;
		}
		if (isTransfer(node)) current.transferred += amount;

		const slug = node.fromAccount?.slug ?? '';
		const id = `${month} ${slug}`;
		const backer = backers.get(id) ?? {
			month,
			slug,
			name: accountName(node.fromAccount),
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

/** One-off contributions over some months: what they added up to, and the biggest. */
export interface OneOffSummary {
	total: number;
	count: number;
	largest: { name: string; amount: number; month: string } | null;
}

/** One-off contributions in `months`, leaving out platforms in `channels`, which count as recurring. */
export function oneOffSummary({
	nodes,
	months,
	channels
}: {
	nodes: ContributionNode[];
	months: string[];
	channels: Set<string>;
}): OneOffSummary {
	const keys = new Set(months);
	const summary: OneOffSummary = { total: 0, count: 0, largest: null };
	for (const node of nodes) {
		const month = monthKey(node.createdAt);
		if (!keys.has(month) || isRecurring(node, channels)) continue;
		const amount = node.netAmount.value;
		summary.total += amount;
		summary.count++;
		if (amount > (summary.largest?.amount ?? 0)) {
			summary.largest = { name: accountName(node.fromAccount), amount, month };
		}
	}
	return summary;
}

/**
 * `months` with income counting recurring contributions alone, so averages and the forecast rest on
 * what backers have promised to keep giving rather than on one-off gifts that may not come again.
 */
export function withRecurringIncome({
	months,
	contributions
}: {
	months: Month[];
	contributions: ContributionMonth[];
}): Month[] {
	const steady = new Map(contributions.map((row) => [row.month, row.steady]));
	return months.map((month) => {
		const income = steady.get(month.key) ?? 0;
		return { ...month, income, net: income - month.expenses };
	});
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
	/** Whether the latest contribution was moved from the backer's balance on Open Collective. */
	lastTransfer: boolean;
	/** Whether any contribution was monthly or yearly, so the backer gave on a schedule at some point. */
	recurring: boolean;
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
				lastAmount: node.netAmount.value,
				lastTransfer: isTransfer(node),
				recurring: recurring !== null
			});
			continue;
		}
		backer.contributions++;
		if (recurring) backer.recurring = true;
		if (node.createdAt < backer.first) backer.first = node.createdAt;
		if (node.createdAt > backer.last) {
			backer.last = node.createdAt;
			backer.frequency = recurring;
			backer.lastAmount = node.netAmount.value;
			backer.lastTransfer = isTransfer(node);
		}
	}
	return history;
}

/** How long after a recurring contribution the next can arrive before the backer counts as stopped. */
const GRACE_DAYS = { MONTHLY: 45, YEARLY: 380 };

/** Whether a backer still gives: a recurring contribution counts as stopped once a payment is overdue. */
export function backerStatus({
	frequency,
	last,
	now
}: Pick<BackerHistory, 'frequency' | 'last'> & { now: Date }):
	'Monthly' | 'Yearly' | 'Stopped' | 'One-off' {
	if (!frequency) return 'One-off';
	const days = (now.getTime() - new Date(last).getTime()) / DAY_MS;
	if (frequency === 'MONTHLY') return days <= GRACE_DAYS.MONTHLY ? 'Monthly' : 'Stopped';
	return days <= GRACE_DAYS.YEARLY ? 'Yearly' : 'Stopped';
}

/** How many backers started or stopped recurring contributions in one month. */
/** A backer as a tooltip names them: their name, and their avatar or logo if they have one. */
export interface Backer {
	slug: string;
	name: string;
	imageUrl: string | null;
}

export interface RecurringChange {
	/** YYYY-MM */
	month: string;
	started: number;
	stopped: number;
	/** Who started and who stopped, in the order they did. */
	startedBy: Backer[];
	stoppedBy: Backer[];
	/** Recurring backers at the end of the month, or now for the current month. */
	active: number;
}

/**
 * Recurring backers who started or stopped each month, and how many gave, oldest first. A backer stops in the month
 * their next payment became overdue, as `backerStatus` decides, and one who resumes after that
 * starts again. One-off contributions are left out, as are backers in `skip`.
 */
export function recurringChanges({
	nodes,
	now,
	skip
}: {
	nodes: ContributionNode[];
	now: Date;
	skip: Set<string>;
}): RecurringChange[] {
	const byBacker = new Map<
		string,
		{ backer: Backer; payments: { at: number; frequency: 'MONTHLY' | 'YEARLY' }[] }
	>();
	for (const node of nodes) {
		const slug = node.fromAccount?.slug;
		const frequency = node.order?.frequency;
		if (!slug || skip.has(slug) || (frequency !== 'MONTHLY' && frequency !== 'YEARLY')) continue;
		const entry = byBacker.get(slug) ?? {
			backer: {
				slug,
				name: accountName(node.fromAccount),
				imageUrl: node.fromAccount?.imageUrl ?? null
			},
			payments: []
		};
		entry.payments.push({ at: Date.parse(node.createdAt), frequency });
		byBacker.set(slug, entry);
	}

	const months = new Map<string, RecurringChange>();
	const count = (at: number, key: 'started' | 'stopped', backer: Backer) => {
		const month = new Date(at).toISOString().slice(0, 7);
		const row = months.get(month) ?? {
			month,
			started: 0,
			stopped: 0,
			startedBy: [],
			stoppedBy: [],
			active: 0
		};
		// Stopping and starting again in the same month changes nothing, so the two cancel out.
		const other = key === 'started' ? 'stoppedBy' : 'startedBy';
		const undone = row[other].indexOf(backer);
		if (undone !== -1) {
			row[other].splice(undone, 1);
			row[key === 'started' ? 'stopped' : 'started']--;
		} else {
			row[key]++;
			row[key === 'started' ? 'startedBy' : 'stoppedBy'].push(backer);
		}
		months.set(month, row);
	};
	for (const { backer, payments } of byBacker.values()) {
		payments.sort((a, b) => a.at - b.at);
		count(payments[0].at, 'started', backer);
		for (const [index, payment] of payments.entries()) {
			const due = payment.at + GRACE_DAYS[payment.frequency] * DAY_MS;
			const next = payments[index + 1];
			if (next && next.at <= due) continue;
			if (due > now.getTime()) continue;
			count(due, 'stopped', backer);
			if (next) count(next.at, 'started', backer);
		}
	}
	// Every start is followed by a stop unless the backer still gives, so the running difference
	// is how many give at the end of each month.
	let active = 0;
	return [...months.values()]
		.sort((a, b) => a.month.localeCompare(b.month))
		.map((row) => ({ ...row, active: (active += row.started - row.stopped) }));
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
	// A category that is itself called "Other" joins the rest, so the legend never lists two.
	const categories =
		sorted.length > limit
			? [...sorted.filter((category) => category !== 'Other').slice(0, limit), 'Other']
			: sorted;
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
export function accountTotals({
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
 * What each of the top `limit` accounts was paid in each month, one cell per account and month
 * with money. Everyone else shares one row with an empty slug, as in `topAccounts`.
 */
export function accountsByMonth({
	rows,
	months,
	limit
}: {
	rows: AccountMonth[];
	months: string[];
	limit: number;
}): { accounts: { slug: string; name: string }[]; cells: AccountMonth[] } {
	const accounts = topAccounts({ rows, months, limit }).map(({ slug, name }) => ({ slug, name }));
	const top = new Set(accounts.map((account) => account.slug).filter(Boolean));
	const others = accounts.find((account) => account.slug === '');
	const keys = new Set(months);
	const cells = new Map<string, AccountMonth>();
	for (const row of rows) {
		if (!keys.has(row.month)) continue;
		const account = top.has(row.slug)
			? { slug: row.slug, name: row.name }
			: others && { slug: '', name: others.name };
		if (!account) continue;
		const id = `${row.month} ${account.slug}`;
		const cell = cells.get(id) ?? { month: row.month, ...account, amount: 0 };
		cell.amount += row.amount;
		cells.set(id, cell);
	}
	return {
		accounts,
		cells: [...cells.values()].filter((cell) => cell.amount > 0)
	};
}

/** The first month of the quarter `key` (YYYY-MM) is in, like "2026-07" for "2026-08". */
export function quarterStart(key: string): string {
	const [year, month] = key.split('-').map(Number);
	return `${year}-${String(month - ((month - 1) % 3)).padStart(2, '0')}`;
}

/** `cells` summed per quarter and account, each under its quarter's first month. */
export function byQuarter(cells: AccountMonth[]): AccountMonth[] {
	const quarters = new Map<string, AccountMonth>();
	for (const cell of cells) {
		const month = quarterStart(cell.month);
		const id = `${month} ${cell.slug}`;
		const quarter = quarters.get(id) ?? { ...cell, month, amount: 0 };
		quarter.amount += cell.amount;
		quarters.set(id, quarter);
	}
	return [...quarters.values()];
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
	/** Whether the tier holds backers who gave on a schedule, rather than once or now and then. */
	recurring: boolean;
	/** The smallest total in the tier. */
	min: number;
	/** Where the next tier up starts, or null for the top tier. */
	max: number | null;
	count: number;
	amount: number;
}

const TIER_MINIMUMS = [1000, 100, 0];

/**
 * The accounts outside the top `limit`, grouped by whether they gave on a schedule and by how much
 * each gave in total, recurring backers first, so the "others" row can show its make-up without
 * sending every account to the page.
 */
export function othersBySize({
	rows,
	months,
	limit,
	recurring
}: {
	rows: AccountMonth[];
	months?: string[];
	limit: number;
	/** Whether the account gave on a schedule. */
	recurring: (slug: string) => boolean;
}): SizeTier[] {
	const tiers = [true, false].flatMap((isRecurring) =>
		TIER_MINIMUMS.map((min, index) => ({
			recurring: isRecurring,
			min,
			max: index === 0 ? null : TIER_MINIMUMS[index - 1],
			count: 0,
			amount: 0
		}))
	);
	for (const account of accountTotals({ rows, months }).slice(limit)) {
		const isRecurring = recurring(account.slug);
		const tier = tiers.find((t) => t.recurring === isRecurring && account.amount >= t.min)!;
		tier.count++;
		tier.amount += account.amount;
	}
	return tiers.filter((tier) => tier.count > 0);
}

/** `now`, then the end of each of the next `horizon` months, starting with this one. */
export function forecastDates({ now, horizon }: { now: Date; horizon: number }): Date[] {
	const dates = [now];
	let key = now.toISOString().slice(0, 7);
	for (let i = 0; i < horizon; i++) {
		dates.push(monthEnd(key));
		key = nextMonthKey(key);
	}
	return dates;
}

/**
 * Project the balance forward using the average of the last `basis` complete months.
 * The projection starts at `now` from `start`, or from the latest balance. `net` projects with
 * that change a month instead, as when a chart eases from one average to the next.
 */
export function forecast({
	months,
	basis,
	now,
	start,
	horizon = 120,
	net
}: {
	months: Month[];
	basis: number;
	now: Date;
	start?: number;
	horizon?: number;
	net?: number;
}): Forecast {
	const complete = months.filter((m) => !m.partial).slice(-basis);
	const count = complete.length;
	const sum = (pick: (m: Month) => number) => complete.reduce((total, m) => total + pick(m), 0);
	const avgIncome = count ? sum((m) => m.income) / count : 0;
	const avgExpenses = count ? sum((m) => m.expenses) / count : 0;
	const avgNet = avgIncome - avgExpenses;
	const projected = net ?? avgNet;

	const latest = months.at(-1);
	const balance = start ?? latest?.balance ?? 0;
	const perDay = projected / DAYS_PER_MONTH;

	const zeroDate =
		latest && projected < 0 && balance > 0
			? new Date(now.getTime() + (balance / -perDay) * DAY_MS)
			: null;

	const points: Forecast['points'] = [];
	if (latest) {
		for (const date of forecastDates({ now, horizon })) {
			if (zeroDate && date >= zeroDate) {
				points.push({ date: zeroDate, balance: 0 });
				break;
			}
			const days = (date.getTime() - now.getTime()) / DAY_MS;
			points.push({ date, balance: balance + perDay * days });
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
