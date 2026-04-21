# Learn + Download Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Install" to "Learn" across all UI, and add a new icon-only "Download" button that fetches the repo ZIP from GitHub and saves it to a configurable local folder.

**Architecture:** The rename is purely cosmetic — state types and labels change, but IPC channels and DB schema stay the same. The download feature adds a new `downloadRepoZip()` function to the existing download service, a new `download:repoZip` IPC handler, and a preload exposure. Settings gets a download folder picker.

**Tech Stack:** Electron (IPC, dialog, fs), React, TypeScript, GitHub REST API (zipball endpoint)

**Spec:** `docs/superpowers/specs/2026-04-07-learn-download-overhaul-design.md`

---

### Task 1: Rename Install → Learn in RepoCard

**Files:**
- Modify: `src/components/RepoCard.tsx:147,183-187,233-246,393-403`

- [ ] **Step 1: Rename state type and variable**

Change the type definition at line 147:
```typescript
// Before
type InstallState = 'UNINSTALLED' | 'GENERATING' | 'INSTALLED'

// After
type LearnState = 'UNLEARNED' | 'LEARNING' | 'LEARNED'
```

Update all `InstallState` references to `LearnState`, all `installState`/`setInstallState` to `learnState`/`setLearnState`, all `installError`/`setInstallError` to `learnError`/`setLearnError`.

Update state values throughout:
- `'UNINSTALLED'` → `'UNLEARNED'`
- `'GENERATING'` → `'LEARNING'`
- `'INSTALLED'` → `'LEARNED'`

- [ ] **Step 2: Rename handler function**

Rename `handleInstall` to `handleLearn` (lines 233-246). Update its internal state transitions and the `onClick` reference.

- [ ] **Step 3: Update button labels**

Update the button text at lines 393-403:
```typescript
{learnState === 'UNLEARNED'  && '+ Learn'}
{learnState === 'LEARNING'   && '⟳ Learning...'}
{learnState === 'LEARNED'    && '✓ Learned'}
```

- [ ] **Step 4: Update error messages**

```typescript
{learnError === 'no-key' && <p className="install-error">Add an API key in Settings</p>}
{learnError === 'failed'  && <p className="install-error">Learning failed — try again</p>}
```

