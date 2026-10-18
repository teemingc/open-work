import { form, query } from '$app/server';
import * as v from 'valibot';
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
	id: string;
	title: string;
	status: string;
	createdAt: string;
	amountInCents: number;
	currency: string;
	/** The amount in the collective's currency, for sorting expenses made in different currencies. */
	sortCents: number;
	url: string;
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

const collectiveSlug = v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]*$/i, 'Invalid account slug'));

async function fetchMe(token: string): Promise<NonNullable<MeResult['me']>> {
	const { me } = await graphql<MeResult>({ token, query: ME_QUERY });
	if (!me) throw new OpenCollectiveError('This connection is not linked to an account.', 401);
	return me;
}

/** The connected Open Collective account, or `null` when this browser has not connected. */
export const getMe = query(async (): Promise<Account | null> => {
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

/** Expenses you have requested from a collective, newest first. */
export const getExpenses = query(collectiveSlug, async (slug): Promise<Expense[]> => {
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
					account: { slug },
					limit: EXPENSES_PAGE,
					offset: nodes.length
				}
			});
			total = expenses.totalCount;
			nodes.push(...expenses.nodes);
			if (expenses.nodes.length === 0) break;
		}
		return nodes.map((expense) => ({
			id: expense.id,
			title: expense.description,
			status: expense.status,
			createdAt: expense.createdAt,
			amountInCents: expense.amountV2.valueInCents,
			currency: expense.amountV2.currency,
			sortCents: expense.inCollectiveCurrency?.valueInCents ?? expense.amountV2.valueInCents,
			url: expenseUrl({ collectiveSlug: expense.account.slug, legacyId: expense.legacyId })
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
		void getExpenses(input.collectiveSlug).refresh();

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
