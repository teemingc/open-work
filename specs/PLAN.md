# Implementation Plan: Monthly GitHub Contribution Tracker

## Overview

Build a SvelteKit application to track open source contributions to the Svelte GitHub organization month-by-month, with manual time entry for all work items. The app fetches GitHub PRs, commits, and reviews, allows manual work entries (experimentation, investigation), and generates OpenCollective-compliant expense submissions.

## Core Requirements

- **Monthly invoicing workflow**: Group contributions by month (YYYY-MM)
- **GitHub integration**: Fetch PRs, commits, reviews, issues, and discussions from selected repositories
- **Manual time entry**: All items require manual hours input (no automatic calculation)
- **Manual work items**: Support experimentation, investigation, meetings, research, maintenance, triage, support
- **Repository selection**: User configures which repos in the organization to track
- **Hour granularity**: 0.5 hour increments only (30 minutes minimum)
- **OpenCollective compliance**: Generate titles and descriptions following SPEC.md requirements
- **Data persistence**: localStorage with export/import capability

## Data Structures

### Core Types (`src/lib/types.ts`)

```typescript
/** GitHub contribution from API */
export interface GitHubContribution {
  id: string; // sha, pr number, etc.
  type: 'commit' | 'pr' | 'issue' | 'review' | 'discussion';
  repository: string; // 'sveltejs/kit'
  title: string;
  url: string;
  date: string; // ISO date
  description?: string;
  hours?: number; // manual entry
}

/** Manually added work */
export interface ManualWorkItem {
  id: string; // uuid
  type: 'experimentation' | 'investigation' | 'meeting' | 'research' | 'maintenance' | 'triage' | 'support' | 'other';
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
  
  githubContributions: GitHubContribution[];
  manualItems: ManualWorkItem[];
  
  expenseTitle?: string;
  expenseDescription?: string;
  
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  totalHours?: number;
  
  lastGitHubFetch?: string;
  githubFetchError?: string;
}

/** App settings */
export interface Settings {
  githubToken?: string;
  githubUsername?: string;
  repositories: string[]; // ['sveltejs/kit', 'sveltejs/svelte']
}

/** Application state */
export interface AppState {
  invoices: Record<string, MonthlyInvoice>; // keyed by YYYY-MM
  currentInvoiceId: string | null;
  settings: Settings;
}
```

### GitHub API Types (`src/lib/github/types.ts`)

```typescript
export interface GitHubAPIOptions {
  username: string;
  token: string;
  repositories: string[];
  year: number;
  month: number;
}

export interface GitHubAPIResponse {
  contributions: GitHubContribution[];
  fetchedAt: string;
  rateLimit: {
    remaining: number;
    reset: string;
  };
}
```

## File Structure

```
src/
  lib/
    types.ts                          # Core data types
    storage.ts                        # localStorage utilities
    github/
      types.ts                        # GitHub API types
      api.ts                          # GitHub API client
      formatter.ts                    # Expense description generator
    stores/
      invoice-store.svelte.ts         # Reactive state management
    components/
      MonthSelector.svelte            # Year/month picker
      GitHubTokenInput.svelte         # Token configuration
      RepositorySelector.svelte       # Multi-select for repos
      ContributionsList.svelte        # GitHub items with hour entry
      ManualWorkForm.svelte           # Quick-add manual items
      ManualWorkList.svelte           # Display/edit manual items
      ExpensePreview.svelte           # Generated title/description
      InvoiceCard.svelte              # Invoice list item
  routes/
    +page.svelte                      # Dashboard/landing
    settings/
      +page.svelte                    # GitHub token & repo config
    invoices/
      +page.svelte                    # Invoice list view
      [invoiceId]/
        +page.svelte                  # Invoice editor
        +page.ts                      # Load invoice data
```

## Component Specifications

### 1. RepositorySelector.svelte

**Purpose**: Multi-select checkbox list for choosing which Svelte org repos to track

**Props**: 
- `selected: string[]` (bind:value)

**Features**:
- Predefined list of common Svelte repos (kit, svelte, vite-plugin-svelte, language-tools, etc.)
- "Add custom" input for other repos
- Show org/repo format validation
- Save to settings

**UI Pattern**:
```
☑️ sveltejs/kit
☑️ sveltejs/svelte
☐ sveltejs/vite-plugin-svelte
☐ sveltejs/language-tools
☐ sveltejs/svelte-devtools
➕ Add custom repository...
```

### 2. ContributionsList.svelte

**Purpose**: Display fetched GitHub contributions with hour entry

**Props**:
- `contributions: GitHubContribution[]`
- `onUpdateHours: (id: string, hours: number) => void`

