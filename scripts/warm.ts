// Gathers what the site keeps fresh on a schedule, so the first visit after a deploy finds it
// stored. Run after `wrangler deploy`; each refresh does nothing while what is stored is fresh.

const origin = process.argv[2] ?? 'https://openwork.ing';

const response = await fetch(`${origin}/contributors/refresh`, {
	method: 'POST',
	// From the site itself, as SvelteKit refuses a POST from anywhere else.
	headers: { origin }
});
if (!response.ok) {
	console.error(`Refreshing the leaderboard failed (${response.status}).`);
	process.exitCode = 1;
}
