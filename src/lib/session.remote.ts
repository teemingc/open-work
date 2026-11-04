import { getRequestEvent, query } from '$app/server';
import { signedIn } from '#lib/server/session.js';

/** Whether this browser is signed in to Open Collective or Google, from its cookies alone. */
export const hasSession = query(async () => signedIn(getRequestEvent().cookies));
