import type { GitHubContribution } from '../routes/invoices/[invoiceId]/github';
import * as storage from './storage';

/** Manually added work */
export interface ManualWorkItem {
	id: string; // uuid
	type:
		| 'experimentation'
		| 'investigation'
		| 'meeting'
		| 'research'
		| 'maintenance'
		| 'triage'
		| 'support'
		| 'other';
	title: string;
	description: string;
	date: string; // ISO date
	hours: number; // required, 0.5 increments
	links?: string[];
}

/** Combined work item type */
export type WorkItem =
	| ({ source: 'github' } & GitHubContribution)
	| ({ source: 'manual' } & ManualWorkItem);

/** Invoice status */
export type InvoiceStatus = 'draft' | 'submitted' | 'approved' | 'paid';

/** Monthly invoice container */
export interface MonthlyInvoice {
	id: string; // YYYY-MM format
	year: number;
	month: number; // 1-12
	status: InvoiceStatus;

	// Optional custom date range overrides (defaults to full month if not set)
	customStartDate?: string; // ISO date string
	customEndDate?: string; // ISO date string

	githubContributions: GitHubContribution[];
	manualItems: ManualWorkItem[];

	expenseTitle?: string;
	expenseDescription?: string;

	createdAt: string;
	updatedAt: string;
	submittedAt?: string;
	totalHours?: number;
	totalAmount?: number; // calculated from totalHours * hourlyRate

	lastGitHubFetch?: string;
	githubFetchError?: string;
}

/** App settings */
export interface Settings {
	githubToken?: string;
	githubUsername?: string;
	organization?: string; // GitHub organization (e.g., 'sveltejs')
	repositories: string[]; // ['sveltejs/kit', 'sveltejs/svelte']
	hourlyRate?: number; // USD per hour
	defaultCurrency?: string; // 'USD', 'EUR', etc. (defaults to 'USD')
	monthlyHourGoal?: number; // Target hours per month
	monthlyAmountGoal?: number; // Target amount per month
}

/** Application state */
export interface AppState {
	invoices: Record<string, MonthlyInvoice>; // keyed by YYYY-MM
	currentInvoiceId: string | null;
	settings: Settings;
}

/**
 * Reactive invoice store using Svelte 5 runes
 */
class InvoiceStore {
	state = $state<AppState>(storage.getInitialState());

	constructor() {
		// Load from storage on initialization
		if (typeof window !== 'undefined') {
			const loaded = storage.load();
			if (loaded) {
				this.state = loaded;
			}
		}
	}

	get invoiceList(): MonthlyInvoice[] {
		return Object.values(this.state.invoices).sort((a, b) => {
			// Sort by year descending, then month descending
			if (a.year !== b.year) return b.year - a.year;
			return b.month - a.month;
		});
	}

	get isSetupComplete(): boolean {
		return !!(
			this.state.settings.githubUsername &&
			this.state.settings.organization &&
			this.state.settings.repositories.length > 0
		);
	}

	// Helper to persist state changes
	private persist(): void {
		storage.save(this.state);
	}

	// Actions
	createInvoice(year: number, month: number): string {
		const id = `${year}-${String(month).padStart(2, '0')}`;

		if (this.state.invoices[id]) {
			throw new Error(`Invoice for ${id} already exists`);
		}

		const now = new Date().toISOString();
		const invoice: MonthlyInvoice = {
			id,
			year,
			month,
			status: 'draft',
			githubContributions: [],
			manualItems: [],
			createdAt: now,
			updatedAt: now
		};

		this.state.invoices[id] = invoice;
		this.state.currentInvoiceId = id;
		this.persist();

		return id;
	}

	deleteInvoice(id: string): void {
		if (!this.state.invoices[id]) return;

		delete this.state.invoices[id];

		if (this.state.currentInvoiceId === id) {
			// Set to most recent invoice or null
			const invoices = this.invoiceList;
			this.state.currentInvoiceId = invoices.length > 0 ? invoices[0].id : null;
		}
	}

