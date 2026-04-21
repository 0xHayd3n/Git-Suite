# Profile Section Design

**Date:** 2026-04-17
**Status:** Approved

## Overview

Add a dedicated Profile section to Git-Suite displaying the authenticated user's GitHub profile. The section is a full-page route (`/profile`) accessible via a new Dock nav item added to `NAV_ITEMS` after Starred.

## Layout

**GitHub-style split layout:**

- **Left sidebar** (~220px, fixed): Avatar, display name, username, bio, location, company, blog/website (`user.blog`), joined date, followers/following counts, "Edit on GitHub" button.
- **Right content area** (flex-1): Tab bar at top, scrollable content below.

The sidebar is static — it does not scroll with the content. The right panel is independently scrollable.

## Navigation

- New Dock nav item: **Profile** (person icon), added to the `NAV_ITEMS` array in `Dock.tsx` after the Starred entry (before the divider/Settings section).
- Route: `/profile` (no username param — always the authenticated user).
- Active state follows the existing Dock pattern: accent background + left-edge indicator bar.

## Content Tabs (right panel)

Four tabs, matching the existing ProfileOverlay labels exactly:

1. **Repos** — repos for the authenticated user, sortable by Stars / Updated / Name. Whether private repos are included depends on the backend endpoint — verify during implementation whether `getUserRepos` uses `/user/repos` (includes private) or `/users/:login/repos` (public only); update the tab label/tooltip accordingly.
2. **Starred** — repos the user has starred, sortable client-side by Stars / Recent. `getStarred` takes no sort argument — sort is applied client-side after fetch.
3. **Following** — accounts the user follows, rendered as person rows.
4. **Followers** — accounts following the user, rendered as person rows.

Clicking a repo card navigates to `/repo/:owner/:name`. Clicking a person row opens the existing `ProfileOverlay` for that user.

## Data

All data comes from the existing IPC API — no new backend work required:

| Call | Purpose |
|---|---|
| `window.api.github.getUser()` | Get authenticated user (no args — returns current user) |
| `window.api.profile.getUser(username)` | Sidebar profile data |
| `window.api.profile.getUserRepos(username, sort)` | Repos tab (`sort`: `'stars'` \| `'updated'` \| `'name'`) |
| `window.api.profile.getStarred(username)` | Starred tab (no sort param; sort client-side) |
| `window.api.profile.getFollowing(username)` | Following tab |
| `window.api.profile.getFollowers(username)` | Followers tab |

On mount: call `window.api.github.getUser()` to get the authenticated `login`, then call `window.api.profile.getUser(login)` for the full profile data.

**Type note:** The `GitHubUser` interface in `src/env.d.ts` is missing `blog` and `created_at` fields that the GitHub API returns. During implementation, extend the interface to add `blog?: string | null` and `created_at?: string | null`, or access them via `(user as any).blog` / `(user as any).created_at` if a full interface change is not desired.

## Files to Create / Modify

| File | Change |
|---|---|
| `src/views/Profile.tsx` | New — full profile page view |
| `src/styles/globals.css` | New CSS classes for profile layout |
| `src/App.tsx` | Add `/profile` route |
| `src/components/Dock.tsx` | Add Profile nav item to `NAV_ITEMS` after Starred |

## Component Architecture

`Profile.tsx` is a self-contained view. It does **not** refactor or extend `ProfileOverlay.tsx` — that component remains the modal overlay for viewing other users. `Profile.tsx` calls the same IPC methods independently.

Internal structure of `Profile.tsx` (inline sections, not separate files):
- **Sidebar section** — avatar, bio, meta rows, stats
- **Tab bar** — active tab state
- **ReposTab** — repo cards for Repos tab, with Stars/Updated/Name sort
- **StarredTab** — repo cards for Starred tab, client-side Stars/Recent sort
- **PeopleTab** — person rows for Following and Followers tabs (shared)

Naming follows the `ProfileOverlay.tsx` convention (`ReposTab`, `StarredTab`, `PeopleTab`).

## CSS

All styles added to `globals.css`. Key class names:

```
.profile-view          — outer flex container (row)
.profile-sidebar       — left fixed column
.profile-avatar        — large circular avatar
.profile-name          — display name
.profile-username      — @handle, muted
.profile-bio           — bio text
.profile-meta-row      — icon + text row (location, company, blog, etc.)
.profile-stats         — followers/following count row
.profile-content       — right flex-1 column
.profile-tabs          — tab bar strip
.profile-tab           — individual tab button
.profile-tab.active    — active tab (accent underline)
.profile-tab-panel     — scrollable content area per tab
```

Uses existing design tokens (`--bg`, `--bg2`, `--bg3`, `--border`, `--accent`, `--t1`–`--t4`, etc.). No new tokens needed.

## Loading & Error States

- Skeleton placeholder for sidebar while `getUser` resolves.
- Per-tab skeleton while tab content loads (lazy — fetch on first tab switch, cache results in component state).
- Error state with retry button if any fetch fails.

## Out of Scope

- Editing profile fields in-app (redirect to GitHub.com instead).
- Contribution graph / activity heatmap.
- Pinned repositories.
- Organization membership display.
