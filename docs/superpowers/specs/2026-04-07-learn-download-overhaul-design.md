# Learn + Download Overhaul Design

## Summary

Rename the existing "Install" functionality to "Learn" and add a new "Download" button that downloads a repository's source code as a ZIP from GitHub. Learn remains the primary action (generates AI skill files); Download is a secondary icon-only action (saves repo ZIP to disk).

## 1. Rename: Install → Learn

All user-facing labels and component state names change from install terminology to learn terminology. Internal IPC channel names (`skill:generate`, `skill:get`, etc.), database schema, and CSS class names remain unchanged — no migrations or style refactors needed.

### Label Changes

| Current | New |
|---------|-----|
| Install | Learn |
| Install this repo to generate a Skills Folder for Claude. | Learn this repo to generate a Skills Folder for Claude. |
| Install this version | Learn this version |
| Installing... | Learning... |
| Installed | Learned |
| Generating | Learning |
| Uninstall | Unlearn |
| Regenerate | Relearn |
| Regenerate master skill (aria-label) | Relearn master skill |
| Regenerate all skill files (aria-label) | Relearn all skill files |
| Generation failed | Learning failed |
| Enhancing... | Enhancing... (unchanged) |
| Add an API key in Settings | Add an API key in Settings (unchanged) |

### State Type Changes

```typescript
// Before (RepoCard, RepoListRow)
type InstallState = 'UNINSTALLED' | 'GENERATING' | 'INSTALLED'

// After
type LearnState = 'UNLEARNED' | 'LEARNING' | 'LEARNED'

// Before (RepoDetail — superset with ENHANCING)
type InstallState = 'UNINSTALLED' | 'GENERATING' | 'INSTALLED' | 'ENHANCING'

// After
type LearnState = 'UNLEARNED' | 'LEARNING' | 'LEARNED' | 'ENHANCING'
```

Version-specific install states in RepoDetail (`versionInstallStates` map) also rename: `'UNINSTALLED' | 'GENERATING' | 'INSTALLED' | 'ERROR'` → `'UNLEARNED' | 'LEARNING' | 'LEARNED' | 'ERROR'`.

### Affected Components

- `RepoCard.tsx` — button labels, state type, variable names
- `RepoListRow.tsx` — button labels, state type, variable names
- `RepoDetail.tsx` — button labels, state type, variable names, regenerate→relearn, uninstall→unlearn, version install labels, aria-labels
- Test files — update assertions to match new labels

## 2. Download Button — UI

An icon-only download button placed next to the Learn button in all three views.

### Placement

- **RepoCard:** Download icon in card footer, right of the Learn button
- **RepoListRow:** Download icon in row actions, next to the Learn button
- **RepoDetail:** Download icon alongside the Learn/Relearn controls

### Download States

```typescript
type DownloadState = 'IDLE' | 'DOWNLOADING' | 'COMPLETE' | 'ERROR'
```

| State | Visual |
|-------|--------|
| IDLE | Download icon |
| DOWNLOADING | Spinner, button disabled |
| COMPLETE | Checkmark icon with tooltip showing saved file path, reverts to IDLE after ~2 seconds |
| ERROR | Error tooltip on hover |

The download button appears for all repos (public and private). Private repos work as long as the user's GitHub token has access.

## 3. Download Flow — Backend

### IPC Channel

New channel: `download:repoZip`

This uses the existing `download` IPC namespace (which already contains `rawFile`, `rawFolder`, and `convert`) rather than creating a new namespace. This keeps all download operations grouped together.

### Flow

1. Renderer calls `window.api.download.repoZip(owner, name)`
2. Main process reads `downloadFolder` from settings via existing `settings:get('downloadFolder')` (default: `{app.getPath('userData')}/downloads/`)
3. Ensures the download directory exists (`fs.mkdirSync` with `recursive: true`)
4. Fetches `https://api.github.com/repos/{owner}/{name}/zipball` with the user's GitHub token (if available; public repos work without auth but with lower rate limits)
5. Saves to `{downloadFolder}/{owner}-{name}.zip`, overwriting if the file already exists (re-downloading gets the latest code)
6. Returns the saved file path on success; throws on failure

**Note:** Unlike the existing download functions in `downloadService.ts` which use `dialog.showSaveDialog`, this flow auto-saves to the configured download directory without a dialog. This is intentional — the download location is configured once in Settings, and the button should be a quick one-click action.

### Preload Exposure

Add to the existing `download` namespace in preload:

```typescript
download: {
  // ... existing rawFile, rawFolder, convert
  repoZip: (owner: string, name: string) => ipcRenderer.invoke('download:repoZip', owner, name)
}
```

### Download Service

Add `downloadRepoZip(owner, name, downloadFolder, token)` to `electron/services/downloadService.ts`. This function:

- Constructs the GitHub zipball URL
- Fetches with `Authorization: token {token}` header (omits header if token is null)
- Writes the response buffer to the target path
- Returns the full file path

## 4. Settings — Download Location

Add a "Download Location" section to the existing Settings view.

### UI Elements

- **Label:** "Download Location"
- **Current path display:** Shows the active download folder path
- **Change button:** Opens native folder picker via `dialog.showOpenDialog({ properties: ['openDirectory'] })`
- **Reset to Default link:** Restores to `{app.getPath('userData')}/downloads/`

### Storage

Uses the existing generic settings get/set mechanism (key-value settings table in the database, accessed via `settings:get` and `settings:set` IPC channels). No new IPC channels needed.

- Key: `downloadFolder`
- Default: `{app.getPath('userData')}/downloads/`

## 5. Files Changed

| Area | Files | Changes |
|------|-------|---------|
| UI Rename | `RepoCard.tsx`, `RepoListRow.tsx`, `RepoDetail.tsx` | Install → Learn labels, state type rename, aria-labels |
| Tests | Corresponding test files | Update assertions for new labels |
| Download Button | `RepoCard.tsx`, `RepoListRow.tsx`, `RepoDetail.tsx` | Add icon-only download button with state management |
| Download Service | `electron/services/downloadService.ts` | Add `downloadRepoZip()` function |
| IPC Handler | `electron/main.ts` | Add `download:repoZip` handler |
| Preload | `electron/preload.ts` | Add `repoZip` to existing `download` namespace |
| Settings UI | `src/views/Settings.tsx` | Add download location picker section |
| Types | Component files | `LearnState` and `DownloadState` types |

## 6. Out of Scope

- Downloading specific releases/tags (always downloads default branch)
- Progress bar for downloads (spinner is sufficient for ZIP downloads)
- Database migrations (no schema changes needed)
- Renaming IPC channels, database columns, or CSS class names (internal names stay as-is)
- Renaming CSS classes (e.g. `install-btn` stays — cosmetic only, not user-facing)