**Features**:
- Group by repository
- Checkbox to include/exclude items
- Hour input (0.5 step, min 0.5)
- Show date, type icon, title, link
- Summary: "X items selected, Y hours entered"

**UI Pattern**:
```
📦 sveltejs/kit (8 items - 12 hours)
  ☑️ [PR #12345] Fix routing bug
      Nov 3, 2024 | [Hours: 2.0 ▼] | View on GitHub
  ☑️ [abc123] Update docs
      Nov 5, 2024 | [Hours: 1.5 ▼] | View on GitHub
  ☐ [#12350] Review new feature
      Nov 10, 2024 | [Hours: ___ ] | View on GitHub
  ☑️ [Issue #12340] Triaged and responded to bug report
      Nov 8, 2024 | [Hours: 0.5 ▼] | View on GitHub
```

### 3. ManualWorkForm.svelte

**Purpose**: Quick-add form for manual work items

**Props**:
- `onAdd: (item: Omit<ManualWorkItem, 'id'>) => void`

**Features**:
- Type dropdown (with emoji icons)
- Title input (brief)
- Hours input (0.5 step, min 0.5, required)
- Description textarea (optional)
- Links input (optional, multi-line)
- Date picker (defaults to today)

**Validation**:
- Title required, max 100 chars
- Hours required, min 0.5, step 0.5
- Links must be valid URLs if provided

### 4. ExpensePreview.svelte

**Purpose**: Live preview of generated expense title and description

**Props**:
- `invoice: MonthlyInvoice`

**Features**:
- Auto-generate on data change
- Copy to clipboard button
- Editable mode for manual tweaks
- Character/word count

**Format** (following SPEC.md):
```
Title: Maintenance and Development (11/2024)

Description:
────────────────────────────────────────────
Contributions to Svelte ecosystem in November 2024 (32 hours):

**sveltejs/kit:**
- Fixed routing bug in production builds (#12345) - 2h
- Updated documentation for load functions (abc123) - 1.5h

**sveltejs/svelte:**
- Reviewed new reactivity primitives PR (#6789) - 1h

**Additional work:**
- 🔬 Experimentation: Testing Svelte 5 patterns - 8h
- 🔍 Investigation: HMR performance issues - 4h
- 🎯 Triage: Issue management and community support - 3h

Supporting links:
- https://github.com/sveltejs/kit/pull/12345
- https://github.com/sveltejs/svelte/commit/abc123
────────────────────────────────────────────

[Copy to Clipboard] [Edit Custom]
```

## Storage Implementation

### localStorage Structure (`src/lib/storage.ts`)

```typescript
{
  "oc-invoice-data": {
    "version": 1,
    "data": {
      "invoices": {
        "2024-11": { /* MonthlyInvoice */ },
        "2024-12": { /* MonthlyInvoice */ }
      },
      "currentInvoiceId": "2024-12",
      "settings": {
        "githubUsername": "username",
        "githubToken": "ghp_...",
        "repositories": ["sveltejs/kit", "sveltejs/svelte"]
      }
    }
  }
}
```

**Functions**:
- `load(): AppState | null` - Load from localStorage
- `save(state: AppState): void` - Save to localStorage
- `export(): string` - JSON export
- `import(json: string): void` - JSON import
- `clear(): void` - Clear all data

**Features**:
- Version migration support
- Error handling (quota exceeded)
- Auto-save using Svelte 5 `$effect`

## GitHub API Integration

### Client Implementation (`src/lib/github/api.ts`)

**Authentication**: User-provided Personal Access Token (stored in localStorage)

**Endpoints Used**:
1. **PRs**: `GET /search/issues?q=author:{user}+org:sveltejs+type:pr+created:{YYYY-MM-01}..{YYYY-MM-31}`
2. **Commits**: `GET /repos/{owner}/{repo}/commits?author={user}&since={YYYY-MM-01T00:00:00Z}&until={YYYY-MM-31T23:59:59Z}`
3. **Reviews**: `GET /repos/{owner}/{repo}/pulls/{number}/reviews` (filter by username)
4. **Issues**: `GET /search/issues?q=commenter:{user}+org:sveltejs+type:issue+updated:{YYYY-MM-01}..{YYYY-MM-31}` or `involves:{user}` for broader tracking
5. **Discussions**: `GET /graphql` with GraphQL query for user's discussion comments and replies in org repos

**Rate Limiting**:
- With PAT: 5,000 requests/hour
- Search API: 30 requests/minute
- Track in response headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Display rate limit status in UI

