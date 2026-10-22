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

/** The trend badge on the monthly change, which is contributions less expenses, like "Decreasing by $3,074 more…". */
export function netDetail({
	now,
	before,
	change,
	more,
	windows
}: {
	/** The average monthly change in the recent window, signed. */
	now: { amount: string; falling: boolean };
	/** The same in the window before, so it can be compared. */
	before: { amount: string; falling: boolean };
	/** How much more or less it moves by when both windows go the same way, like "$1,334". */
	change: string;
	/** Whether it moves by more than before. */
	more: boolean;
	windows: Windows;
}): string {
	const direction = (falling: boolean) => (falling ? 'decreasing' : 'increasing');
	const lead = direction(now.falling).replace(/^./, (letter) => letter.toUpperCase());
	// Going the other way to before, "more" or "less" would compare unlike things, so it names both.
	if (now.falling !== before.falling) {
		return `${lead} by ${now.amount} compared to ${direction(before.falling)} by ${before.amount} in ${windows.earlier}.`;
	}
	return `${lead} by ${change} ${more ? 'more' : 'less'} compared to ${before.amount} in ${windows.earlier}.`;
}

/** The "months left" badge on the available money. */
export function runwayDetail({ drop, runsOut }: { drop: string; runsOut: string }): string {
	return `The balance is decreasing at an average of ${drop} a month and will run out around ${runsOut}.`;
}

/** Beside the runway: the one-off contributions in the last 12 months, which the forecast leaves out. */
export function runwayAside(oneOffs: number | undefined): string | undefined {
	if (!oneOffs) return undefined;
	return `There ${oneOffs === 1 ? 'was 1 one-off contribution' : `were ${oneOffs} one-off contributions`} last year.`;
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
