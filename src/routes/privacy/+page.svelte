<script lang="ts">
	const updated = '18 October 2026';
</script>

<svelte:head>
	<title>Privacy policy · Open Work</title>
	<meta property="og:title" content="Privacy policy · Open Work" />
	<meta
		name="description"
		content="What Open Work stores about you, where it lives and who sees it."
	/>
	<meta
		property="og:description"
		content="What Open Work stores about you, where it lives and who sees it."
	/>
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -- every link here is to another site -->
<article class="max-w-2xl pt-6 sm:pt-12">
	<!-- The double rule closes the heading, like the masthead and a ledger's totals. -->
	<header class="border-b-[3px] border-double border-rule pb-4">
		<h1 class="text-3xl sm:text-4xl">Privacy policy</h1>
		<p class="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
	</header>

	<div
		class="mt-6 space-y-4 leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:pt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5"
	>
		<p>
			Open Work helps open source freelancers log their hours, follow their collective's finances
			and send invoices through Open Collective. It is built so that it keeps nothing about you on
			its server: your data lives in your browser, in cookies only your browser holds, and, if you
			choose, in your own Google Drive.
		</p>

		<h2>What is kept, and where</h2>
		<ul>
			<li>
				<strong>Your work log</strong> is stored in this browser (IndexedDB). It is not sent to or kept
				on our server, except in passing on its way to your Google Drive when Drive sync is on.
			</li>
			<li>
				<strong>Your settings</strong>, such as your name, address, hourly rate, payout method and
				GitHub details, are kept in a cookie in your browser. The server reads it on each request to
				fill in invoices, and does not store it.
			</li>
			<li>
				<strong>Your Open Collective connection</strong> is an access token kept in a cookie in your browser.
				It is used only to read your profile and payout methods and to create and read the expenses you
				submit.
			</li>
			<li>
				<strong>Recently visited collectives</strong> are kept in your browser's local storage so you
				can return to them.
			</li>
			<li>
				<strong>Public Open Collective data</strong>, such as a collective's balance and
				contributions, is cached on the server for up to a week so Open Collective is not asked
				again on every visit. This contains nothing about you.
			</li>
		</ul>

		<h2>Google user data</h2>
		<p>
			Signing in with Google is optional. It lets the app keep a copy of your work log in your own
			Google Drive, so it survives clearing your browser and follows you to other devices.
		</p>
		<ul>
			<li>
				<strong>What we ask for:</strong> your basic profile (name, email address and picture), to
				show who you are signed in as, and the <code>drive.appdata</code> scope, which lets the app read
				and write files in a hidden folder of your Drive set aside for this app.
			</li>
			<li>
				<strong>How it is used:</strong> the app keeps one file there, <code>work-log.json</code>,
				holding your work log. It cannot see, open or change any other file in your Drive, and other
				apps cannot see this one.
			</li>
			<li>
				<strong>Where it is kept:</strong> your Google session and access tokens are kept in an encrypted
				cookie in your browser. We have no database and keep no copy of your profile, your tokens or your
				work log on our server.
			</li>
			<li>
				<strong>Sharing:</strong> we do not sell, share or transfer Google user data to anyone, and we
				do not use it for advertising or to train AI models.
			</li>
		</ul>
		<p>
			Open Work's use and transfer of information received from Google APIs adheres to the
			<a href="https://developers.google.com/terms/api-services-user-data-policy"
				>Google API Services User Data Policy</a
			>, including the Limited Use requirements.
		</p>

		<h2>Other services</h2>
		<p>When you use these features, your browser or our server talks to:</p>
		<ul>
			<li>
				<a href="https://opencollective.com/privacypolicy">Open Collective</a>, to read collective
				data and submit your invoices.
			</li>
			<li>
				<a
					href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement"
					>GitHub</a
				>, directly from your browser, to list the pull requests and issues you worked on.
			</li>
			<li>
				<a href="https://policies.google.com/privacy">Google</a>, for sign-in and Drive sync.
			</li>
			<li>
				<a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a>, which hosts the app and
				may log requests, such as IP addresses, to keep the service running and secure.
			</li>
		</ul>
		<p>There are no analytics, trackers or advertising cookies.</p>

		<h2>Removing your data</h2>
		<ul>
			<li>
				<strong>Clear all data</strong> in Settings removes your settings, the work log kept in this browser
				and the places you looked up, and signs you out of Open Collective and Google.
			</li>
			<li>
				Signing out only deletes the access token from your browser. To revoke Open Work's access
				itself, remove it from the authorized apps in your Open Collective settings.
			</li>
			<li>
				To remove the Drive copy and revoke access, open
				<a href="https://myaccount.google.com/connections">your Google account's connections</a>,
				choose Open Work and remove its access, which also deletes its hidden app data.
			</li>
		</ul>

		<h2>Changes and contact</h2>
		<p>
			If this policy changes, the date at the top changes with it. Questions are welcome as an issue
			on
			<a href="https://github.com/teemingc/open-work/issues">GitHub</a>.
		</p>
	</div>
</article>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
