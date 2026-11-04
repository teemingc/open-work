/** A remote function's response holding `value`, in devalue's format. Plain objects only. */
export function remoteResult(value: unknown) {
	const nodes: unknown[] = [];
	const add = (v: unknown): number => {
		const index = nodes.push(null) - 1;
		nodes[index] =
			v && typeof v === 'object'
				? Object.fromEntries(Object.entries(v).map(([key, x]) => [key, add(x)]))
				: v;
		return index;
	};
	add({ _: value });
	return { json: { type: 'result', data: JSON.stringify(nodes) } };
}
