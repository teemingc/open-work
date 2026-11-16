/**
 * Pure helpers for collectives that pass their money on to other collectives, like a fund that
 * gives to the projects of an ecosystem, rather than paying expenses of their own.
 */

import { accountName, yearsBefore, type Month, type PayoutNode } from './financials';

/** A contribution the collective made to another account, as Open Collective's transactions report it. */
export interface GrantNode {
	createdAt: string;
	/** Negative, and includes payment processor fees. */
	netAmount: { value: number };
	oppositeAccount: {
		slug: string;
		name: string;
		imageUrl: string | null;
		/** The account's own currency and all it spent in the past 12 months, negative, in that currency. */
		currency?: string;
		stats?: {
			totalAmountSpent: { value: number } | null;
			/** All it has ever received, in its own currency. */
			totalAmountReceived?: { value: number } | null;
		} | null;
		/** Such as FUND, COLLECTIVE or PROJECT. */
		type?: string;
		/** The account a project or event belongs to. */
		parent?: { type: string; slug?: string } | null;
	} | null;
	order: { frequency: string | null } | null;
	/** A gift paid as an expense to a person, rather than contributed to a collective. */
	toPerson?: boolean;
	/** The collective's own fund that made the gift, when it did not give it itself. */
	via?: OwnFund;
}

/** A fund the collective keeps its own money in, to give from. */
export interface OwnFund {
	slug: string;
	name: string;
}

/** A recurring contribution the collective is still making to another account. */
export interface CommitmentNode {
	frequency: string | null;
	amount: { value: number };
	toAccount: { slug: string; name: string } | null;
}

/**
 * The kinds of transaction that are money given to another account. Added funds are what a host
 * records when it is paid outside Open Collective, as the PHP Foundation's host does for the
 * invoices Automattic pays, so they are giving as much as contributions paid by card are.
 */
export const GIVING_KINDS = ['CONTRIBUTION', 'ADDED_FUNDS'];

/**
 * The kinds of transaction a gift shows as on Open Collective: a contribution to a collective, funds
 * its host added, or an expense paid to a maintainer with no collective of their own.
 */
export const GIFT_KINDS = [...GIVING_KINDS, 'EXPENSE'];

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
	/** Paid as an expense to a person, as a gift to a maintainer with no collective of their own is. */
	toPerson: boolean;
	/** All the account spent in the past 12 months, if Open Collective said. */
	theirSpending: { value: number; currency: string } | null;
	/** The collective's own fund that made the gift, or `null` when it gave it itself. */
	via: OwnFund | null;
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
			toPerson: !!node.toPerson,
			via: node.via ?? null,
			theirSpending:
				node.oppositeAccount?.currency && node.oppositeAccount.stats?.totalAmountSpent
					? {
							value: -node.oppositeAccount.stats.totalAmountSpent.value,
							currency: node.oppositeAccount.currency
						}
					: null
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
}

/** The kinds an account's own parts have. */
const PART_TYPES = new Set(['PROJECT', 'EVENT']);

/** The kinds of account that hold money for a purpose, rather than being a person or a company. */
const HOLDING_TYPES = new Set(['FUND', 'COLLECTIVE', ...PART_TYPES]);

/** The least share of an account's money from others that whoever owns it has put in. */
const OWNER_SHARE = 0.5;

/** What Open Collective says of an account given to, beyond what comes with the gift. */
export interface Standing {
	/** What it added to itself, which is not money from others. */
	selfFunded: number;
	/** The slugs of those who run it. */
	admins: string[];
}

/** What is known of the giver's own accounts so far. `ownFunds` adds those who run what it finds. */
export interface Family {
	/** The giver's own slug and those of its own accounts. */
	slugs: Set<string>;
	/** The slugs of those who run its own accounts. */
	admins: Set<string>;
}

/** An account given to, with what it was given in all. */
interface Given {
	fund: OwnFund;
	type: string;
	/** The account it is a project or event of. */
	parent: string | undefined;
	amount: number;
	/** All it has received from others, when Open Collective said. */
	received: number | undefined;
}

