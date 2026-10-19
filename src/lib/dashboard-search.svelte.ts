/** A query string, empty or starting with "?". */
export type Search = `?${string}` | '';

/**
 * The dashboard's chart settings as last chosen, so links back to a dashboard show it the same
 * way. Only ever set in the browser: on the server this module is shared by every request.
 */
let search = $state<Search>('');

export function dashboardSearch(): Search {
	return search;
}

export function rememberDashboardSearch(value: string) {
	search = value as Search;
}