**Functions**:
```typescript
export async function fetchContributionsForMonth(
  options: GitHubAPIOptions
): Promise<GitHubAPIResponse>

async function fetchPRs(
  owner: string, 
  repo: string, 
  username: string, 
  token: string,
  startDate: Date,
  endDate: Date
): Promise<GitHubContribution[]>

async function fetchCommits(...): Promise<GitHubContribution[]>

async function fetchReviews(...): Promise<GitHubContribution[]>

async function fetchIssues(...): Promise<GitHubContribution[]>

async function fetchDiscussions(...): Promise<GitHubContribution[]>
```

**Error Handling**:
- Invalid token
- Rate limit exceeded
- Network errors
- Repository not found
- Show user-friendly messages

## Invoice Store Implementation

### Reactive Store (`src/lib/stores/invoice-store.svelte.ts`)

Using Svelte 5 runes for reactive state management:

```typescript
class InvoiceStore {
  state = $state<AppState>(/* initial */);
  
  // Computed values
  currentInvoice = $derived(/* ... */);
  invoiceList = $derived(/* ... */);
  totalHoursThisMonth = $derived(/* ... */);
  
  // Constructor loads from storage
  constructor() {
    const loaded = storage.load();
    if (loaded) this.state = loaded;
  }
  
  // Auto-save on changes
  $effect(() => {
    storage.save(this.state);
  });
  
  // Actions
  createInvoice(year: number, month: number): string
  deleteInvoice(id: string): void
  updateInvoice(id: string, updates: Partial<MonthlyInvoice>): void
  
  addGitHubContributions(invoiceId: string, contributions: GitHubContribution[]): void
  updateContributionHours(invoiceId: string, contributionId: string, hours: number): void
  
  addManualItem(invoiceId: string, item: Omit<ManualWorkItem, 'id'>): void
  updateManualItem(invoiceId: string, itemId: string, updates: Partial<ManualWorkItem>): void
  deleteManualItem(invoiceId: string, itemId: string): void
  
  updateSettings(settings: Partial<Settings>): void
  
  setCurrentInvoice(id: string): void
}

export const invoiceStore = new InvoiceStore();
```

## Expense Formatter Implementation

### Generator (`src/lib/github/formatter.ts`)

**Functions**:
```typescript
export function generateExpenseTitle(invoice: MonthlyInvoice): string
// Returns: "Maintenance and Development (MM/YYYY)"

export function generateExpenseDescription(invoice: MonthlyInvoice): string
// Returns: Full formatted description per SPEC.md

function groupByRepository(contributions: GitHubContribution[]): Record<string, GitHubContribution[]>

function calculateTotalHours(invoice: MonthlyInvoice): number

function formatWorkType(type: ManualWorkItem['type']): string
// Maps types to emoji labels
```

**SPEC.md Compliance**:
- ✅ Specific, descriptive titles
- ✅ Detailed work description
- ✅ Project support context
- ✅ Timeframe included
- ✅ All supporting links

## Page Implementations

### 1. Settings Page (`src/routes/settings/+page.svelte`)

**Sections**:
1. **GitHub Configuration**
   - Username input
   - Token input (password field)
   - "Test Connection" button
   - Token status indicator
   - Link to GitHub PAT creation docs

2. **Repository Selection**
   - RepositorySelector component
   - Predefined Svelte repos
   - Add custom repos
   - Validation (org/repo format)

3. **Data Management**
   - Export all data (JSON download)
   - Import data (JSON upload)
   - Clear all data (with confirmation)

### 2. Invoice List Page (`src/routes/invoices/+page.svelte`)

**Features**:
- Group invoices by year
- Show: month, status badge, total hours
- Actions: Edit, Delete, Duplicate
- Status filters: All, Draft, Submitted, Paid
- Sort: Newest, Oldest, Hours
- Create new invoice button

**Layout**:
```
[Create New Invoice]                    [Export All] [Import]

[Filter: All ▼] [Sort: Newest ▼]

2024
  ├─ December (Draft) - 24h - [Edit] [Delete]
  ├─ November (Submitted) - 32h - [View]
  └─ October (Paid) - 28h - [View]

2023
  ├─ December (Paid) - 30h - [View]
  └─ November (Paid) - 25h - [View]
```

### 3. Invoice Editor Page (`src/routes/invoices/[invoiceId]/+page.svelte`)

**Layout Sections**:

1. **Header Bar**
   - Back to list button
   - Month/Year display
   - Status dropdown (draft/submitted/approved/paid)
   - Total hours counter
   - Last saved timestamp
   - Action buttons: Export, Delete, Submit

2. **GitHub Contributions Section**
   - "Fetch from GitHub" button
   - Repository filter dropdown
   - ContributionsList component
   - Summary: X items, Y hours entered
   - "Apply hours to selected" bulk action

3. **Manual Work Section**
   - ManualWorkForm component (inline)
   - ManualWorkList component
   - Summary: X items, Y hours

