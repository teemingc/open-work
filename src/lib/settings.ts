import * as v from 'valibot';

/** Empty text inputs submit `""`; store those as `undefined`. */
const optionalText = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.transform((value) => value || undefined)
);

export const SettingsSchema = v.object({
	githubUsername: optionalText,
	githubToken: optionalText,
	organization: v.pipe(v.optional(v.string(), ''), v.trim()),
	/** Repository names to include. Empty means everything in the organization. */
	repositories: v.optional(v.array(v.pipe(v.string(), v.trim(), v.nonEmpty())), []),

	hourlyRate: v.pipe(v.number('Enter a number'), v.minValue(0, 'Rate cannot be negative')),
	currency: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/, 'Use a three-letter code like USD')),

	collectiveSlug: v.pipe(v.optional(v.string(), ''), v.trim()),
	payoutMethodId: optionalText,
	payoutMethodLabel: optionalText,
	/** Free text added to every invoice, such as a tax number. */
	invoiceNote: optionalText,
	payeeAddress: optionalText,
	payeeCountry: v.pipe(
		optionalText,
		v.transform((value) => value?.toUpperCase()),
		v.check((value) => !value || /^[A-Z]{2}$/.test(value), 'Use two letters like MY')
	),
	accountingCategoryId: optionalText
});

export type Settings = v.InferOutput<typeof SettingsSchema>;

/** A fresh start: nothing assumed about who you work for or what you charge. */
export const DEFAULT_SETTINGS: Settings = v.parse(SettingsSchema, {
	hourlyRate: 0,
	currency: 'USD'
});

export type SubmitRequirement =
	'Open Collective connection' | 'payout method' | 'collective' | 'hourly rate';

/** What is still missing before an invoice can be sent to Open Collective. */
export function missingForSubmit({
	settings,
	connected
}: {
	settings: Settings;
	/** Whether `getMe()` found an account. */
	connected: boolean;
}): SubmitRequirement[] {
	const missing: SubmitRequirement[] = [];
	if (!connected) missing.push('Open Collective connection');
	if (!settings.payoutMethodId) missing.push('payout method');
	if (!settings.collectiveSlug) missing.push('collective');
	if (!(settings.hourlyRate > 0)) missing.push('hourly rate');
	return missing;
}

/**
 * Settings saved by earlier versions, brought up to date: the tax income number became a
 * general invoice note, keeping its wording so invoices read the same.
 */
export function upgradeSettings(raw: Record<string, unknown>): Record<string, unknown> {
	const { taxIncomeNumber, ...rest } = raw;
	if (typeof taxIncomeNumber === 'string' && taxIncomeNumber.trim() && !rest.invoiceNote) {
		return { ...rest, invoiceNote: `Tax income number: ${taxIncomeNumber.trim()}` };
	}
	return rest;
}

const BACKUP_VERSION = 3;

/** Backup file contents. The GitHub token is left out. */
export function exportBackup(settings: Settings): string {
	const { githubToken: _githubToken, ...rest } = settings;
	void _githubToken;
	return JSON.stringify({ version: BACKUP_VERSION, data: { settings: rest } }, null, 2);
}

/**
 * Settings from a backup file, or from what older versions kept in localStorage. Invoices and
 * the Open Collective token they stored are dropped. Throws if the data is not valid.
 */
export function parseBackup(json: string): Settings {
	const parsed = JSON.parse(json) as {
		version?: number;
		data?: { settings?: Record<string, unknown> & { defaultCurrency?: string } };
	};
	if (!parsed.data || !parsed.version || parsed.version > BACKUP_VERSION) {
		throw new Error('Not a backup file');
	}
	const { defaultCurrency, ...settings } = parsed.data.settings ?? {};
	return v.parse(SettingsSchema, {
		...DEFAULT_SETTINGS,
		...(defaultCurrency && { currency: defaultCurrency }),
		...upgradeSettings(settings)
	});
}

/** Where versions before the settings cookie kept everything. */
export const LEGACY_STORAGE_KEY = 'oc-invoice-data';
