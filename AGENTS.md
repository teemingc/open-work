You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

## Project rules

- before writing Svelte code, check https://www.shadcn-svelte.com/docs/components and their installation instructions
- use https://www.shadcn-svelte.com/docs/components/spinner instead of implementing your own spinner
- select.root must set type attribute if it is a single select

- instead of using emojis, raw SVG and special characters, use icons from the @lucide/svelte package
- avoid using deprecated icons

- use pnpm instead of npm
- run pnpm format, pnpm lint and pnpm check after making changes

## HTML rules

- `<label>` elements must be associated with an input
- when adding a toggle to hide/show elements, use `<details>` and `<summary>` instead of `<button>` and conditional logic

## TypeScript rules

- functions with 4 or more positional arguments should use a single destructured argument instead
- types should be in their primary domain file rather than in a dedicated types.ts file
- never create a barrel file such as `index.ts` that re-exports exported variables and functions from another file. Always import directly from the file with the original export

## Svelte rules

- do not use `$effect` to synchronise state
- state whose value is an array should take advantage of mutative array methods instead of re-assigning the entire array for fine-grained updates
- `window` always exists in `onMount` because it only runs on the client. There's no need to check if it is defined

## SvelteKit rules

- use `#lib` as an alias to `src/lib`
- use `$app/state` instead of `$app/stores`
- use the page object from `$app/state` to check the current URL instead of `window.location.href`
- use `goto` from `$app/navigation` instead of assigning a value to `window.location.href`
- href link must be wrapped with `resolve` from `$app/paths`
- files referenced by only one other file should be located adjacent to it. Only move it to the `src/lib` directory if it's used by more than one file
