import { OC_PERSONAL_TOKEN } from '$app/env/private';
import { error } from '@sveltejs/kit';

const ENDPOINT = 'https://api.opencollective.com/graphql/v2';

export class OpenCollectiveError extends Error {
	status: number;
	/** Seconds Open Collective asked us to wait, after a rate limit. */
	retryAfter?: number;
	/** Set on a rate limit hit without your connection, which would have had a higher limit. */
	connect?: boolean;

	constructor(message: string, status = 502, retryAfter?: number) {
		super(message);
		this.status = status;
		this.retryAfter = retryAfter;
	}
}

interface GraphQLResponse<T> {
	data?: T;
	errors?: { message: string; extensions?: { code?: string } }[];
}

/** The longest `Retry-After` worth waiting for inside a request. Longer ones fail with a message. */
const MAX_RETRY_WAIT_MS = 20_000;

/** How long Open Collective asks us to wait, from a seconds count or an HTTP date. */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
	if (!header) return undefined;
	const seconds = Number(header);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(header);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function graphql<T>({
	token,
	personalToken,
	query,
	variables,
	retried = false
}: {
	/** OAuth access token. Omit for public data, such as a collective's stats. */
	token?: string;
	/** A personal token, sent in its own header. Used when there is no OAuth token. */
	personalToken?: string;
	query: string;
	variables?: Record<string, unknown>;
	/** Set on the one retry after a rate limit. */
	retried?: boolean;
}): Promise<T> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	else if (personalToken) headers['Personal-Token'] = personalToken;

	let response: Response;
	try {
		response = await fetch(ENDPOINT, {
			method: 'POST',
			headers,
			body: JSON.stringify({ query, variables })
		});
	} catch {
		throw new OpenCollectiveError('Could not reach Open Collective. Try again in a moment.');
	}

	if (response.status === 429) {
		// Back off as asked, once. Without a Retry-After, wait a couple of seconds.
		const wait = retryAfterMs(response.headers.get('retry-after')) ?? 2000;
		if (!retried && wait <= MAX_RETRY_WAIT_MS) {
			await sleep(wait);
			return graphql<T>({ token, personalToken, query, variables, retried: true });
		}
		throw new OpenCollectiveError(
			'Open Collective’s request limit has been reached.',
			429,
			Math.ceil(wait / 1000)
		);
	}

	let body: GraphQLResponse<T> | undefined;
	try {
		body = (await response.json()) as GraphQLResponse<T>;
	} catch {
		// Not JSON; handled below.
	}

	if (response.status === 401 || response.status === 403) {
		throw new OpenCollectiveError(
			body?.errors?.[0]?.message ??
				'Open Collective no longer accepts this connection. Connect again in settings.',
			401
		);
	}
	if (body?.errors?.length) {
		// Each distinct message once: a failing field fails on every row, and would repeat for each.
		const message = [...new Set(body.errors.map((e) => e.message))].join('\n');
		// A fault on Open Collective's side, not in what was asked, so it says whose it is.
		if (body.errors.some((e) => e.extensions?.code === 'INTERNAL_SERVER_ERROR')) {
			throw new OpenCollectiveError(
				`Open Collective ran into a problem on its side (${message}). Try again later.`
			);
		}
		// A token without the scope a query needs is refused, like any other rejected token.
		const unscoped = /not allowed for operations in scope/i.test(message);
		throw new OpenCollectiveError(message, unscoped ? 403 : 400);
	}
	if (!response.ok || !body?.data) {
		throw new OpenCollectiveError(`Open Collective returned an error (${response.status}).`);
	}
	return body.data;
}

/**
 * Public data, asked for with your token when you are connected, then the server's personal
 * token, then anonymously: signed-in requests get a more generous rate limit. A token that is
 * rejected, lacks a scope or is rate-limited moves straight on to the next way of asking, so a stale connection or a
 * busy personal token never hides public stats. Only the last way waits out a rate limit.
 */
export async function publicGraphql<T>({
	token,
	query,
	variables
}: {
	token?: string;
	query: string;
	variables?: Record<string, unknown>;
}): Promise<T> {
	const personalToken = OC_PERSONAL_TOKEN || undefined;
	const attempts: { token?: string; personalToken?: string }[] = [
		...(token ? [{ token }] : []),
		...(personalToken ? [{ personalToken }] : []),
		{}
	];
	for (const [index, attempt] of attempts.entries()) {
		const last = index === attempts.length - 1;
		try {
			// `retried` skips the wait on a rate limit, since there is another way to ask.
			return await graphql<T>({ ...attempt, query, variables, retried: !last });
		} catch (err) {
			const moveOn = err instanceof OpenCollectiveError && [401, 403, 429].includes(err.status);
			if (last && !token && err instanceof OpenCollectiveError && err.status === 429) {
				err.connect = true;
			}
			if (last || !moveOn) throw err;
		}
	}
	throw new Error('unreachable');
}

/** Rethrow Open Collective failures as HTTP errors the client can show. */
export function toHttpError(err: unknown): never {
	if (err instanceof OpenCollectiveError) {
		error(err.status, err.message, { retryAfter: err.retryAfter, connect: err.connect });
	}
	throw err;
}

export const ME_QUERY = /* GraphQL */ `
	query Me {
		me {
			slug
			name
			location {
				address
				country
			}
			payoutMethods {
				publicId
				type
				name
				currency
			}
		}
	}
`;

export const CREATE_EXPENSE_MUTATION = /* GraphQL */ `
	mutation CreateExpense($expense: ExpenseCreateInput!, $account: AccountReferenceInput!) {
		createExpense(expense: $expense, account: $account) {
			id
			legacyId
			status
			account {
				slug
			}
		}
	}
`;

export interface MeResult {
	me: {
		slug: string;
		name: string | null;
		location: { address: string | null; country: string | null } | null;
		payoutMethods: {
			publicId: string;
			type: string | null;
			name: string | null;
			currency: string | null;
		}[];
	} | null;
}

export interface CreateExpenseResult {
	createExpense: {
		id: string;
		legacyId: number;
		status: string;
		account: { slug: string };
	};
}

export const EXPENSES_QUERY = /* GraphQL */ `
	query Expenses(
		$fromAccount: AccountReferenceInput!
		$account: AccountReferenceInput!
		$limit: Int!
		$offset: Int!
	) {
		expenses(fromAccount: $fromAccount, account: $account, limit: $limit, offset: $offset) {
			totalCount
			nodes {
				id
				legacyId
				description
				status
				createdAt
				amountV2 {
					valueInCents
					currency
				}
				inCollectiveCurrency: amountV2(currencySource: ACCOUNT) {
					valueInCents
				}
				account {
					slug
				}
			}
		}
	}
`;

export interface ExpensesResult {
	expenses: {
		totalCount: number;
		nodes: {
			id: string;
			legacyId: number;
			description: string;
			status: string;
			createdAt: string;
			amountV2: { valueInCents: number; currency: string };
			/** The same amount in the collective's currency, so amounts can be compared. */
			inCollectiveCurrency: { valueInCents: number } | null;
			account: { slug: string };
		}[];
	};
}

export function expenseUrl({
	collectiveSlug,
	legacyId
}: {
	collectiveSlug: string;
	legacyId: number;
}) {
	return `https://opencollective.com/${collectiveSlug}/expenses/${legacyId}`;
}
