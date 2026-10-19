import { isHttpError } from '@sveltejs/kit';
import { getDriveStatus, pullWorkLog, pushWorkLog, type DriveStatus } from './drive.remote';
import { parseWorkLog, type WorkLogStore } from './worklog-store.svelte';
import { mergeWorkLogs, sameWorkLog } from './worklog-merge';
import { emptyWorkLog } from './worklog';

/** Wait this long after a change before syncing, so a burst of edits is one upload. */
const PUSH_DELAY_MS = 1500;

/** Give up after this many saves lost to another device saving at the same moment. */
const MAX_CONFLICTS = 5;

const ACCOUNT_KEY = 'open-work:drive-account';

/** The Google account this browser's work log was last synced with. */
function syncedAccount(): string | undefined {
	try {
		return localStorage.getItem(ACCOUNT_KEY) ?? undefined;
	} catch {
		return undefined;
	}
}

function rememberSyncedAccount(email: string) {
	try {
		localStorage.setItem(ACCOUNT_KEY, email);
	} catch {
		// Storage blocked: the next sign-in merges as if it were the first.
	}
}

export type SyncState = 'checking' | 'unavailable' | 'signed-out' | 'syncing' | 'synced' | 'error';

/**
 * Keeps the work log in the signed-in user's Google Drive. This browser's copy stays the one you
 * edit, so the app works offline and instantly; each sync merges it with Drive's record by record.
 */
export class DriveSync {
	state = $state<SyncState>('checking');
	account = $state<DriveStatus['account']>(null);
	error = $state<string | undefined>();
	/** When the last sync finished, in milliseconds. */
	lastSynced = $state<number | undefined>();

	#store: WorkLogStore;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#stopListening: (() => void) | undefined;

	constructor(store: WorkLogStore) {
		this.#store = store;
	}

	async start() {
		this.state = 'checking';
		let status: DriveStatus;
		try {
			status = await getDriveStatus();
		} catch {
			this.state = 'unavailable';
			return;
		}
		this.account = status.account;
		if (!status.available) {
			this.state = 'unavailable';
			return;
		}
		if (!status.account) {
			this.state = 'signed-out';
			return;
		}
		this.#stopListening ??= this.#store.onChange(() => this.#schedulePush());
		await this.syncNow();
	}

	/** Runs one sync at a time; a change made during a sync queues one more. */
	#running: Promise<void> | undefined;
	#again = false;

	/**
	 * Merge with the copy in Drive: save what other devices changed here, and upload what this
	 * one changed. Nothing is overwritten, so edits made on two devices both survive.
	 */
	async syncNow() {
		if (this.#running) {
			this.#again = true;
			return this.#running;
		}
		this.#running = this.#attempt(async () => {
			let conflicts = 0;
			do {
				this.#again = false;
				const email = this.account?.email;
				const remote = await pullWorkLog();
				const theirs = remote ? parseWorkLog(remote.json) : null;
				const ours = $state.snapshot(this.#store.data);
				// This browser's log belongs to whoever last synced it. Another account gets its own
				// log instead, so nothing from the last person who signed in here reaches their Drive.
				const previous = syncedAccount();
				const merged =
					previous && previous !== email
						? (theirs ?? emptyWorkLog())
						: theirs
							? mergeWorkLogs({ ours, theirs })
							: ours;
				if (!sameWorkLog(merged, ours)) this.#store.adopt(merged);
				if (!theirs || !sameWorkLog(merged, theirs)) {
					const { conflict } = await pushWorkLog({
						json: JSON.stringify(merged),
						expected: remote?.version ?? null
					});
					// Another device saved in between: pull its changes and merge again.
					if (conflict) {
						if (++conflicts > MAX_CONFLICTS)
							throw new Error('Google Drive kept changing. Try again.');
						this.#again = true;
						continue;
					}
				}
				if (email) rememberSyncedAccount(email);
			} while (this.#again);
		}).finally(() => (this.#running = undefined));
		return this.#running;
	}

	#schedulePush() {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.syncNow(), PUSH_DELAY_MS);
	}

	async #attempt(work: () => Promise<unknown>) {
		this.state = 'syncing';
		try {
			await work();
			this.state = 'synced';
			this.error = undefined;
			this.lastSynced = Date.now();
		} catch (err) {
			this.state = 'error';
			this.error = isHttpError(err)
				? err.body.message
				: err instanceof Error
					? err.message
					: 'Could not reach Google Drive.';
		}
	}

	/** Stop syncing, after signing out. The work log stays in this browser. */
	stop() {
		clearTimeout(this.#timer);
		this.#stopListening?.();
		this.#stopListening = undefined;
		this.account = null;
		this.state = 'signed-out';
	}
}

let sync: DriveSync | undefined;

/** The one Drive sync for this browser's work log, started on first use. */
export function driveSync(store: WorkLogStore): DriveSync {
	if (!sync) {
		sync = new DriveSync(store);
		void sync.start();
	}
	return sync;
}
