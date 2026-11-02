import type { Client } from '#lib/worklog.js';

const CLIENT_COLORS = [
	'var(--color-chart-1)',
	'var(--color-chart-2)',
	'var(--color-chart-3)',
	'var(--color-chart-4)'
];

/** The client's own colour, or else the colour of its place in the client list. */
export function clientColor(client: Pick<Client, 'color'> | undefined, index: number): string {
	return client?.color ?? CLIENT_COLORS[index % CLIENT_COLORS.length];
}
