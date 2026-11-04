import type { RequestHandler } from './$types';

/**
 * Has the browser delete everything it keeps for this site, after signing out and clearing this
 * browser: its cache, which the app cannot reach, as well as cookies and storage.
 * @see https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Clear-Site-Data
 */
export const POST: RequestHandler = () =>
	new Response(null, {
		status: 204,
		headers: { 'clear-site-data': '"cache", "cookies", "storage"' }
	});
