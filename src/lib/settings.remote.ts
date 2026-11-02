import { command, form, getRequestEvent, query } from '$app/server';
import { dev } from '$app/env';
import * as v from 'valibot';
import { getAuth, googleConfigured } from '#lib/server/auth.js';
import { clearToken } from '#lib/server/session.js';
import { DEFAULT_SETTINGS, SettingsSchema, upgradeSettings, type Settings } from '#lib/settings.js';
import { getMe } from '#lib/opencollective.remote.js';

/** Where earlier versions kept every setting. Read once, to move them into the work log. */
const LEGACY_COOKIE = 'settings';
/** The collective you invoice, so the header can link to it before the work log opens. */
const COLLECTIVE_COOKIE = 'collective';
/** Browsers cap cookie lifetimes at 400 days. */
const MAX_AGE = 60 * 60 * 24 * 400;

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

/** The collective you invoice, if you have named one. */
export const getCollectiveSlug = query(
	async (): Promise<string> => getRequestEvent().cookies.get(COLLECTIVE_COOKIE) ?? ''
);

export const setCollectiveSlug = command(v.string(), async (slug) => {
	const { cookies } = getRequestEvent();
	if (slug) {
		cookies.set(COLLECTIVE_COOKIE, slug, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: MAX_AGE
		});
	} else {
		cookies.delete(COLLECTIVE_COOKIE, { path: '/' });
	}
	getCollectiveSlug().set(slug);
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
		const settings: Partial<Settings> = Object.fromEntries(
			shown.map((key) => [key, v.parse(SettingsSchema.entries[key], submitted[key])])
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
 * Sign out of Open Collective and Google and delete the cookies kept for this app. The browser
 * deletes the work log, with your settings, itself.
 */
export const clearAllData = form(async () => {
	const { cookies, request } = getRequestEvent();
	cookies.delete(LEGACY_COOKIE, { path: '/' });
	cookies.delete(COLLECTIVE_COOKIE, { path: '/' });
	clearToken(cookies);
	// Expires the encrypted session and Google token cookies.
	if (googleConfigured()) await getAuth().api.signOut({ headers: request.headers });
	getLegacySettings().set(null);
	getCollectiveSlug().set('');
	void getMe().refresh();
});
