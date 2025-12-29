export interface GitHubAPIOptions {
	username: string;
	token?: string;
	repositories: string[];
	year: number;
	month: number;
	customStartDate?: string; // ISO date string to override default month start
	customEndDate?: string; // ISO date string to override default month end
	onProgress?: (progress: ProgressUpdate) => void;
}

export interface ProgressUpdate {
	type: 'repo-complete' | 'discussions-complete' | 'complete';
	repo?: string;
	completedRepos: number;
	totalRepos: number;
	contributionsFound: number;
}

export interface GitHubAPIResponse {
	contributions: GitHubContribution[];
	fetchedAt: string;
	rateLimit: {
		remaining: number;
		reset: string;
	};
}

export interface RateLimit {
	remaining: number;
	reset: string;
}

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Fetch all contributions for a given month
 */
export async function fetchContributionsForMonth({
	username,
	token,
	repositories,
	year,
	month,
	customStartDate,
	customEndDate,
	onProgress
}: GitHubAPIOptions): Promise<GitHubAPIResponse> {
	// Calculate date range - use custom dates if provided, otherwise default to full month
	const startDate = customStartDate ? new Date(customStartDate) : new Date(year, month - 1, 1);
	const endDate = customEndDate ? new Date(customEndDate) : new Date(year, month, 0, 23, 59, 59);

	const contributions: GitHubContribution[] = [];
	const rateLimit: RateLimit = { remaining: 0, reset: '' };
	let completedRepos = 0;

	// Fetch from all repositories concurrently
	const repoPromises = repositories.map(async (repo) => {
		const [owner, repoName] = repo.split('/');
		if (!owner || !repoName) return [];

		try {
			// Fetch all contribution types concurrently for this repo
			const [prs, commits, reviews, issues] = await Promise.all([
				fetchPRs({ owner, repo: repoName, username, token, startDate, endDate }),
				fetchCommits({ owner, repo: repoName, username, token, startDate, endDate }),
				fetchReviews({ owner, repo: repoName, username, token, startDate, endDate }),
				fetchIssues({ owner, repo: repoName, username, token, startDate, endDate })
			]);

			const repoContributions = [...prs, ...commits, ...reviews, ...issues];

			// Report progress after this repo completes
			completedRepos++;
			if (onProgress) {
				onProgress({
					type: 'repo-complete',
					repo,
					completedRepos,
					totalRepos: repositories.length,
					contributionsFound: repoContributions.length
				});
			}

			return repoContributions;
		} catch (error) {
			console.error(`Failed to fetch contributions from ${repo}:`, error);
			completedRepos++;
			if (onProgress) {
				onProgress({
					type: 'repo-complete',
					repo,
					completedRepos,
					totalRepos: repositories.length,
					contributionsFound: 0
				});
			}
			throw error;
		}
	});

	// Wait for all repositories to complete (use allSettled to not fail fast)
	const results = await Promise.allSettled(repoPromises);

	// Collect successful results
	for (const result of results) {
		if (result.status === 'fulfilled') {
			contributions.push(...result.value);
		}
	}

	// Fetch discussions (org-wide)
	try {
		if (token) {
			const discussions = await fetchDiscussions({ username, token, startDate, endDate });
			contributions.push(...discussions);
			if (onProgress) {
				onProgress({
					type: 'discussions-complete',
					completedRepos: repositories.length,
					totalRepos: repositories.length,
					contributionsFound: discussions.length
				});
			}
		}
	} catch (error) {
		console.error('Failed to fetch discussions:', error);
	}

	if (onProgress) {
		onProgress({
			type: 'complete',
			completedRepos: repositories.length,
			totalRepos: repositories.length,
			contributionsFound: contributions.length
		});
	}

	return {
		contributions,
		fetchedAt: new Date().toISOString(),
		rateLimit
	};
}

/**
 * Fetch PRs authored by user in date range
 */
async function fetchPRs({
	owner,
	repo,
	username,
	token,
	startDate,
	endDate
}: {
	owner: string;
	repo: string;
	username: string;
	token: string | undefined;
	startDate: Date;
	endDate: Date;
}): Promise<GitHubContribution[]> {
	const query = `author:${username} repo:${owner}/${repo} type:pr created:${formatDateForSearch(startDate)}..${formatDateForSearch(endDate)}`;
	const url = new URL(`${GITHUB_API_BASE}/search/issues`);
	url.searchParams.set('q', query);
	url.searchParams.set('per_page', '100');

	const response = await fetchWithAuth(url.toString(), token);
	const data = (await response.json()) as { items?: unknown[] };

	return (data.items || []).map((item: unknown) => {
		const pr = item as {
			number: number;
			title: string;
			html_url: string;
			created_at: string;
			body: string;
		};
		return {
			id: `pr-${pr.number}`,
			type: 'pr' as const,
			repository: `${owner}/${repo}`,
			title: pr.title,
			url: pr.html_url,
			date: pr.created_at,
			description: pr.body
		};
	});
}