- [ ] **Step 5: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/components/RepoCard.tsx
git commit -m "refactor: rename Install to Learn in RepoCard"
```

---

### Task 2: Rename Install → Learn in RepoListRow

**Files:**
- Modify: `src/components/RepoListRow.tsx:9,44-48,67-77,149-157`

- [ ] **Step 1: Rename state type, variables, and handler**

Same pattern as Task 1:
- `InstallState` → `LearnState` (line 9)
- `installState`/`setInstallState` → `learnState`/`setLearnState`
- `handleInstall` → `handleLearn` (lines 67-77)
- State values: `UNINSTALLED→UNLEARNED`, `GENERATING→LEARNING`, `INSTALLED→LEARNED`

- [ ] **Step 2: Update button labels**

Lines 149-157:
```typescript
{learnState === 'UNLEARNED'  && '+ Learn'}
{learnState === 'LEARNING'   && '⟳ Learning...'}
{learnState === 'LEARNED'    && '✓ Learned'}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/components/RepoListRow.tsx
git commit -m "refactor: rename Install to Learn in RepoListRow"
```

---

### Task 3: Rename Install → Learn in RepoDetail

**Files:**
- Modify: `src/views/RepoDetail.tsx:316,447-455,755-837,972-979,1162-1185,1393-1449,1488-1527`

- [ ] **Step 1: Rename state type**

Line 316:
```typescript
type LearnState = 'UNLEARNED' | 'LEARNING' | 'LEARNED' | 'ENHANCING'
```

- [ ] **Step 2: Rename state variables**

Lines 447-455:
- `installState`/`setInstallState` → `learnState`/`setLearnState`
- `installError`/`setInstallError` → `learnError`/`setLearnError`
- `versionInstallStates`/`setVersionInstallStates` → `versionLearnStates`/`setVersionLearnStates`
- Update all state values: `UNINSTALLED→UNLEARNED`, `GENERATING→LEARNING`, `INSTALLED→LEARNED`

- [ ] **Step 3: Rename handler functions**

- `handleInstall` → `handleLearn` (lines 755-772)
- `handleRegenerateTarget` → `handleRelearnTarget` (lines 774-795)
- `handleRegenerateAll` → `handleRelearnAll` (lines 797-804)
- `handleUninstall` → `handleUnlearn` (lines 806-812)
- `handleVersionInstall` → `handleVersionLearn` (lines 827-837)
- `handleEnhance` stays as-is

- [ ] **Step 4: Update main button labels**

Lines 1393-1408:
```typescript
// UNLEARNED
'+ Learn'
// LEARNING
'Learning…'
// ENHANCING
'Enhancing…' (unchanged)
// LEARNED default
'✓ Learned'
// LEARNED hover
'× Unlearn'
```

- [ ] **Step 5: Update regenerate → relearn labels**

Lines 1439-1449 (regen all button):
- aria-label: `'Relearn all skill files'`
- title: `'Relearn all skill files'`
- Text: `'↺ all'` (unchanged, it's just an icon+text)

Lines 1488-1497 (master skill regen):
- aria-label: `'Relearn master skill'`
- Text: `'↺ Relearn'` / `'Relearning…'`

Lines 1518-1527 (components skill regen):
- aria-label: `'Relearn components skill'`
- Text: `'↺ Relearn'` / `'Relearning…'`

- [ ] **Step 6: Update version install labels**

Lines 1162-1185:
- `'Installing…'` → `'Learning…'`
- `'Install this version'` → `'Learn this version'`
- `'Failed — retry'` stays as-is

- [ ] **Step 7: Update error banner**

Line 979: Change `'Generation failed'` → `'Learning failed'` in the error banner text.

- [ ] **Step 8: Update placeholder text**

Lines ~1149 and ~1539: Change `'Install this repo to generate a Skills Folder for Claude.'` → `'Learn this repo to generate a Skills Folder for Claude.'`

- [ ] **Step 9: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 10: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "refactor: rename Install to Learn in RepoDetail"
```

---

### Task 4: Update Tests for Rename

**Files:**
- Modify: `src/views/Discover.test.tsx` (has 10+ install-related assertions)
- Modify: `src/views/RepoDetail.test.tsx` (has 15+ install-related assertions)
- Modify: Any other test files found via grep

- [ ] **Step 1: Search for all test files with install references**

Run: `grep -rn "Install\|Uninstall\|Generating\|Generation failed" src/ --include="*.test.*"`

Identify all files and lines that need updating.

- [ ] **Step 2: Update Discover.test.tsx**

Update all assertions referencing "Install", "Installed", "Generating" text to "Learn", "Learned", "Learning".

- [ ] **Step 3: Update RepoDetail.test.tsx**

Update all assertions referencing "Install", "Installed", "Uninstall", "Regenerate", "Generation failed" to "Learn", "Learned", "Unlearn", "Relearn", "Learning failed".

- [ ] **Step 4: Update any other test files found in Step 1**

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/views/Discover.test.tsx src/views/RepoDetail.test.tsx
git commit -m "test: update test assertions for Install → Learn rename"
```

---

### Task 5: Add downloadRepoZip to Download Service

**Files:**
- Modify: `electron/services/downloadService.ts`

- [ ] **Step 1: Add the downloadRepoZip function**

Add at the end of the file (before the helpers section):

```typescript
// ── Repo ZIP Download ──

