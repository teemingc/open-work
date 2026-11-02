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

	/** The rate and currency a new client starts with. */
	hourlyRate: v.pipe(v.number('Enter a number'), v.minValue(0, 'Rate cannot be negative')),
	currency: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/, 'Use a three-letter code like USD')),

	collectiveSlug: v.pipe(v.optional(v.string(), ''), v.trim()),
	payoutMethodId: optionalText,
	payoutMethodLabel: optionalText,
	accountingCategoryId: optionalText,

	/**
	 * Moved into the work log's invoicing details, which emailed invoices share: read only to move
	 * them there, then cleared. See `moveToWorkLog`.
	 */
	invoiceNote: optionalText,
	payeeAddress: optionalText,
	payeeCountry: optionalText
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
	connected,
	rate
}: {
	settings: Settings;
	/** Whether `getMe()` found an account. */
	connected: boolean;
	/** The Open Collective client's hourly rate. Unknown while the work log opens. */
	rate: number | undefined;
}): SubmitRequirement[] {
	const missing: SubmitRequirement[] = [];
	if (!connected) missing.push('Open Collective connection');
	if (!settings.payoutMethodId) missing.push('payout method');
	if (!settings.collectiveSlug) missing.push('collective');
	if (rate !== undefined && !(rate > 0)) missing.push('hourly rate');
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

const BACKUP_VERSION = 4;

/** Backup file contents, with only the parts given. The GitHub token is left out. */
export function exportBackup({
	settings,
	workLog
}: {
	settings?: Settings;
	workLog?: unknown;
}): string {
	const { githubToken: _githubToken, ...rest } = settings ?? {};
	void _githubToken;
	return JSON.stringify(
		{ version: BACKUP_VERSION, data: { settings: settings && rest, workLog } },
		null,
		2
	);
}

/**
 * What a backup file holds, so a file with only one part restores only that part. Backups
 * before version 4 hold only settings, and a work log backup from before they were combined
 * is the bare log. Throws if the file is not JSON.
 */
export function readBackup(json: string): { settings?: Settings; workLog?: unknown } {
	const parsed = JSON.parse(json) as { data?: { settings?: unknown; workLog?: unknown } };
	if (!parsed.data) return { workLog: parsed };
	if (!parsed.data.settings && parsed.data.workLog === undefined) throw new Error('Empty backup');
	return {
		settings: parsed.data.settings ? parseBackup(json) : undefined,
		workLog: parsed.data.workLog
	};
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
