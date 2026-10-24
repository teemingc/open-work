/**
 * Pure helpers for collectives that pass their money on to other collectives, like a fund that
 * gives to the projects of an ecosystem, rather than paying expenses of their own.
 */

import { accountName, type Month } from './financials';

/** A contribution the collective made to another account, as Open Collective's transactions report it. */
export interface GrantNode {
	createdAt: string;
	/** Negative, and includes payment processor fees. */
	netAmount: { value: number };
	oppositeAccount: {
		slug: string;
		name: string;
		imageUrl: string | null;
		/** The account's own currency and all it received in the past 12 months, in that currency. */
		currency?: string;
		stats?: { totalAmountReceived: { value: number } | null } | null;
	} | null;
	order: { frequency: string | null } | null;
}

/** A recurring contribution the collective is still making to another account. */
export interface CommitmentNode {
	frequency: string | null;
	amount: { value: number };
	toAccount: { slug: string; name: string } | null;
}

/** One contribution the collective made. */
export interface Grant {
	/** ISO date and time. */
	date: string;
	slug: string;
	name: string;
	/** The account's logo or avatar on Open Collective. */
	imageUrl: string | null;
	amount: number;
	/** Part of a recurring contribution, rather than a one-off. */
	recurring: boolean;
	/** All the account received in the past 12 months, from anyone, if Open Collective said. */
	theirIncome: { value: number; currency: string } | null;
}

/** A recurring contribution, as what it costs a month. */
export interface Commitment {
	slug: string;
	name: string;
	monthly: number;
}

