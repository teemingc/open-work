// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Error {
			message: string;
			/** Seconds to wait before trying again, when a service is rate-limiting us. */
			retryAfter?: number;
		}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** The expense just submitted, so the list can point it out. */
			submittedUrl?: string;
		}
		// interface Platform {}
	}
}

export {};
