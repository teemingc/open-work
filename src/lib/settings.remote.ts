import { command, form, getRequestEvent, query } from '$app/server';
import * as v from 'valibot';
import { getAuth, googleConfigured, withDrive } from '#lib/server/auth.js';
import { deleteWorkLog } from '#lib/server/drive.js';
import { clearToken } from '#lib/server/session.js';
import { DEFAULT_SETTINGS, SettingsSchema, upgradeSettings, type Settings } from '#lib/settings.js';
import { getMe } from '#lib/opencollective.remote.js';
import { hasSession } from '#lib/session.remote.js';

/** Where earlier versions kept every setting. Read once, to move them into the work log. */
const LEGACY_COOKIE = 'settings';
/** Where a version kept the collective you invoiced, for the header's link. Only deleted now. */
const COLLECTIVE_COOKIE = 'collective';

/** The settings earlier versions kept in a cookie, or null once they have moved. */
export const getLegacySettings = query(async (): Promise<Settings | null> => {
	const raw = getRequestEvent().cookies.get(LEGACY_COOKIE);
	if (!raw) return null;
	try {
		const result = v.safeParse(SettingsSchema, {
			...DEFAULT_SETTINGS,
			...upgradeSettings(JSON.parse(raw))
		});
		return result.success ? result.output : null;
	} catch {
		return null;
	}
});

/** Delete the settings cookie, once the work log holds its settings. */
export const forgetLegacySettings = command(async () => {
	getRequestEvent().cookies.delete(LEGACY_COOKIE, { path: '/' });
	getLegacySettings().set(null);
});

const SETTING_KEYS = Object.keys(SettingsSchema.entries) as (keyof Settings)[];

/**
 * Check a settings page, which submits itself whenever a field changes, and hand back the
 * settings it shows, named in `shown`, for the browser to keep in the work log. One left empty
 * is cleared.
 */
export const saveSettings = form(
	v.object({ ...v.partial(SettingsSchema).entries, shown: v.array(v.picklist(SETTING_KEYS)) }),
	async ({ shown, ...submitted }) => {
		// An emptied number arrives as undefined, so it goes back to its default rather than failing.
		const settings: Partial<Settings> = Object.fromEntries(
			shown.map((key) => [
				key,
				v.parse(SettingsSchema.entries[key], submitted[key] ?? DEFAULT_SETTINGS[key])
			])
		);
		return { saved: true, settings };
	}
);

/** Forget the Open Collective connection in this browser. */
export const disconnect = form(async () => {
	clearToken(getRequestEvent().cookies);
	void getMe().refresh();
});

/**
 * Sign out of Open Collective and Google and delete the cookies kept for this app, and with
 * `deleteDrive`, the work log's copy in Google Drive first. The browser deletes the work log,
 * with your settings, itself.
 */
export const clearAllData = form(
	v.object({ deleteDrive: v.optional(v.boolean(), false) }),
	async ({ deleteDrive }) => {
		const { cookies, request } = getRequestEvent();
		// Before anything is signed out, so a failure leaves everything as it was.
		if (deleteDrive) await withDrive(deleteWorkLog);
		cookies.delete(LEGACY_COOKIE, { path: '/' });
		cookies.delete(COLLECTIVE_COOKIE, { path: '/' });
		clearToken(cookies);
		// Expires the encrypted session and Google token cookies.
		if (googleConfigured()) await getAuth().api.signOut({ headers: request.headers });
		getLegacySettings().set(null);
		void getMe().refresh();
		void hasSession().refresh();
	}
);
