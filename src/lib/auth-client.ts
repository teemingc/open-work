import { createAuthClient } from 'better-auth/client';

const authClient = createAuthClient();

/** Go to Google to sign in, and come back to `returnTo`. */
export async function signInWithGoogle(returnTo: string): Promise<void> {
	await authClient.signIn.social({ provider: 'google', callbackURL: returnTo });
}

export async function signOutOfGoogle(): Promise<void> {
	await authClient.signOut();
}