/**
 * Fetch commits by user in date range
 */
async function fetchCommits({
	owner,
	repo,
	username,
	token,
	startDate,
	endDate
}: {
	owner: string;
	repo: string;
	username: string;
	token: string | undefined;
	startDate: Date;
	endDate: Date;
}): Promise<GitHubContribution[]> {
	const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`);
	url.searchParams.set('author', username);
	url.searchParams.set('since', startDate.toISOString());
	url.searchParams.set('until', endDate.toISOString());
	url.searchParams.set('per_page', '100');

	const response = await fetchWithAuth(url.toString(), token);
	const data = (await response.json()) as unknown[];

	return (data || []).map((item: unknown) => {
		const commit = item as {
			sha: string;
			html_url: string;
			commit: {
				message: string;
				author: { date: string };
			};
		};
		return {
			id: `commit-${commit.sha}`,
			type: 'commit' as const,
			repository: `${owner}/${repo}`,
			title: commit.commit.message.split('\n')[0],
			url: commit.html_url,
			date: commit.commit.author.date,
			description: commit.commit.message
		};
	});
}

/**
 * Fetch PR reviews by user in date range
 */
async function fetchReviews({
	owner,
	repo,
	username,
	token,
	startDate,
	endDate
}: {
	owner: string;
	repo: string;
	username: string;
	token: string | undefined;
	startDate: Date;
	endDate: Date;
}): Promise<GitHubContribution[]> {
	// First, get all PRs in the date range
	const query = `repo:${owner}/${repo} type:pr updated:${formatDateForSearch(startDate)}..${formatDateForSearch(endDate)}`;
	const url = new URL(`${GITHUB_API_BASE}/search/issues`);
	url.searchParams.set('q', query);
	url.searchParams.set('per_page', '100');

	const response = await fetchWithAuth(url.toString(), token);
	const data = (await response.json()) as { items?: unknown[] };
	const reviews: GitHubContribution[] = [];

	// For each PR, fetch reviews by the user
	for (const item of data.items || []) {
		const pr = item as { number: number; title: string };
		const reviewsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${pr.number}/reviews`;
		try {
			const reviewsResponse = await fetchWithAuth(reviewsUrl, token);
			const reviewsData = (await reviewsResponse.json()) as unknown[];

			const userReviews = (reviewsData || []).filter((item: unknown) => {
				const review = item as { user: { login: string }; submitted_at: string };
				const reviewDate = new Date(review.submitted_at);
				return review.user.login === username && reviewDate >= startDate && reviewDate <= endDate;
			});

			for (const item of userReviews) {
				const review = item as {
					id: number;
					html_url: string;
					submitted_at: string;
					body: string;
				};
				reviews.push({
					id: `review-${review.id}`,
					type: 'review' as const,
					repository: `${owner}/${repo}`,
					title: `Review on #${pr.number}: ${pr.title}`,
					url: review.html_url,
					date: review.submitted_at,
					description: review.body
				});
			}
		} catch (error) {
			console.error(`Failed to fetch reviews for PR #${pr.number}:`, error);
		}
	}

	return reviews;
}

/**
 * Fetch issues user commented on or was involved with
 */
async function fetchIssues({
	owner,
	repo,
	username,
	token,
	startDate,
	endDate
}: {
	owner: string;
	repo: string;
	username: string;
	token: string | undefined;
	startDate: Date;
	endDate: Date;
}): Promise<GitHubContribution[]> {
	// Search for issues the user commented on, using updated date as a broad filter
	const query = `commenter:${username} repo:${owner}/${repo} type:issue updated:${formatDateForSearch(startDate)}..${formatDateForSearch(endDate)}`;
	const url = new URL(`${GITHUB_API_BASE}/search/issues`);
	url.searchParams.set('q', query);
	url.searchParams.set('per_page', '100');

	const response = await fetchWithAuth(url.toString(), token);
	const data = (await response.json()) as { items?: unknown[] };

	const contributions: GitHubContribution[] = [];

	// For each issue, fetch comments and verify user commented in date range
	for (const item of data.items || []) {
		const issue = item as {
			number: number;
			title: string;
			html_url: string;
			body: string;
		};

		try {
			const commentsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issue.number}/comments`;
			const commentsResponse = await fetchWithAuth(commentsUrl, token);
			const commentsData = (await commentsResponse.json()) as unknown[];

			// Find comments by user within date range
			const userComments = (commentsData || []).filter((item: unknown) => {
				const comment = item as { user: { login: string }; created_at: string };
				const commentDate = new Date(comment.created_at);
				return (
					comment.user.login === username && commentDate >= startDate && commentDate <= endDate
				);
			});

			// Only include issue if user commented on it within date range
			if (userComments.length > 0) {
				const firstComment = userComments[0] as { created_at: string };
				contributions.push({
					id: `issue-${issue.number}`,
					type: 'issue' as const,
					repository: `${owner}/${repo}`,
					title: issue.title,
					url: issue.html_url,
					date: firstComment.created_at,
					description: issue.body
				});
			}
		} catch (error) {
			console.error(`Failed to fetch comments for issue #${issue.number}:`, error);
		}
	}

	return contributions;
}

