import { dev } from '$app/env';
import { DEV_OPEN_COLLECTIVE_SLUG } from '$app/env/private';
import { form, query } from '$app/server';
import { buildExpense, SubmitExpenseSchema } from '#lib/server/expense.js';
import {
	CREATE_EXPENSE_MUTATION,
	EXPENSES_QUERY,
	expenseUrl,
	graphql,
	ME_QUERY,
	OpenCollectiveError,
	toHttpError,
	type CreateExpenseResult,
	type ExpensesResult,
	type MeResult
} from '#lib/server/opencollective.js';
import { getToken, requireToken } from '#lib/server/session.js';

/** An expense you requested from a collective, as Open Collective reports it. */
export interface Expense {
	title: string;
	status: string;
	/** The collective it was sent to. */
	collective: string;
}

/** Plenty for one page: a maintainer invoicing twice a month sends about 24 a year. */
const EXPENSES_PAGE = 100;

export interface PayoutMethod {
	id: string;
	label: string;
	currency: string | null;
}

export interface Account {
	slug: string;
	name: string;
	address: string | null;
	country: string | null;
	payoutMethods: PayoutMethod[];
}

/** The account `pnpm dev` acts as connected to, when `DEV_OPEN_COLLECTIVE_SLUG` is set. */
const devAccount: Account | null =
	dev && DEV_OPEN_COLLECTIVE_SLUG
		? {
				slug: DEV_OPEN_COLLECTIVE_SLUG,
				name: DEV_OPEN_COLLECTIVE_SLUG,
				address: null,
				country: null,
				payoutMethods: []
			}
		: null;

async function fetchMe(token: string): Promise<NonNullable<MeResult['me']>> {
	const { me } = await graphql<MeResult>({ token, query: ME_QUERY });
	if (!me) throw new OpenCollectiveError('This connection is not linked to an account.', 401);
	return me;
}

/** The connected Open Collective account, or `null` when this browser has not connected. */
export const getMe = query(async (): Promise<Account | null> => {
	if (devAccount) return devAccount;
	const token = getToken();
	if (!token) return null;

	try {
		const me = await fetchMe(token);
		return {
			slug: me.slug,
			name: me.name ?? me.slug,
			address: me.location?.address ?? null,
			country: me.location?.country ?? null,
			payoutMethods: me.payoutMethods.map((method) => ({
				id: method.publicId,
				currency: method.currency,
				label: method.name || method.type || 'Payout method'
			}))
		};
	} catch (err) {
		// An expired or revoked token means "not connected"; anything else is a real failure.
		if (err instanceof OpenCollectiveError && err.status === 401) return null;
		toHttpError(err);
	}
});

/**
 * Expenses you have requested from every collective, newest first. One list rather than one per
 * collective, so the requests to Open Collective stay few however many clients you invoice.
 */
export const getExpenses = query(async (): Promise<Expense[]> => {
	if (devAccount) return [];
	const token = requireToken();
	try {
		const me = await fetchMe(token);
		const nodes: ExpensesResult['expenses']['nodes'] = [];
		let total = Infinity;
		// Usually one request; more only once you have sent over a hundred.
		while (nodes.length < total) {
			const { expenses } = await graphql<ExpensesResult>({
				token,
				query: EXPENSES_QUERY,
				variables: {
					fromAccount: { slug: me.slug },
					limit: EXPENSES_PAGE,
					offset: nodes.length
				}
			});
			total = expenses.totalCount;
			nodes.push(...expenses.nodes);
			if (expenses.nodes.length === 0) break;
		}
		return nodes.map((expense) => ({
			title: expense.description,
			status: expense.status,
			collective: expense.account.slug
		}));
	} catch (err) {
		toHttpError(err);
	}
});

/** Create an INVOICE expense on a collective, billed for time. */
export const submitExpense = form(SubmitExpenseSchema, async (input) => {
	const token = requireToken();
	try {
		const me = await fetchMe(token);
		const { createExpense } = await graphql<CreateExpenseResult>({
			token,
			query: CREATE_EXPENSE_MUTATION,
			variables: {
				expense: buildExpense({ input, payeeSlug: me.slug }),
				account: { slug: input.collectiveSlug }
			}
		});

		// Send the updated list back with this response.
		void getExpenses().refresh();

		return {
			status: createExpense.status,
			url: expenseUrl({
				collectiveSlug: createExpense.account.slug,
				legacyId: createExpense.legacyId
			})
		};
	} catch (err) {
		toHttpError(err);
	}
});
