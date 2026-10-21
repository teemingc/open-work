/**
 * Wraps a chart's `onTooltipClick` so that on touch screens, where there's no hover, the first tap
 * on a point shows its tooltip and a second tap on the same point opens it. With a mouse, a click
 * opens it straight away.
 */
export function tapToPreview<T>(open: (event: MouseEvent, detail: { data: T }) => void) {
	let previewed: T | undefined;
	// On band charts LayerChart calls `onTooltipClick` from the bar and again as the click bubbles
	// to the chart, so one tap would both preview and open without this.
	let handled: Event | undefined;
	return (event: MouseEvent, detail: { data: T }) => {
		if (event === handled) return;
		handled = event;
		if (matchMedia('(hover: hover)').matches || detail.data === previewed) {
			previewed = undefined;
			open(event, detail);
		} else {
			previewed = detail.data;
		}
	};
}
