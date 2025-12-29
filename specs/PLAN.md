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

## Implementation Steps

### Phase 5: Polish

23. Add loading states
24. Add error handling
25. Add validation feedback
26. Add keyboard shortcuts
27. Test export/import
28. Test with Playwright

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

### Performance

- Lazy load invoice list
- Virtualize large contribution lists
- Debounce auto-save
- Cache GitHub responses
- Optimize re-renders

## Future Enhancements

### Phase 8: Analytics

- Contribution trends
- Time spent by repository
- Monthly comparison
- Burnout indicators

## Success Metrics

- ✅ User can track monthly contributions
- ✅ User can enter hours manually
- ✅ User can select repositories
- ✅ User can set hourly rate and see amounts
- ✅ User can set monthly goals and track progress
- ✅ User can see real-time progress updates
- ✅ Generated expenses comply with SPEC.md
- ✅ Data persists across sessions
- ✅ Export/import works correctly
- ✅ GitHub API fetching is reliable
- ✅ UI is intuitive and responsive
