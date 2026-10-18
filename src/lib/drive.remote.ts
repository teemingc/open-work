import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { getAuth, googleConfigured } from '#lib/server/auth.js';
import { DriveError, findWorkLog, readWorkLog, writeWorkLog } from '#lib/server/drive.js';

export interface DriveStatus {
	/** Google sign-in is set up on this server. */
	available: boolean;
	/** The signed-in Google account, if any. */
	account: { email: string; name: string } | null;
}

/** Whether the work log can sync to Google Drive, and for whom. */
export const getDriveStatus = query(async (): Promise<DriveStatus> => {
	if (!googleConfigured()) return { available: false, account: null };
	const session = await getAuth().api.getSession({ headers: getRequestEvent().request.headers });
	return {
		available: true,
		account: session ? { email: session.user.email, name: session.user.name } : null
	};
});

/** A fresh Google access token from the encrypted account cookie, refreshed when it has expired. */
async function accessToken(): Promise<string> {
	if (!googleConfigured()) error(404, 'Google Drive sync is not set up on this server.');
	try {
		const { accessToken } = await getAuth().api.getAccessToken({
			body: { useAccountCookie: true },
			headers: getRequestEvent().request.headers
		});
		return accessToken;
	} catch {
		error(401, 'Sign in with Google again to keep syncing.');
	}
}

async function withDrive<T>(fn: (token: string) => Promise<T>): Promise<T> {
	const token = await accessToken();
	try {
		return await fn(token);
	} catch (err) {
		if (err instanceof DriveError) {
			error(
				err.status === 401 ? 401 : 502,
				err.status === 401 ? 'Sign in with Google again to keep syncing.' : err.message
			);
		}
		throw err;
	}
}

/** The work log saved in Drive, or null before the first sync. */
export const pullWorkLog = command(async (): Promise<{ json: string } | null> =>
	withDrive(async (token) => {
		const file = await findWorkLog(token);
		return file ? { json: await readWorkLog(token, file.id) } : null;
	})
);

/** Save the work log to Drive, replacing what is there. */
export const pushWorkLog = command(
	v.pipe(v.string(), v.maxLength(5_000_000, 'The work log is too big to sync.')),
	async (json): Promise<{ modifiedTime: string }> =>
		withDrive(async (token) => {
			const file = await findWorkLog(token);
			const saved = await writeWorkLog({ token, id: file?.id, json });
			return { modifiedTime: saved.modifiedTime };
		})
);