4. **Expense Preview Section** (collapsible)
   - ExpensePreview component
   - Copy to clipboard
   - Download as text file
   - Show validation warnings

### 4. Home/Dashboard Page (`src/routes/+page.svelte`)

**Features**:
- Quick stats: Total invoices, hours this month, unpaid hours
- Current month invoice (quick access)
- Recent drafts (3 most recent)
- Quick actions: Create new, View all, Settings

**Layout**:
```
OpenCollective Invoice Generator

[⚙️ Settings]

Current Month: December 2024
├─ Status: Draft
├─ Hours: 24 (12 GitHub, 12 manual)
└─ [Continue Editing →]

Recent Drafts:
├─ November 2024 - 32h [Edit]
├─ October 2024 - 28h [Edit]

[+ Create New Invoice] [View All Invoices]
```

## Implementation Steps

### Phase 1: Foundation
1. Create core types (`src/lib/types.ts`)
2. Create storage utility (`src/lib/storage.ts`)
3. Create invoice store (`src/lib/stores/invoice-store.svelte.ts`)
4. Test storage persistence

### Phase 2: GitHub Integration
5. Create GitHub types (`src/lib/github/types.ts`)
6. Create GitHub API client (`src/lib/github/api.ts`)
7. Create expense formatter (`src/lib/github/formatter.ts`)
8. Test GitHub API fetching

### Phase 3: UI Components
9. Create RepositorySelector component
10. Create MonthSelector component
11. Create GitHubTokenInput component
12. Create ContributionsList component
13. Create ManualWorkForm component
14. Create ManualWorkList component
15. Create ExpensePreview component
16. Create InvoiceCard component

### Phase 4: Pages
17. Create Settings page (`src/routes/settings/+page.svelte`)
18. Create Invoice List page (`src/routes/invoices/+page.svelte`)
19. Create Invoice Editor page (`src/routes/invoices/[invoiceId]/+page.svelte`)
20. Update Home page (`src/routes/+page.svelte`)

### Phase 5: Polish
21. Add loading states
22. Add error handling
23. Add validation feedback
24. Add keyboard shortcuts
25. Test export/import
26. Test with Playwright

## User Flow

### First-Time Setup
1. Visit app → redirected to settings
2. Enter GitHub username
3. Enter GitHub PAT (with instructions)
4. Select repositories to track
5. Test connection
6. Redirect to dashboard

### Monthly Workflow
1. Start of new month → create invoice for previous month
2. Select month/year
3. Fetch GitHub contributions
4. Review contributions, enter hours for each (0.5 increments)
5. Add manual work items (experimentation, investigation)
6. Review expense preview
7. Copy title and description
8. Submit to OpenCollective
9. Mark invoice as "submitted"
10. When paid, mark as "paid"

### Ongoing Usage
- View all invoices by month
- Edit drafts anytime
- Export data for backup
- Update repository list as needed

## Technical Considerations

### Svelte 5 Patterns
- Use `$state()` for reactive state
- Use `$derived()` for computed values
- Use `$effect()` for side effects (auto-save)
- Use `$props()` for component props
- Use `{@render children()}` in layouts

### Tailwind CSS
- Use `@tailwindcss/forms` for form styling
- Use `@tailwindcss/typography` for content
- Mobile-responsive design
- Dark mode support (future)

### TypeScript
- Strict mode enabled
- Full type safety
- No `any` types

### Testing
- E2E tests with Playwright
- Unit tests with Vitest
- Test storage operations
- Test GitHub API mocking
- Test expense generation

### Accessibility
- Semantic HTML
- ARIA labels
- Keyboard navigation
- Focus management
- Screen reader friendly

### Performance
- Lazy load invoice list
- Virtualize large contribution lists
- Debounce auto-save
- Cache GitHub responses
- Optimize re-renders

## Future Enhancements

### Phase 6: Advanced Features
- Multiple GitHub organizations
- Time tracking integration (Toggl, Harvest)
- Invoice templates
- Hourly rate calculator
- PDF export
- Email integration
- Calendar integration
- Multi-currency support

### Phase 7: Collaboration
- Team invoicing
- Shared templates
- Approval workflows
- Comments/notes

### Phase 8: Analytics
- Contribution trends
- Time spent by repository
- Monthly comparison
- Burnout indicators

## Success Metrics

- ✅ User can track monthly contributions
- ✅ User can enter hours manually
- ✅ User can select repositories
- ✅ Generated expenses comply with SPEC.md
- ✅ Data persists across sessions
- ✅ Export/import works correctly
- ✅ GitHub API fetching is reliable
- ✅ UI is intuitive and responsive
