import * as v from 'valibot';

const slug = v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]*$/i, 'Invalid account slug'));
/** Empty form inputs submit `""`; treat those as not given. */
const optionalText = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.transform((value) => value || undefined)
);

export const SubmitExpenseSchema = v.object({
	collectiveSlug: slug,
	payoutMethodId: v.pipe(v.string(), v.nonEmpty('Choose a payout method')),
	title: v.pipe(v.string(), v.trim(), v.nonEmpty('Missing title')),
	itemDescription: v.pipe(v.string(), v.trim(), v.nonEmpty('Missing item description')),
	amountInCents: v.pipe(
		v.number(),
		v.integer('Amount must be whole cents'),
		v.minValue(1, 'Amount must be greater than zero')
	),
	currency: v.pipe(
		v.string(),
		v.regex(/^[A-Z]{3}$/, 'Currency must be a three-letter code like USD')
	),
	invoiceInfo: optionalText,
	notesHtml: optionalText,
	address: optionalText,
	country: v.pipe(
		optionalText,
		v.transform((value) => value?.toUpperCase()),
		v.check(
			(value) => !value || /^[A-Z]{2}$/.test(value),
			'Country must be a two-letter code like MY'
		)
	),
	accountingCategoryId: optionalText
});

export type SubmitExpenseInput = v.InferOutput<typeof SubmitExpenseSchema>;

/** The `ExpenseCreateInput` for an INVOICE expense billed for time. */
export function buildExpense({
	input,
	payeeSlug,
	incurredAt = new Date()
}: {
	input: SubmitExpenseInput;
	payeeSlug: string;
	incurredAt?: Date;
}) {
	const { address, country, invoiceInfo, notesHtml, accountingCategoryId } = input;
	return {
		type: 'INVOICE',
		description: input.title,
		currency: input.currency,
		payee: { slug: payeeSlug },
		payoutMethod: { publicId: input.payoutMethodId },
		items: [
			{
				description: input.itemDescription,
				amountV2: { valueInCents: input.amountInCents, currency: input.currency },
				incurredAt: incurredAt.toISOString()
			}
		],
		...(invoiceInfo && { invoiceInfo }),
		...(notesHtml && { privateMessage: notesHtml }),
		...(accountingCategoryId && { accountingCategory: { id: accountingCategoryId } }),
		...((address || country) && { payeeLocation: { address, country } })
	};
}