	addGitHubContributions(invoiceId: string, contributions: GitHubContribution[]): void {
		const invoice = this.state.invoices[invoiceId];
		if (!invoice) return;

		// Add contributions, avoiding duplicates
		const existingIds = new Set(invoice.githubContributions.map((c) => c.id));
		const newContributions = contributions.filter((c) => !existingIds.has(c.id));

		invoice.githubContributions.push(...newContributions);
		invoice.lastGitHubFetch = new Date().toISOString();
		invoice.updatedAt = new Date().toISOString();
		this.persist();
	}

	updateContributionHours(invoiceId: string, contributionId: string, hours: number): void {
		const invoice = this.state.invoices[invoiceId];
		if (!invoice) return;

		const contribution = invoice.githubContributions.find((c) => c.id === contributionId);
		if (!contribution) return;

		contribution.hours = hours;
		invoice.updatedAt = new Date().toISOString();
		invoice.totalHours = this.calculateTotalHours(invoice);
		if (this.state.settings.hourlyRate) {
			invoice.totalAmount = invoice.totalHours * this.state.settings.hourlyRate;
		}
		this.persist();
	}

	addManualItem(invoiceId: string, item: Omit<ManualWorkItem, 'id'>): string {
		const invoice = this.state.invoices[invoiceId];
		if (!invoice) throw new Error('Invoice not found');

		const id = crypto.randomUUID();
		const manualItem: ManualWorkItem = { id, ...item };

		invoice.manualItems.push(manualItem);
		invoice.updatedAt = new Date().toISOString();
		invoice.totalHours = this.calculateTotalHours(invoice);
		if (this.state.settings.hourlyRate) {
			invoice.totalAmount = invoice.totalHours * this.state.settings.hourlyRate;
		}
		this.persist();

		return id;
	}

	deleteManualItem(invoiceId: string, itemId: string): void {
		const invoice = this.state.invoices[invoiceId];
		if (!invoice) return;

		const index = invoice.manualItems.findIndex((i) => i.id === itemId);
		if (index === -1) return;

		invoice.manualItems.splice(index, 1);
		invoice.updatedAt = new Date().toISOString();
		invoice.totalHours = this.calculateTotalHours(invoice);
		if (this.state.settings.hourlyRate) {
			invoice.totalAmount = invoice.totalHours * this.state.settings.hourlyRate;
		}
		this.persist();
	}

	updateSettings(settings: Partial<Settings>): void {
		// Create a new settings object to trigger reactivity
		this.state.settings = { ...this.state.settings, ...settings };

		// Recalculate all invoice amounts if hourly rate changed
		if (settings.hourlyRate !== undefined) {
			for (const invoice of Object.values(this.state.invoices)) {
				if (invoice.totalHours !== undefined) {
					invoice.totalAmount = invoice.totalHours * settings.hourlyRate;
				}
			}
		}
		this.persist();
	}

	updateInvoiceStatus(id: string, status: InvoiceStatus): void {
		const invoice = this.state.invoices[id];
		if (!invoice) return;

		invoice.status = status;
		invoice.updatedAt = new Date().toISOString();

		if (status === 'submitted' && !invoice.submittedAt) {
			invoice.submittedAt = new Date().toISOString();
		}
		this.persist();
	}

	updateDateRange(id: string, startDate?: string, endDate?: string): void {
		const invoice = this.state.invoices[id];
		if (!invoice) return;

		invoice.customStartDate = startDate;
		invoice.customEndDate = endDate;
		invoice.updatedAt = new Date().toISOString();
		this.persist();
	}

	// Helper methods
	private calculateTotalHours(invoice: MonthlyInvoice): number {
		const githubHours = invoice.githubContributions.reduce((sum, c) => sum + (c.hours || 0), 0);
		const manualHours = invoice.manualItems.reduce((sum, i) => sum + i.hours, 0);
		return githubHours + manualHours;
	}

	// Data management
	exportData(): string {
		return storage.exportData();
	}

	importData(json: string): boolean {
		const success = storage.importData(json);
		if (success) {
			// Reload state
			const loaded = storage.load();
			if (loaded) {
				this.state = loaded;
			}
		}
		return success;
	}

	clearAllData(): void {
		if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
			storage.clear();
			this.state = storage.getInitialState();
		}
	}
}

export const invoiceStore = new InvoiceStore();
