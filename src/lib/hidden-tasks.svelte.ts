import { browser } from '$app/env';
import { SvelteSet } from 'svelte/reactivity';

const HIDDEN_KEY = 'invoicer:hidden-tasks';

function read(): string[] {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
		return Array.isArray(stored) ? stored.filter((text) => typeof text === 'string') : [];
	} catch {
		// Blocked or unreadable storage just means nothing hidden.
		return [];
	}
}

/** Task names left out of the suggestions. Kept in this browser only. */
export const hiddenTasks = new SvelteSet<string>(browser ? read() : []);

function save() {
	try {
		localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenTasks]));
	} catch {
		// Nothing to remember it in.
	}
}

export function hideTask(text: string) {
	hiddenTasks.add(text);
	save();
}

/** Logging a hidden task again brings it back. */
export function showTask(text: string) {
	if (hiddenTasks.delete(text)) save();
}

export function forgetHiddenTasks() {
	hiddenTasks.clear();
	try {
		localStorage.removeItem(HIDDEN_KEY);
	} catch {
		// Nothing was remembered.
	}
}
