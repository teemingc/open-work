/** Which of the fund view's charts a project was picked in. */
type Source = 'pack' | 'bars';

/**
 * The project picked in one of the fund view's charts, so the other can show the same one: the one
 * under the pointer, or the one a tap pinned, which outlasts the pointer leaving.
 */
export class LinkedProject {
	#hovered = $state<{ slug: string; from: Source }>();
	#pinned = $state<{ slug: string; from: Source }>();

	/** The project picked in either chart, if any. */
	get slug() {
		return (this.#pinned ?? this.#hovered)?.slug;
	}

	hover(from: Source, slug?: string) {
		this.#hovered = slug ? { slug, from } : undefined;
	}

	/** Pins a project, or with none, lets go of one pinned in the same chart. */
	pin(from: Source, slug?: string) {
		if (slug) this.#pinned = { slug, from };
		else if (this.#pinned?.from === from) this.#pinned = undefined;
	}
}
