import type { AppState } from './invoice.svelte';

const STORAGE_KEY = 'oc-invoice-data';
const STORAGE_VERSION = 1;

interface StorageData {
	version: number;
	data: AppState;
}

/**
 * Load application state from localStorage
 */
export function load(): AppState | null {
	if (typeof window === 'undefined') return null;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const parsed: StorageData = JSON.parse(stored);

		// Version migration support
		if (parsed.version !== STORAGE_VERSION) {
			console.warn('Storage version mismatch, migrating data...');
			// Future: add migration logic here
			return null;
		}

		return parsed.data;
	} catch (error) {
		console.error('Failed to load from localStorage:', error);
		return null;
	}
}

/**
 * Save application state to localStorage
 */
export function save(state: AppState): void {
	if (typeof window === 'undefined') return;

	try {
		const storageData: StorageData = {
			version: STORAGE_VERSION,
			data: state
		};

		localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
	} catch (error) {
		if (error instanceof DOMException && error.name === 'QuotaExceededError') {
			console.error('localStorage quota exceeded');
			alert('Storage quota exceeded. Please export your data and clear some old invoices.');
		} else {
			console.error('Failed to save to localStorage:', error);
		}
	}
}

/**
 * Export application state as JSON string
 */
export function exportData(): string {
	if (typeof window === 'undefined') return '';

	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return JSON.stringify({ version: STORAGE_VERSION, data: null }, null, 2);

	try {
		const parsed = JSON.parse(stored);
		return JSON.stringify(parsed, null, 2);
	} catch (error) {
		console.error('Failed to export data:', error);
		return '';
	}
}

/**
 * Import application state from JSON string
 */
export function importData(json: string): boolean {
	if (typeof window === 'undefined') return false;

	try {
		const parsed: StorageData = JSON.parse(json);

		// Validate structure
		if (!parsed.version || !parsed.data) {
			throw new Error('Invalid data structure');
		}

		// Version migration support
		if (parsed.version !== STORAGE_VERSION) {
			console.warn('Imported data has different version, attempting to migrate...');
			// Future: add migration logic here
		}

		localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
		return true;
	} catch (error) {
		console.error('Failed to import data:', error);
		alert('Failed to import data. Please check the file format.');
		return false;
	}
}

/**
 * Clear all application data from localStorage
 */
export function clear(): void {
	if (typeof window === 'undefined') return;

	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch (error) {
		console.error('Failed to clear localStorage:', error);
	}
}

/**
 * Get initial application state
 */
export function getInitialState(): AppState {
	return {
		invoices: {},
		currentInvoiceId: null,
		settings: {
			repositories: [],
			defaultCurrency: 'USD'
		}
	};
}