/** Each account that holds money among those given to. */
function givenTo(nodes: GrantNode[], standings: Record<string, Standing>): Given[] {
	const given = new Map<string, Given>();
	for (const { oppositeAccount: to, netAmount } of nodes) {
		if (!to?.type || !HOLDING_TYPES.has(to.type)) continue;
		const received = to.stats?.totalAmountReceived?.value;
		const entry = given.get(to.slug) ?? {
			fund: { slug: to.slug, name: accountName(to) },
			type: to.type,
			parent: PART_TYPES.has(to.type) ? to.parent?.slug : undefined,
			amount: 0,
			received: received && received - (standings[to.slug]?.selfFunded ?? 0)
		};
		entry.amount -= netAmount.value;
		given.set(to.slug, entry);
	}
	return [...given.values()];
}

/** Whether the giver put in at least half of all an account has received from others. */
function mostlyPaidFor({ amount, received }: Given): boolean {
	return amount > 0 && received !== undefined && amount >= received * OWNER_SHARE;
}

/**
 * The accounts among those given to that are the giver's own, where it keeps money to give from, as
 * Google does in Chrome's fund and Season of Docs. Moving money into one is not a contribution to
 * anyone: the contribution is what the account gives on.
 *
 * A fund is the giver's own when the giver put in at least half of all it has received from others,
 * so one donor among many to a community's fund is not taken for its owner. What a fund added to
 * itself is not money from others: most of what AMP's fund received it added itself, and Google
 * gave all the rest.
 *
 * A collective is not the giver's own for that alone, as a small project is often paid for by one
 * sponsor. It is when one of those who run it also runs another of the giver's own accounts, or
 * another collective the giver mostly paid for: Chrome's funds pay contractors through four
 * collectives that one person at Chrome runs.
 *
 * A project or event belongs to whoever owns the account it is part of, whatever it was given:
 * Sentry paid for most of the Rust Fund, which is a project of Open Source Collective's own funds.
 */
export function ownFunds(
	nodes: GrantNode[],
	standings: Record<string, Standing> = {},
	family: Family = { slugs: new Set(), admins: new Set() }
): OwnFund[] {
	const given = givenTo(nodes, standings);
	const runBy = (slug: string) => standings[slug]?.admins ?? [];
	const whole = given.filter(({ parent }) => !parent).filter(mostlyPaidFor);
	const funds = whole.filter(({ type }) => type === 'FUND').map(({ fund }) => fund);
	const others = whole.filter(({ type }) => type !== 'FUND').map(({ fund }) => fund);
	const admins = new Set(family.admins);
	for (const fund of funds) for (const admin of runBy(fund.slug)) admins.add(admin);
	const shared = others.filter(({ slug }) =>
		runBy(slug).some(
			(admin) =>
				admins.has(admin) ||
				others.some((other) => other.slug !== slug && runBy(other.slug).includes(admin))
		)
	);
	const own = [...funds, ...shared];
	for (const fund of own) for (const admin of runBy(fund.slug)) family.admins.add(admin);
	const owners = new Set([...family.slugs, ...own.map((fund) => fund.slug)]);
	const parts = given
		.filter(({ parent, amount }) => parent && owners.has(parent) && amount > 0)
		.map(({ fund }) => fund);
	return [...own, ...parts];
}

/** How many accounts one query asks about, as Open Collective refuses over 100 aliases. */
const STANDING_BATCH = 20;

/** An account's backers, with what each gave it in all, and those who run it. */
type Members = {
	slug: string;
	members: {
		nodes: { role: string; account: { slug: string } | null; totalDonations: { value: number } }[];
	};
} | null;

/** Sends a query to Open Collective. */
type AskOpenCollective = <R>(request: {
	query: string;
	variables: Record<string, unknown>;
}) => Promise<R>;

/**
 * `ownFunds` of `nodes`, after asking Open Collective who runs each account the giver mostly paid
 * for and what it added to itself. Slugs are written into the query, as JSON strings. Asks nothing
 * when there is no such account.
 */
