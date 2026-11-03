import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { getAuth, googleConfigured, withDrive } from '#lib/server/auth.js';
import { findWorkLog, readWorkLog, writeWorkLog } from '#lib/server/drive.js';

export interface DriveStatus {
	/** Google sign-in is set up on this server. */
	available: boolean;
	/** The signed-in Google account, if any. */
	account: { email: string; name: string } | null;
}

/**
 * Whether the work log can sync to Google Drive, and for whom. A command rather than a query
 * because reading the session can refresh its cookie, and queries cannot set cookies.
 */
export const getDriveStatus = command(async (): Promise<DriveStatus> => {
	if (!googleConfigured()) return { available: false, account: null };
	const session = await getAuth().api.getSession({ headers: getRequestEvent().request.headers });
	return {
		available: true,
		account: session ? { email: session.user.email, name: session.user.name } : null
	};
});

/**
 * The work log saved in Drive, or null before the first sync. `version` is passed back when
 * pushing, so a save never replaces one it has not seen.
 */
export const pullWorkLog = command(async (): Promise<{ json: string; version: string } | null> =>
	withDrive(async (token) => {
		const file = await findWorkLog(token);
		return file ? { json: await readWorkLog(token, file.id), version: file.modifiedTime } : null;
	})
);

/**
 * Save the work log to Drive, replacing what is there, unless another device saved since
 * `expected` was pulled. Then nothing is saved and `conflict` asks to pull and merge again.
 */
export const pushWorkLog = command(
	v.object({
		json: v.pipe(v.string(), v.maxLength(5_000_000, 'The work log is too big to sync.')),
		expected: v.nullable(v.string())
	}),
	async ({ json, expected }): Promise<{ conflict: boolean }> =>
		withDrive(async (token) => {
			const file = await findWorkLog(token);
			if ((file?.modifiedTime ?? null) !== expected) return { conflict: true };
			await writeWorkLog({ token, id: file?.id, json });
			return { conflict: false };
		})
);
