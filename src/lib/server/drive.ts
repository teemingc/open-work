/**
 * The work log's copy in the user's Google Drive: one JSON file in the app data folder, which
 * only this app can see.
 * @see https://developers.google.com/workspace/drive/api/guides/appdata
 */

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_NAME = 'work-log.json';

export class DriveError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

export interface DriveFile {
	id: string;
	modifiedTime: string;
}

async function drive(token: string, url: string, init: RequestInit = {}): Promise<Response> {
	const response = await fetch(url, {
		...init,
		headers: { ...init.headers, authorization: `Bearer ${token}` }
	});
	if (response.ok) return response;
	const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
	throw new DriveError(
		body?.error?.message ?? `Google Drive returned an error (${response.status}).`,
		response.status
	);
}

export async function findWorkLog(token: string): Promise<DriveFile | undefined> {
	const url = new URL(FILES);
	url.searchParams.set('spaces', 'appDataFolder');
	url.searchParams.set('q', `name = '${FILE_NAME}' and trashed = false`);
	url.searchParams.set('fields', 'files(id,modifiedTime)');
	url.searchParams.set('orderBy', 'modifiedTime desc');
	const { files } = (await (await drive(token, url.toString())).json()) as { files: DriveFile[] };
	return files[0];
}

export async function readWorkLog(token: string, id: string): Promise<string> {
	return (await drive(token, `${FILES}/${id}?alt=media`)).text();
}

/** Create the file the first time, then replace its contents. */
export async function writeWorkLog({
	token,
	id,
	json
}: {
	token: string;
	id?: string;
	json: string;
}): Promise<DriveFile> {
	if (id) {
		const response = await drive(token, `${UPLOAD}/${id}?uploadType=media&fields=id,modifiedTime`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: json
		});
		return (await response.json()) as DriveFile;
	}

	const boundary = `worklog${crypto.randomUUID()}`;
	const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
	const body = [
		`--${boundary}`,
		'content-type: application/json; charset=UTF-8',
		'',
		metadata,
		`--${boundary}`,
		'content-type: application/json',
		'',
		json,
		`--${boundary}--`
	].join('\r\n');
	const response = await drive(token, `${UPLOAD}?uploadType=multipart&fields=id,modifiedTime`, {
		method: 'POST',
		headers: { 'content-type': `multipart/related; boundary=${boundary}` },
		body
	});
	return (await response.json()) as DriveFile;
}
