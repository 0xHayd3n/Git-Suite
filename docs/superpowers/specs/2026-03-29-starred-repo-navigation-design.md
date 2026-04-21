# Starred Repo Navigation — Design Spec

**Date:** 2026-03-29

## Summary

Make each repo row in the Starred view clickable, navigating to the repo detail page (`/repo/{owner}/{name}`), consistent with how Discovery works.

## Changes

**File:** `src/views/Starred.tsx`

1. Import `useNavigate` from `react-router-dom`
2. Instantiate `const navigate = useNavigate()` inside the component
3. Add `onClick={() => navigate(`/repo/${r.owner}/${r.name}`)}` to the `starred-row` div
4. Update the install button's `onClick` to always call `e.stopPropagation()` unconditionally, regardless of install state — the current handler (`state === 'UNINSTALLED' && handleInstall(...)`) returns `false` in the INSTALLED state without stopping propagation, which would otherwise trigger row navigation when clicking the "✓ Installed" button

**File:** `src/styles/*.css` (whichever file styles `.starred-row`)

5. Add `cursor: pointer` to the `.starred-row` CSS rule rather than using an inline style, for consistency with the rest of the codebase

## Out of Scope

- Scroll/filter state restoration on back-navigation (Discover-style snapshots) — not needed for this change
- No new files, no new state, no API changes
