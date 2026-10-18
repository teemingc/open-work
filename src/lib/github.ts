import { toIsoDate } from './format';
import type { WorkRef } from './worklog';

const API = 'https://api.github.com';
const EVENTS_PER_PAGE = 100;
const MAX_PAGES = 3; // GitHub only keeps the latest 300 events per user

export class GitHubError extends Error {}

interface GitHubEvent {
	type: string;
	created_at: string;
	repo: { name: string };
	payload: {
		action?: string;
		number?: number;
		pull_request?: { number: number };
		issue?: { number: number; pull_request?: unknown };
	};
}

export interface ActivityItem {
	date: string; // YYYY-MM-DD
	ref: Extract<WorkRef, { kind: 'pr' | 'issue' }>;
}

export interface ActivityResult {
	entries: ActivityItem[];
	/** False when the 300-event limit cut off the start of the period. */
	coversPeriod: boolean;
}

async function request<T>({ url, token }: { url: string; token?: string }): Promise<T> {
	const response = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github+json',
			...(token ? { Authorization: `Bearer ${token}` } : {})
		}
	});

	if (response.ok) return (await response.json()) as T;

	if (response.status === 401) {
		throw new GitHubError('GitHub rejected the token. Check it in Settings.');
	}
	if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
		const reset = Number(response.headers.get('x-ratelimit-reset'));
		const when = reset ? new Date(reset * 1000).toLocaleTimeString() : 'later';
		throw new GitHubError(`GitHub rate limit reached. Try again after ${when}.`);
	}
	if (response.status === 404) {
		throw new GitHubError('GitHub could not find that user. Check the username in Settings.');
	}
	throw new GitHubError(`GitHub returned an error (${response.status}).`);
}

/** Check a token and return the account it belongs to. */
export async function verifyGitHubToken(token: string): Promise<{ login: string }> {
	return request<{ login: string }>({ url: `${API}/user`, token });
}

function eventTarget(event: GitHubEvent): Pick<ActivityItem['ref'], 'kind' | 'number'> | undefined {
	const { payload } = event;
	switch (event.type) {
		case 'PullRequestEvent': {
			const open = ['opened', 'closed', 'reopened', 'ready_for_review'];
			const number = payload.pull_request?.number ?? payload.number;
			return payload.action && open.includes(payload.action) && number
				? { kind: 'pr', number }
				: undefined;
		}
		case 'PullRequestReviewEvent':
		case 'PullRequestReviewCommentEvent':
			return payload.pull_request ? { kind: 'pr', number: payload.pull_request.number } : undefined;
		case 'IssueCommentEvent':
			return payload.action === 'created' && payload.issue
				? { kind: payload.issue.pull_request ? 'pr' : 'issue', number: payload.issue.number }
				: undefined;
		case 'IssuesEvent': {
			const open = ['opened', 'closed', 'reopened'];
			return payload.action && open.includes(payload.action) && payload.issue
				? { kind: 'issue', number: payload.issue.number }
				: undefined;
		}
		default:
			return undefined;
	}
}

/**
 * PRs and issues you opened, reviewed or commented on during a period, read from
 * your GitHub activity feed.
 */
export async function fetchActivity({
	username,
	token,
	organization,
	repositories,
	startDate,
	endDate
}: {
	username: string;
	token?: string;
	organization?: string;
	repositories: string[];
	startDate: string;
	endDate: string;
}): Promise<ActivityResult> {
	const org = organization?.trim().toLowerCase();
	const allowed = new Set(repositories.map((repo) => repo.trim().toLowerCase()).filter(Boolean));

	const entries: ActivityItem[] = [];
	const seen = new Set<string>();
	let coversPeriod = false;

	for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
		const events = await request<GitHubEvent[]>({
			url: `${API}/users/${encodeURIComponent(username)}/events?per_page=${EVENTS_PER_PAGE}&page=${pageNumber}`,
			token
		});

		for (const event of events) {
			const date = toIsoDate(new Date(event.created_at));
			if (date < startDate) {
				coversPeriod = true;
				continue;
			}
			if (date > endDate) continue;

			const target = eventTarget(event);
			if (!target) continue;

			const [owner, name] = event.repo.name.split('/');
			if (org && owner.toLowerCase() !== org) continue;
			if (
				allowed.size > 0 &&
				!allowed.has(name.toLowerCase()) &&
				!allowed.has(event.repo.name.toLowerCase())
			) {
				continue;
			}

			const key = `${date}|${event.repo.name}|${target.kind}|${target.number}`;
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push({ date, ref: { owner, repo: name, ...target } });
		}

		if (events.length < EVENTS_PER_PAGE) {
			coversPeriod = true;
			break;
		}
		if (coversPeriod) break;
	}

	// The feed is newest first; the log reads oldest first.
	entries.reverse();
	return { entries, coversPeriod };
}