/**
 * Fetch discussion comments/replies by user using GraphQL
 */
async function fetchDiscussions({
	username,
	token,
	startDate,
	endDate
}: {
	username: string;
	token: string | undefined;
	startDate: Date;
	endDate: Date;
}): Promise<GitHubContribution[]> {
	// GraphQL query to fetch user's discussion activity
	const query = `
		query($username: String!, $from: DateTime!, $to: DateTime!) {
			user(login: $username) {
				repositoryDiscussionComments(first: 100) {
					nodes {
						discussion {
							title
							url
							repository {
								nameWithOwner
							}
						}
						body
						createdAt
						id
					}
				}
			}
		}
	`;

	const variables = {
		username,
		from: startDate.toISOString(),
		to: endDate.toISOString()
	};

	try {
		const response = await fetchWithAuth(`${GITHUB_API_BASE}/graphql`, token, {
			method: 'POST',
			body: JSON.stringify({ query, variables })
		});

		const result = (await response.json()) as {
			data?: {
				user?: {
					repositoryDiscussionComments?: {
						nodes?: unknown[];
					};
				};
			};
		};
		const comments = result?.data?.user?.repositoryDiscussionComments?.nodes || [];

		return comments
			.filter((item: unknown) => {
				const comment = item as { createdAt: string };
				const date = new Date(comment.createdAt);
				return date >= startDate && date <= endDate;
			})
			.map((item: unknown) => {
				const comment = item as {
					id: string;
					body: string;
					createdAt: string;
					discussion: {
						title: string;
						url: string;
						repository: { nameWithOwner: string };
					};
				};
				return {
					id: `discussion-${comment.id}`,
					type: 'discussion' as const,
					repository: comment.discussion.repository.nameWithOwner,
					title: `Comment on: ${comment.discussion.title}`,
					url: comment.discussion.url,
					date: comment.createdAt,
					description: comment.body
				};
			});
	} catch (error) {
		console.error('Failed to fetch discussions:', error);
		return [];
	}
}

/**
 * Helper to make authenticated requests
 */
async function fetchWithAuth(
	url: string,
	token?: string,
	options: RequestInit = {}
): Promise<Response> {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github.v3+json'
	};

	if (options.headers) {
		Object.assign(headers, options.headers);
	}

	if (token) {
		headers.Authorization = `token ${token}`;
	}

	const response = await fetch(url, {
		...options,
		headers
	});

	if (!response.ok) {
		if (response.status === 401) {
			throw new Error('Invalid GitHub token');
		} else if (response.status === 403) {
			const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
			const rateLimitReset = response.headers.get('X-RateLimit-Reset');
			if (rateLimitRemaining === '0') {
				const resetDate = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000) : null;
				const resetTimeStr = resetDate ? resetDate.toLocaleString() : 'soon';
				const error = new Error('RATE_LIMIT_EXCEEDED');
				(error as { resetTime?: string }).resetTime = resetTimeStr;
				throw error;
			}
			throw new Error('GitHub API access forbidden');
		} else if (response.status === 404) {
			throw new Error('Repository not found');
		}
		throw new Error(`GitHub API error: ${response.status}`);
	}

	return response;
}

/**
 * Format date for GitHub search API (YYYY-MM-DD)
 */
function formatDateForSearch(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Test GitHub token validity
 */
export async function testGitHubToken(token?: string): Promise<boolean> {
	try {
		const response = await fetchWithAuth(`${GITHUB_API_BASE}/user`, token);
		return response.ok;
	} catch {
		return false;
	}
} /** GitHub contribution from API */

export interface GitHubContribution {
	id: string; // sha, pr number, etc.
	type: 'commit' | 'pr' | 'issue' | 'review' | 'discussion';
	repository: string; // 'sveltejs/kit'
	title: string;
	url: string;
	date: string; // ISO date
	description?: string;
	hours?: number; // manual entry
}
