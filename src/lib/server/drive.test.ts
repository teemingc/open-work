import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveError, deleteWorkLog } from './drive';

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Answers the file listing with `ids`, and every other request with `status`. */
function stubDrive(ids: string[], status = 204) {
	const fetch = vi.fn(async (url: string, init?: RequestInit) => {
		if (!init?.method) {
			return Response.json({
				files: ids.map((id) => ({ id, modifiedTime: '2026-01-01T00:00:00.000Z' }))
			});
		}
		return status === 204
			? new Response(null, { status })
			: Response.json({ error: { message: 'Nope' } }, { status });
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

describe('deleteWorkLog', () => {
	it('deletes every copy in the app data folder', async () => {
		const fetch = stubDrive(['a', 'b']);
		await deleteWorkLog('token');

		const deleted = fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
		expect(deleted.map(([url]) => url)).toEqual([
			'https://www.googleapis.com/drive/v3/files/a',
			'https://www.googleapis.com/drive/v3/files/b'
		]);
		const [listUrl, listInit] = fetch.mock.calls[0];
		expect(new URL(listUrl).searchParams.get('spaces')).toBe('appDataFolder');
		expect(new Headers(listInit?.headers).get('authorization')).toBe('Bearer token');
	});

	it('does nothing when there is no copy', async () => {
		const fetch = stubDrive([]);
		await deleteWorkLog('token');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('throws when Drive refuses', async () => {
		stubDrive(['a'], 403);
		await expect(deleteWorkLog('token')).rejects.toEqual(new DriveError('Nope', 403));
	});
});