export async function findOwnFunds({
	nodes,
	ask,
	family
}: {
	nodes: GrantNode[];
	ask: AskOpenCollective;
	/** What is known of the giver's own accounts so far. Those who run what is found are added. */
	family?: Family;
}): Promise<OwnFund[]> {
	// A fund is asked about whatever its share, as what it added to itself can raise it.
	const slugs = new Set(
		givenTo(nodes, {})
			.filter((given) => !given.parent && (given.type === 'FUND' || mostlyPaidFor(given)))
			.map(({ fund }) => fund.slug)
	);
	const standings: Record<string, Standing> = {};
	for (let i = 0; i < slugs.size; i += STANDING_BATCH) {
		const accounts = [...slugs]
			.slice(i, i + STANDING_BATCH)
			.map(
				(slug, n) =>
					`f${n}: account(slug: ${JSON.stringify(slug)}, throwIfMissing: false) { slug members(role: [BACKER, ADMIN], limit: 100) { nodes { role account { slug } totalDonations { value } } } }`
			);
		const result = await ask<Record<string, Members>>({
			query: `query Standings { ${accounts.join('\n')} }`,
			variables: {}
		});
		for (const account of Object.values(result)) {
			if (!account) continue;
			const members = account.members.nodes;
			standings[account.slug] = {
				selfFunded:
					members.find(
						(member) => member.role === 'BACKER' && member.account?.slug === account.slug
					)?.totalDonations.value ?? 0,
				admins: members.flatMap((member) =>
					member.role === 'ADMIN' && member.account ? [member.account.slug] : []
				)
			};
		}
	}
	return ownFunds(nodes, standings, family);
}

/** Expense types one of a company's own funds pays what it gives with. */
const FUND_GIFT_TYPES = new Set(['GRANT', 'FUNDING_REQUEST', 'INVOICE']);

/**
 * Whether an expense paid by a fund a company keeps to give from is its giving. Such a fund pays
 * those with no collective by invoice, as Season of Docs pays its grants to organizations and
 * Chrome's fund pays the people it funds to work on the web, so every invoice counts and not only
 * those `isGift` finds. Costs it paid back to someone, and payments to its host's vendors, do not.
 */
export function isFundGift(node: Pick<PayoutNode, 'expense' | 'oppositeAccount'>): boolean {
	return (
		!!node.expense &&
		FUND_GIFT_TYPES.has(node.expense.type) &&
		node.oppositeAccount?.type !== 'VENDOR'
	);
}

/** Expense types Open Collective has for money given rather than owed. */
const GIFT_TYPES = new Set(['GRANT', 'FUNDING_REQUEST']);

/**
 * Whether an expense is a gift rather than payment for work the collective asked for. A fund pays
 * maintainers who have no collective of their own by expense, as the Vite Ecosystem Fund does, and
 * those are as much its giving as its contributions to collectives. Told by the expense being a
 * grant, booked as a donation or sponsorship, or tagged with the collective's own slug, which is
 * how a fund marks what it gives.
 */
export function isGift({
	node,
	slug
}: {
	node: Pick<PayoutNode, 'expense'>;
	slug: string;
}): boolean {
	const expense = node.expense;
	if (!expense) return false;
	return (
		GIFT_TYPES.has(expense.type) ||
		/donation|sponsorship/i.test(expense.accountingCategory?.name ?? '') ||
		!!expense.tags?.includes(slug.toLowerCase())
	);
}

/**
 * A gift paid as an expense, as the contribution it stands for. What the payee spends comes with it,
 * as a fund like Bloomberg's pays nearly all its gifts to collectives by expense.
 */
export function giftToGrant(node: PayoutNode): GrantNode {
	return {
		createdAt: node.createdAt,
		netAmount: node.netAmount,
		oppositeAccount: node.oppositeAccount && {
			slug: node.oppositeAccount.slug,
			name: node.oppositeAccount.name,
			imageUrl: node.oppositeAccount.imageUrl ?? null,
			currency: node.oppositeAccount.currency,
			stats: node.oppositeAccount.stats
		},
		order: null,
		toPerson: node.oppositeAccount?.type === 'INDIVIDUAL'
	};
}

/**
 * How many it gave to, as "3 projects", or "3 projects and maintainers" with any people among
 * them.
 */
