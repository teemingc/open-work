import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** There's no collective index yet, so send visitors to the home page. Temporary, in case one is added later. */
export const GET: RequestHandler = () => {
	redirect(307, resolve('/'));
};