export async function downloadRepoZip(
  owner: string,
  name: string,
  downloadFolder: string,
  token: string | null
): Promise<string> {
  const fs = await import('fs')
  const fsp = await import('fs/promises')
  const path = await import('path')

  // Ensure download directory exists
  if (!fs.existsSync(downloadFolder)) {
    await fsp.mkdir(downloadFolder, { recursive: true })
  }

  const url = `https://api.github.com/repos/${owner}/${name}/zipball`
  const res = await fetch(url, {
    headers: githubHeaders(token),
  })

  if (!res.ok) {
    throw new Error(`GitHub zipball request failed: ${res.status} ${res.statusText}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const filePath = path.join(downloadFolder, `${owner}-${name}.zip`)
  await fsp.writeFile(filePath, buffer)
  return filePath
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add electron/services/downloadService.ts
git commit -m "feat: add downloadRepoZip function to download service"
```

---

### Task 6: Add download:repoZip IPC Handler

**Files:**
- Modify: `electron/ipc/downloadHandlers.ts`
- Modify: `electron/preload.ts:222-229`

- [ ] **Step 1: Add IPC handler**

In `electron/ipc/downloadHandlers.ts`, add the import and handler:

```typescript
import { ipcMain, app } from 'electron'
import { downloadRawFile, downloadRawFolder, downloadConverted, downloadRepoZip } from '../services/downloadService'
import { getDb } from '../db'
import { getToken } from '../store'

export function registerDownloadHandlers(): void {
  // ... existing handlers ...

  ipcMain.handle('download:repoZip', async (_event, owner: string, name: string) => {
    const db = getDb(app.getPath('userData'))
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadFolder') as
      | { value: string }
      | undefined
    const downloadFolder = row?.value ?? require('path').join(app.getPath('userData'), 'downloads')
    const token = getToken()
    return downloadRepoZip(owner, name, downloadFolder, token)
  })
}
```

Note: Update the existing import of `ipcMain` to also import `app`, and add the new imports for `getDb` and `getToken`.

- [ ] **Step 2: Add preload exposure**

In `electron/preload.ts`, add `repoZip` to the existing `download` namespace at line 228:

```typescript
download: {
  rawFile:    (params: { owner: string; name: string; branch: string; path: string }) =>
    ipcRenderer.invoke('download:rawFile', params),
  rawFolder:  (params: { owner: string; name: string; branch: string; path: string }) =>
    ipcRenderer.invoke('download:rawFolder', params),
  convert:    (params: { owner: string; name: string; branch: string; path: string; format: 'docx' | 'pdf' | 'epub'; isFolder: boolean }) =>
    ipcRenderer.invoke('download:convert', params),
  repoZip:    (owner: string, name: string) =>
    ipcRenderer.invoke('download:repoZip', owner, name),
},
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/downloadHandlers.ts electron/preload.ts
git commit -m "feat: add download:repoZip IPC handler and preload exposure"
```

---

### Task 7: Add Download Button to RepoCard

**Files:**
- Modify: `src/components/RepoCard.tsx`

- [ ] **Step 1: Add download state and handler**

Add state and handler near the existing learn state:

```typescript
type DownloadState = 'IDLE' | 'DOWNLOADING' | 'COMPLETE' | 'ERROR'

const [downloadState, setDownloadState] = useState<DownloadState>('IDLE')
const [downloadError, setDownloadError] = useState<string | null>(null)

const handleDownload = async (e: React.MouseEvent) => {
  e.stopPropagation()
  setDownloadState('DOWNLOADING')
  setDownloadError(null)
  try {
    await window.api.download.repoZip(repo.owner, repo.name)
    setDownloadState('COMPLETE')
    setTimeout(() => setDownloadState('IDLE'), 2000)
  } catch (err) {
    setDownloadState('ERROR')
    setDownloadError(err instanceof Error ? err.message : 'Download failed')
    setTimeout(() => setDownloadState('IDLE'), 3000)
  }
}
```

- [ ] **Step 2: Add download icon button next to Learn button**

In the card footer, right after the Learn button (around line 403), add:

```tsx
<button
  className="download-btn"
  onClick={handleDownload}
  disabled={downloadState === 'DOWNLOADING'}
  title={downloadState === 'ERROR' ? downloadError ?? 'Download failed' : downloadState === 'COMPLETE' ? 'Downloaded!' : 'Download ZIP'}
>
  {downloadState === 'IDLE'        && '↓'}
  {downloadState === 'DOWNLOADING' && '⟳'}
  {downloadState === 'COMPLETE'    && '✓'}
  {downloadState === 'ERROR'       && '✕'}
</button>
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/components/RepoCard.tsx
git commit -m "feat: add download ZIP button to RepoCard"
```

---

### Task 8: Add Download Button to RepoListRow

**Files:**
- Modify: `src/components/RepoListRow.tsx`

- [ ] **Step 1: Add download state and handler**

Same `DownloadState` type, state, and `handleDownload` handler as Task 7.

- [ ] **Step 2: Add download icon button next to Learn button**

In the row actions section (after the Learn button around line 157), add the same icon button pattern as Task 7.

- [ ] **Step 3: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/components/RepoListRow.tsx
git commit -m "feat: add download ZIP button to RepoListRow"
```

---

### Task 9: Add Download Button to RepoDetail

**Files:**
- Modify: `src/views/RepoDetail.tsx`

- [ ] **Step 1: Add download state and handler**

Same `DownloadState` type, state, and `handleDownload` handler as Task 7.

- [ ] **Step 2: Add download icon button alongside Learn/Relearn controls**

Place the download icon button near the main Learn button area (around line 1408), using the same pattern as Task 7.

- [ ] **Step 3: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/views/RepoDetail.tsx
git commit -m "feat: add download ZIP button to RepoDetail"
```

---

### Task 10: Add Download Location Setting to Settings View

**Files:**
- Modify: `src/views/Settings.tsx`
- Modify: `electron/preload.ts` (if dialog IPC needed)

- [ ] **Step 1: Add state for download folder**

```typescript
const [downloadFolder, setDownloadFolder] = useState<string>('')
const [defaultDownloadFolder, setDefaultDownloadFolder] = useState<string>('')
```

- [ ] **Step 2: Load current download folder on mount**

In the existing `useEffect` that loads settings:
```typescript
window.api.download.getDefaultFolder().then((val: string) => {
  setDefaultDownloadFolder(val)
})
window.api.settings.get('downloadFolder').then((val: string | null) => {
  setDownloadFolder(val ?? '')
})
```

The default folder path comes from the main process via `download:getDefaultFolder` IPC (added in Step 5). The custom folder override comes from the settings store.

- [ ] **Step 3: Add Download Location section to Settings UI**

Add a new `.settings-section` after the Language section:

```tsx
<div className="settings-section">
  <h3>DOWNLOAD LOCATION</h3>
  <p className="settings-description">
    Choose where downloaded repository ZIP files are saved.
  </p>
  <div className="download-folder-row">
    <span className="download-folder-path">
      {downloadFolder || defaultDownloadFolder || 'Loading...'}
    </span>
    <button onClick={handleChangeFolder}>Change</button>
    {downloadFolder && (
      <button className="link-btn" onClick={handleResetFolder}>
        Reset to Default
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Add folder picker handlers**

```typescript
const handleChangeFolder = async () => {
  const result = await window.api.download.pickFolder()
  if (result) {
    await window.api.settings.set('downloadFolder', result)
    setDownloadFolder(result)
  }
}

const handleResetFolder = async () => {
  await window.api.settings.set('downloadFolder', '')
  setDownloadFolder('')
}
```

- [ ] **Step 5: Add pickFolder IPC**

In `electron/ipc/downloadHandlers.ts`, add:
```typescript
ipcMain.handle('download:pickFolder', async () => {
  const { dialog } = require('electron')
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('download:getDefaultFolder', async () => {
  const path = require('path')
  return path.join(app.getPath('userData'), 'downloads')
})
```

In `electron/preload.ts`, add to the download namespace:
```typescript
pickFolder:       () => ipcRenderer.invoke('download:pickFolder'),
getDefaultFolder: () => ipcRenderer.invoke('download:getDefaultFolder') as Promise<string>,
```

- [ ] **Step 6: Verify the app compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/views/Settings.tsx electron/ipc/downloadHandlers.ts electron/preload.ts
git commit -m "feat: add download location setting to Settings view"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Manual smoke test**

1. Open the app
2. Verify RepoCard shows "Learn" button instead of "Install"
3. Verify RepoListRow shows "Learn" button
4. Verify RepoDetail shows "Learn", "Relearn", "Unlearn" labels
5. Click the download icon on a repo — verify ZIP saves to download folder
6. Open Settings — verify Download Location section appears
7. Change download location — verify next download uses new path

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final verification and cleanup for Learn + Download overhaul"
```