export function recipientCount({ count, people }: { count: number; people: boolean }): string {
	if (!people) return `${count} project${count === 1 ? '' : 's'}`;
	return count === 1 ? '1 maintainer' : `${count} projects and maintainers`;
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
export function isFund({
	grants,
	months,
	funded = []
}: {
	grants: Grant[];
	months: Month[];
	/** What it moved into its own funds, which it spent on giving as much as what it gave itself. */
	funded?: { amount: number }[];
}): boolean {
	// What its own funds gave on is not its spending: what it moved into them is.
	const granted = [...grants.filter((grant) => !grant.via), ...funded].reduce(
		(sum, { amount }) => sum + amount,
		0
	);
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
	/** What the collective gave it in its giving year. */
	recent: number;
	/**
	 * All the account spent in the past 12 months, which is what it costs to keep going. Unknown when
	 * its own figures are in another currency, or it spent nothing.
	 */
	spending: number | null;
	/**
	 * How much of `spending` what the collective gave it in its giving year covers, or would cover
	 * once it has stopped. Over 1 when it gave more than the account spent. Unknown with `spending`,
	 * or when the collective gave it nothing in its giving year.
	 */
	share: number | null;
}

/** The 12 months of a fund's giving set against what each project spent. */
export interface GivingYear {
	/** ISO date the 12 months start on. */
	from: string;
	/** ISO date and time they end on: now, or the last time it gave once it has stopped. */
	to: string;
	/**
	 * It gave nothing in the past 12 months, so the year is its last one of giving, set against what
	 * the projects spend now, as the share it would cover if it still gave as it did.
	 */
	stopped: boolean;
}

/** The past 12 months, or the 12 months up to the last time it gave when it has since stopped. */
export function givingYear({ grants, now }: { grants: Grant[]; now: Date }): GivingYear {
	const yearBefore = (date: Date) =>
		new Date(
			Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate())
		).toISOString();
	const from = yearBefore(now);
	const last = grants.at(-1)?.date;
	if (!last || last >= from) return { from, to: now.toISOString(), stopped: false };
	return { from: yearBefore(new Date(last)), to: last, stopped: true };
}

/** Its contributions in the past 12 months against the 12 months before, when they have dropped. */
export interface Reduction {
	/** What it contributed in the past 12 months. */
	recent: number;
	/** What it contributed in the 12 months before those. */
	previous: number;
}

/**
 * How far contributions in the past 12 months must fall below the 12 months before to count as
 * reduced. A fund that contributes in a few rounds a year can see one land on either side of a
 * year's edge, so small dips are left alone: only a drop of at least a third counts, as when Airbnb
 * went from about $154k to $80k.
 */
const REDUCED_SHARE = 2 / 3;

/**
 * Its past 12 months of contributions against the 12 months before, when it still contributes but
 * at most two thirds as much as it did. Undefined when it contributed nothing in either year, which
 * `givingYear` covers as having stopped, or when it contributes as much or nearly so.
 */
export function reducedContributions({
	grants,
	now
}: {
	grants: Grant[];
	now: Date;
}): Reduction | undefined {
	const yearAgo = yearsBefore(now, 1);
	const twoYearsAgo = yearsBefore(now, 2);
	let recent = 0;
	let previous = 0;
	for (const grant of grants) {
		if (grant.date >= yearAgo) recent += grant.amount;
		else if (grant.date >= twoYearsAgo) previous += grant.amount;
	}
	return recent > 0 && recent <= previous * REDUCED_SHARE ? { recent, previous } : undefined;
}

/** Everyone the collective gave to, the most given first. */
export function toRecipients({
	grants,
	commitments,
	currency,
	year
}: {
	grants: Grant[];
	commitments: Commitment[];
	/** The collective's own currency, which an account's spending must be in to compare. */
	currency: string;
	/** The 12 months its share is worked out over. */
	year: GivingYear;
}): Recipient[] {
	const spendings = new Map<string, number | null>();
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
			spending: null,
			share: null
		};
		if (grant.theirSpending)
			spendings.set(
				grant.slug,
				grant.theirSpending.currency === currency ? grant.theirSpending.value : null
			);
		recipient[grant.recurring ? 'recurring' : 'oneOff'] += grant.amount;
		recipient.total += grant.amount;
		if (grant.date >= year.from) recipient.recent += grant.amount;
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
		const spending = spendings.get(recipient.slug);
		if (!spending || spending <= 0 || !recipient.recent) continue;
		recipient.spending = spending;
		recipient.share = recipient.recent / spending;
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
	/** Any of it was paid as an expense to a person. */
	toPerson: boolean;
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
				recurring: false,
				toPerson: false
			};
			round.gifts.push(gift);
		}
		gift.amount += grant.amount;
		gift.recurring ||= grant.recurring;
		gift.toPerson ||= grant.toPerson;
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
