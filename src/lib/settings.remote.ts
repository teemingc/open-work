import { command, form, getRequestEvent, query } from '$app/server';
import { dev } from '$app/env';
import * as v from 'valibot';
import { clearToken } from '#lib/server/session.js';
import { DEFAULT_SETTINGS, SettingsSchema, upgradeSettings, type Settings } from '#lib/settings.js';
import { getMe } from '#lib/opencollective.remote.js';

const COOKIE = 'settings';
/** Browsers cap cookie lifetimes at 400 days. */
const MAX_AGE = 60 * 60 * 24 * 400;

function writeSettings(settings: Settings): void {
	getRequestEvent().cookies.set(COOKIE, JSON.stringify(settings), {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: MAX_AGE
	});
	getSettings().set(settings);
}

/** Your settings, kept in a cookie so the server can use them. */
export const getSettings = query(async (): Promise<Settings> => {
	const raw = getRequestEvent().cookies.get(COOKIE);
	if (!raw) return { ...DEFAULT_SETTINGS };
	try {
		const result = v.safeParse(SettingsSchema, {
			...DEFAULT_SETTINGS,
			...upgradeSettings(JSON.parse(raw))
		});
		return result.success ? result.output : { ...DEFAULT_SETTINGS };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
});

/** The settings page. It submits itself whenever a field changes. */
export const saveSettings = form(SettingsSchema, async (settings) => {
	writeSettings(settings);
	return { saved: true };
});

/** Replace every setting at once, from a backup or from what older versions kept in the browser. */
export const restoreSettings = command(SettingsSchema, async (settings) => {
	writeSettings(settings);
});

/** Forget the Open Collective connection in this browser. */
export const disconnect = form(async () => {
	clearToken(getRequestEvent().cookies);
	void getMe().refresh();
});

/** Remove every setting and the Open Collective connection. */
export const clearAllData = form(async () => {
	const { cookies } = getRequestEvent();
	cookies.delete(COOKIE, { path: '/' });
	clearToken(cookies);
	getSettings().set({ ...DEFAULT_SETTINGS });
	void getMe().refresh();
});
