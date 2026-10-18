import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchActivity } from './github';

function event({
	type,
	created_at,
	repo = 'sveltejs/kit',
	payload
}: {
	type: string;
	created_at: string;
	repo?: string;
	payload: Record<string, unknown>;
}) {
	return { type, created_at, repo: { name: repo }, payload };
}

function mockEvents(events: unknown[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(events), { status: 200 }))
	);
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchActivity', () => {
	it('turns events into deduplicated, oldest-first work log entries', async () => {
		mockEvents([
			// newest first, like the real API
			event({
				type: 'IssueCommentEvent',
				created_at: '2026-10-05T12:00:00Z',
				payload: { action: 'created', issue: { number: 17324, pull_request: {} } }
			}),
			event({
				type: 'PullRequestReviewEvent',
				created_at: '2026-10-05T10:00:00Z',
				payload: { action: 'created', pull_request: { number: 17324 } }
			}),
			event({
				type: 'IssuesEvent',
				created_at: '2026-10-02T10:00:00Z',
				payload: { action: 'opened', issue: { number: 15011 } }
			}),
			event({
				type: 'PullRequestEvent',
				created_at: '2026-10-01T10:00:00Z',
				payload: { action: 'opened', number: 17292, pull_request: { number: 17292 } }
			}),
			// ignored: other org, other event types, outside the period
			event({
				type: 'PullRequestEvent',
				created_at: '2026-10-03T10:00:00Z',
				repo: 'other/thing',
				payload: { action: 'opened', pull_request: { number: 1 } }
			}),
			event({
				type: 'PushEvent',
				created_at: '2026-10-03T10:00:00Z',
				payload: {}
			}),
			event({
				type: 'PullRequestEvent',
				created_at: '2026-09-20T10:00:00Z',
				payload: { action: 'opened', pull_request: { number: 5 } }
			})
		]);

		const { entries, coversPeriod } = await fetchActivity({
			username: 'someone',
			organization: 'sveltejs',
			repositories: [],
			startDate: '2026-10-01',
			endDate: '2026-10-15'
		});

		expect(coversPeriod).toBe(true);
		expect(entries.map(({ ref }) => [ref.owner, ref.repo, ref.kind, ref.number])).toEqual([
			['sveltejs', 'kit', 'pr', 17292],
			['sveltejs', 'kit', 'issue', 15011],
			['sveltejs', 'kit', 'pr', 17324]
		]);
	});

	it('limits to the chosen repositories', async () => {
		mockEvents([
			event({
				type: 'PullRequestEvent',
				created_at: '2026-10-02T10:00:00Z',
				repo: 'sveltejs/svelte',
				payload: { action: 'opened', pull_request: { number: 7 } }
			}),
			event({
				type: 'PullRequestEvent',
				created_at: '2026-10-02T11:00:00Z',
				payload: { action: 'opened', pull_request: { number: 8 } }
			})
		]);

		const { entries } = await fetchActivity({
			username: 'someone',
			organization: 'sveltejs',
			repositories: ['kit'],
			startDate: '2026-10-01',
			endDate: '2026-10-15'
		});

		expect(entries.map((entry) => entry.ref.number)).toEqual([8]);
	});

	it('explains a bad token', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('{}', { status: 401 }))
		);
		await expect(
			fetchActivity({
				username: 'someone',
				token: 'nope',
				organization: 'sveltejs',
				repositories: [],
				startDate: '2026-10-01',
				endDate: '2026-10-15'
			})
		).rejects.toThrow('rejected the token');
	});
});