export function toGrants(nodes: GrantNode[]): Grant[] {
	return nodes
		.map((node) => ({
			date: node.createdAt,
			slug: node.oppositeAccount?.slug ?? '',
			name: accountName(node.oppositeAccount),
			imageUrl: node.oppositeAccount?.imageUrl ?? null,
			amount: -node.netAmount.value,
			recurring: !!node.order?.frequency && node.order.frequency !== 'ONETIME',
			theirIncome:
				node.oppositeAccount?.currency && node.oppositeAccount.stats?.totalAmountReceived
					? {
							value: node.oppositeAccount.stats.totalAmountReceived.value,
							currency: node.oppositeAccount.currency
						}
					: null
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
}

const PER_MONTH: Record<string, number> = { MONTHLY: 1, QUARTERLY: 1 / 3, YEARLY: 1 / 12 };

export function toCommitments(nodes: CommitmentNode[]): Commitment[] {
	return nodes
		.filter((node) => node.frequency && node.frequency in PER_MONTH)
		.map((node) => ({
			slug: node.toAccount?.slug ?? '',
			name: accountName(node.toAccount),
			monthly: node.amount.value * PER_MONTH[node.frequency!]
		}))
		.sort((a, b) => b.monthly - a.monthly);
}

/** The share of its spending a collective must pass on to count as a fund. */
const FUND_SHARE = 0.9;

/**
 * Whether the collective passes on almost all its money. Only when contributions to others are at
 * least nine tenths of everything it has spent: a project that also funds others, like Solid, which
 * passes on most but not all of it, keeps its usual page.
 */
export function isFund({ grants, months }: { grants: Grant[]; months: Month[] }): boolean {
	const granted = grants.reduce((sum, grant) => sum + grant.amount, 0);
	const spent = months.reduce((sum, month) => sum + month.expenses, 0);
	return granted > 0 && granted >= spent * FUND_SHARE;
}

/** What one account was given, in total and split by kind. */
export interface Recipient {
	slug: string;
	name: string;
	imageUrl: string | null;
	oneOff: number;
	recurring: number;
	total: number;
	count: number;
	/** ISO dates of the first and latest contributions. */
	first: string;
	last: string;
	/** What it is still given each month, if it has a recurring contribution. */
	monthly: number;
	/** What the collective gave it in the past 12 months. */
	recent: number;
	/**
	 * All the account received in the past 12 months, from anyone. Unknown when its own figures are
	 * in another currency.
	 */
	contributions: number | null;
	/**
	 * How much of `contributions` came from the collective, from 0 to 1. Unknown with `contributions`,
	 * or when the collective gave it nothing in that time.
	 */
	share: number | null;
}

/** Everyone the collective gave to, the most given first. */
export function toRecipients({
	grants,
	commitments,
	currency,
	now
}: {
	grants: Grant[];
	commitments: Commitment[];
	/** The collective's own currency, which an account's income must be in to compare. */
	currency: string;
	/** The end of the 12 months its share is worked out over. */
	now: Date;
}): Recipient[] {
	const yearAgo = new Date(
		Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())
	).toISOString();
	const incomes = new Map<string, number | null>();
	const bySlug = new Map<string, Recipient>();
	for (const grant of grants) {
		const recipient = bySlug.get(grant.slug) ?? {
			slug: grant.slug,
			name: grant.name,
			imageUrl: grant.imageUrl,
			oneOff: 0,
			recurring: 0,
			total: 0,
			count: 0,
			first: grant.date,
			last: grant.date,
			monthly: 0,
			recent: 0,
			contributions: null,
			share: null
		};
		if (grant.theirIncome)
			incomes.set(
				grant.slug,
				grant.theirIncome.currency === currency ? grant.theirIncome.value : null
			);
		recipient[grant.recurring ? 'recurring' : 'oneOff'] += grant.amount;
		recipient.total += grant.amount;
		if (grant.date >= yearAgo) recipient.recent += grant.amount;
		recipient.count += 1;
		if (grant.date < recipient.first) recipient.first = grant.date;
		if (grant.date > recipient.last) recipient.last = grant.date;
		bySlug.set(grant.slug, recipient);
	}
	for (const commitment of commitments) {
		const recipient = bySlug.get(commitment.slug);
		if (recipient) recipient.monthly += commitment.monthly;
	}
	for (const recipient of bySlug.values()) {
		const income = incomes.get(recipient.slug);
		if (!income || income <= 0 || !recipient.recent) continue;
		// Its stats can lag behind gifts made since they were last worked out, so never under them.
		recipient.contributions = Math.max(income, recipient.recent);
		recipient.share = recipient.recent / recipient.contributions;
	}
	return [...bySlug.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** What one account was given in one round of giving. */
export interface RoundGift {
	slug: string;
	name: string;
	imageUrl: string | null;
	amount: number;
	/** Any of it was a recurring contribution. */
	recurring: boolean;
}

/** The gifts made on one day. */
export interface Round {
	/** YYYY-MM-DD. */
	key: string;
	total: number;
	/** One per account, the most given first. */
	gifts: RoundGift[];
}

/** Every day the collective gave on, oldest first, with what each account was given that day. */
export function toRounds(grants: Grant[]): Round[] {
	const byKey = new Map<string, Round>();
	for (const grant of grants) {
		const key = grant.date.slice(0, 10);
		let round = byKey.get(key);
		if (!round) {
			round = { key, total: 0, gifts: [] };
			byKey.set(key, round);
		}
		round.total += grant.amount;
		let gift = round.gifts.find((g) => g.slug === grant.slug);
		if (!gift) {
			gift = {
				slug: grant.slug,
				name: grant.name,
				imageUrl: grant.imageUrl,
				amount: 0,
				recurring: false
			};
			round.gifts.push(gift);
		}
		gift.amount += grant.amount;
		gift.recurring ||= grant.recurring;
	}
	const rounds = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
	for (const round of rounds) round.gifts.sort((a, b) => b.amount - a.amount);
	return rounds;
}

/** All the collective had received and given away by one moment. */
export interface HistoryPoint {
	date: Date;
	received: number;
	given: number;
}

/**
 * What the collective had received and given away over time, from its first month to `now`, as
 * running totals that step up where money moved. Received money is only known by the month, so it
 * steps at the start of each month; gifts step on the day they were made.
 */
export function givingHistory({
	grants,
	months,
	now
}: {
	grants: Grant[];
	months: Month[];
	now: Date;
}): HistoryPoint[] {
	const steps: { date: Date; received: number; given: number }[] = [
		...months.map((month) => ({
			date: new Date(`${month.key}-01T00:00:00.000Z`),
			received: month.income,
			given: 0
		})),
		...grants.map((grant) => ({ date: new Date(grant.date), received: 0, given: grant.amount }))
	].sort((a, b) => a.date.getTime() - b.date.getTime());
	const points: HistoryPoint[] = [];
	let received = 0;
	let given = 0;
	for (const step of steps) {
		received += step.received;
		given += step.given;
		const last = points.at(-1);
		if (last && last.date.getTime() === step.date.getTime())
			Object.assign(last, { received, given });
		else points.push({ date: step.date, received, given });
	}
	if (points.length) points.push({ date: now, received, given });
	return points;
}

/** All the collective will have given by a month, if it keeps up its monthly gifts. */
export interface AheadPoint {
	date: Date;
	given: number;
}

/**
 * What the collective will have given each month from `now`, if it keeps up its monthly gifts and
 * nothing more comes in, for as long as what it has received pays for them, up to `limit` months.
 * Empty when it makes no monthly gifts.
 */
export function givingAhead({
	given,
	received,
	monthly,
	now,
	limit
}: {
	given: number;
	received: number;
	monthly: number;
	now: Date;
	limit: number;
}): AheadPoint[] {
	if (monthly <= 0 || given + monthly > received) return [];
	const points: AheadPoint[] = [{ date: now, given }];
	for (let month = 1; month <= limit && given + monthly <= received; month++) {
		given += monthly;
		points.push({
			date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + month, 1)),
			given
		});
	}
	return points;
}
