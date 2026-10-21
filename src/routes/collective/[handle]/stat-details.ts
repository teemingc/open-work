/**
 * The words in the popovers that open from the badges on the dashboard's figures. Amounts and dates
 * arrive already formatted, like "$1,200" or "October 2028", so each function is only wording.
 */

/** The window an average covers and the one before it, like "6 months". */
export interface Windows {
	recent: string;
	earlier: string;
}

/** The trend badge on recurring contributions or expenses. */
export function averageDetail({
	what,
	before,
	change,
	up,
	windows
}: {
	/** "recurring contributions", "contributions" or "expenses". */
	what: string;
	before: string;
	/** How much it moved, like "$4,931". */
	change: string;
	up: boolean;
	windows: Windows;
}): string {
	const from = up ? 'on top of' : 'from';
	return `Average ${what} have ${up ? 'increased' : 'decreased'} by ${change} ${from} the ${before} in ${windows.earlier}.`;
}

/** The trend badge on the monthly change, which is contributions less expenses. */
export function netDetail({
	before,
	change,
	up,
	windows
}: {
	/** With a minus sign when expenses were more, like "-$8,672". */
	before: string;
	/** How much it moved, like "$1,334". */
	change: string;
	up: boolean;
	windows: Windows;
}): string {
	return `Average monthly change has ${up ? 'increased' : 'decreased'} by ${change} compared to ${before} in ${windows.earlier}.`;
}

/** The "months left" badge on the available money. */
export function runwayDetail({
	drop,
	runsOut,
	oneOffs
}: {
	drop: string;
	runsOut: string;
	/** One-off contributions in the last 12 months, which the forecast leaves out. */
	oneOffs: number | undefined;
}): string {
	const made = oneOffs
		? ` There ${oneOffs === 1 ? 'was 1 one-off contribution' : `were ${oneOffs} one-off contributions`} last year.`
		: '';
	return `The balance is decreasing at an average of ${drop} a month and will run out around ${runsOut}.${made}`;
}

/** The trend badge on one-off contributions, comparing the last 12 months' total with the 12 before. */
export function oneOffDetail({
	before,
	change,
	up
}: {
	before: string;
	/** How much the total moved, like "$37,432". */
	change: string;
	up: boolean;
}): string {
	const from = up ? 'on top of' : 'from';
	return `One-off contributions have ${up ? 'increased' : 'decreased'} by ${change} ${from} the ${before} in the 12 months before.`;
}
