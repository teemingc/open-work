// Gathers what the site keeps fresh on a schedule, so the first visit after a deploy finds it
// stored. Run after `wrangler deploy`; each refresh does nothing while what is stored is fresh.

import { ORIGIN } from '../src/lib/origin.ts';

const origin = process.argv[2] ?? ORIGIN;

/** More than a scan needs: each call carries it on by up to 50 requests, of about 66 in all. */
const MAX_CALLS = 6;

for (let call = 1; ; call++) {
	const response = await fetch(`${origin}/contributors/refresh`, {
		method: 'POST',
		// From the site itself, as SvelteKit refuses a POST from anywhere else.
		headers: { origin }
	});
	if (!response.ok) {
		console.error(`Refreshing the leaderboard failed (${response.status}).`);
		process.exitCode = 1;
		break;
	}
	// 202: the scan is under way, and the next call carries it on.
	if (response.status !== 202) break;
	if (call === MAX_CALLS) {
		console.error(`The leaderboard scan was still under way after ${MAX_CALLS} calls.`);
		process.exitCode = 1;
		break;
	}
}
