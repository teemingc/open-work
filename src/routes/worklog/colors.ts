const CLIENT_COLORS = [
	'var(--color-chart-1)',
	'var(--color-chart-2)',
	'var(--color-chart-3)',
	'var(--color-chart-4)'
];

/** Each client keeps the colour of its place in the client list. */
export function clientColor(index: number): string {
	return CLIENT_COLORS[index % CLIENT_COLORS.length];
}
