import { building, dev } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

const warned = new Set<string>();

// Optional while building, and in dev so the app can be previewed without them; required when
// the deployed app starts.
function required(name: string) {
	if (building) return v.optional(v.string(), '');
	if (!dev) return v.pipe(v.string(), v.nonEmpty());

	return v.pipe(
		v.optional(v.string(), ''),
		v.transform((value) => {
			if (!value && !warned.has(name)) {
				warned.add(name);
				console.warn(`${name} is not set; features that need it will not work.`);
			}
			return value;
		})
	);
}

const optional = v.optional(v.string(), '');

export const variables = defineEnvVars({
	OC_CLIENT_ID: {
		description: 'Client ID of the Open Collective OAuth app',
		schema: required('OC_CLIENT_ID')
	},
	OC_CLIENT_SECRET: {
		description: 'Client secret of the Open Collective OAuth app',
		schema: required('OC_CLIENT_SECRET')
	},
	// A personal token for public data, such as collective stats, when the visitor has not connected
	// Open Collective: signed-in requests get 100 a minute instead of 10 per IP, and a Worker's
	// outgoing IPs are shared. Optional, but recommended when deployed.
	OC_PERSONAL_TOKEN: {
		description: 'Open Collective personal token used for public queries',
		schema: optional
	},
	// Google sign-in, to keep the work log in the user's own Google Drive. Optional: without
	// them the work log stays in the browser only.
	GOOGLE_CLIENT_ID: {
		description: 'Client ID of the Google OAuth app',
		schema: optional
	},
	GOOGLE_CLIENT_SECRET: {
		description: 'Client secret of the Google OAuth app',
		schema: optional
	},
	BETTER_AUTH_SECRET: {
		description: 'Secret that encrypts the Google session cookies, at least 32 random characters',
		schema: optional
	}
});
