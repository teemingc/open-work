/** Save `text` as a JSON file named `name`, through the browser's download. */
export function downloadJson({ text, name }: { text: string; name: string }): void {
	const blob = new Blob([text], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	URL.revokeObjectURL(url);
}
