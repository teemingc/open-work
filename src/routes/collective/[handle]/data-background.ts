import type { Attachment } from 'svelte/attachments';

/**
 * Draws `value` as a bar behind an element's content, as long as its share of `max`, so a column
 * of figures compares at a glance. Like LayerStack's `dataBackground` action, which is becoming an
 * attachment, for positive values alone.
 */
export function dataBackground({
	value,
	max,
	color,
	inset = 0
}: {
	value: number;
	max: number;
	color: string;
	/** Space kept clear above and below the bar, in pixels. */
	inset?: number;
}): Attachment<HTMLElement> {
	return (node) => {
		const share = max > 0 ? Math.min(1, Math.max(0, value / max)) * 100 : 0;
		node.style.backgroundImage = `linear-gradient(to right, ${color} ${share}%, transparent ${share}%)`;
		node.style.backgroundRepeat = 'no-repeat';
		node.style.backgroundPosition = `0 ${inset}px`;
		node.style.backgroundSize = `100% calc(100% - ${inset * 2}px)`;
		return () => {
			node.style.backgroundImage = '';
			node.style.backgroundRepeat = '';
			node.style.backgroundPosition = '';
			node.style.backgroundSize = '';
		};
	};
}
