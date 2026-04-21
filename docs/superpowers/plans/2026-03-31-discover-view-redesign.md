# Discover View Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Discover view tab row into three zones, add a pure client-side repo type classifier, apply per-type card accents, and replace the separate language dropdown + filter panel with a unified `FilterDropdown` popover.

**Architecture:** Pure client-side classification with an in-memory `Map<string, RepoType>` computed on every fetch. No new IPC, no DB changes. `FilterDropdown` is a conditionally-rendered component with internal staging state; it commits on Apply/Clear All. All four phases build on each other, so they must be implemented in order.

**Tech Stack:** React 18, TypeScript, Electron IPC, Vitest, plain CSS custom properties, `react-icons/lu` (already installed via `react-icons@^5.6.0`).

**Spec:** `docs/superpowers/specs/2026-03-31-discover-view-redesign.md`

---

## File Map

| Status | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/classifyRepoType.ts` | Pure scoring function: `RepoType` union + `classifyRepoType(repo)` |
| Create | `src/lib/classifyRepoType.test.ts` | Vitest unit tests for the classifier |
| Create | `src/config/repoTypeConfig.ts` | `REPO_TYPE_CONFIG` map: label, icon, accentColor per `RepoType` |
| Create | `src/components/FilterDropdown.tsx` | Unified filter popover (staged state, all filter tabs + language grid) |
| Modify | `src/views/Discover.tsx` | Remove old tab/filter/language UI; add Zone A/B/C; wire classifier + dropdown |
| Modify | `src/components/RepoCard.tsx` | Accept `repoType?` prop; render accent border + type badge |
| Modify | `src/styles/globals.css` | Split `.repo-card` border shorthand; update hover rule; add new CSS classes |
| Modify | `src/lib/discoverStateStore.ts` | Narrow `ViewModeKey` to remove `'updated'` |

---

## Task 1: Narrow `ViewModeKey` and remove "Recently Updated" tab

**Files:**
- Modify: `src/lib/discoverStateStore.ts:9`
- Modify: `src/views/Discover.tsx:24-29` (VIEW_MODES), `45-48` (buildViewModeQuery 'updated' case), `60-66` (getViewModeSort 'updated' case), `214` (viewMode state init)

- [ ] **Step 1: Update `ViewModeKey` in discoverStateStore.ts**

In `src/lib/discoverStateStore.ts` line 9, change:
```typescript
type ViewModeKey = 'popular' | 'updated' | 'forked' | 'rising'
```
to:
```typescript
type ViewModeKey = 'popular' | 'forked' | 'rising'
```

- [ ] **Step 2: Remove `'updated'` from VIEW_MODES in Discover.tsx**

In `src/views/Discover.tsx` lines 24-29, replace:
```typescript
const VIEW_MODES = [
  { key: 'popular', label: 'Most Popular' },
  { key: 'updated', label: 'Recently Updated' },
  { key: 'forked',  label: 'Most Forked' },
  { key: 'rising',  label: 'Rising' },
] as const
```
with:
```typescript
const VIEW_MODES = [
  { key: 'popular', label: 'Most Popular' },
  { key: 'forked',  label: 'Most Forked' },
  { key: 'rising',  label: 'Rising' },
] as const
```

- [ ] **Step 3: Remove the `'updated'` case from `buildViewModeQuery`**

In `src/views/Discover.tsx`, remove the `case 'updated':` block (lines 45-49) from the switch in `buildViewModeQuery`. TypeScript will enforce exhaustiveness now.

- [ ] **Step 4: Remove the `'updated'` case from `getViewModeSort`**

In `src/views/Discover.tsx` line 62, remove `case 'updated': return { sort: 'updated', order: 'desc' }`.

- [ ] **Step 5: Add snapshot fallback for stale `'updated'` viewMode**

In `src/views/Discover.tsx` line 214, change:
```typescript
const [viewMode, setViewMode] = useState<ViewModeKey>(() => restoredSnapshot.current?.viewMode ?? 'popular')
```
to:
```typescript
const [viewMode, setViewMode] = useState<ViewModeKey>(() => {
  const v = restoredSnapshot.current?.viewMode
  return (v === 'popular' || v === 'forked' || v === 'rising') ? v : 'popular'
})
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to `ViewModeKey` or `VIEW_MODES`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/discoverStateStore.ts src/views/Discover.tsx
git commit -m "refactor: remove 'Recently Updated' tab, narrow ViewModeKey"
```

---

## Task 2: Create the repo type classifier

**Files:**
- Create: `src/lib/classifyRepoType.ts`
- Create: `src/lib/classifyRepoType.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/classifyRepoType.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { classifyRepoType } from './classifyRepoType'
import type { RepoRow } from '../types/repo'

function makeRepo(overrides: Partial<RepoRow>): RepoRow {
  return {
    id: 'test/repo',
    owner: 'test',
    name: 'repo',
    description: null,
    language: null,
    topics: '[]',
    stars: null,
    forks: null,
    license: null,
    homepage: null,
    updated_at: null,
    pushed_at: null,
    saved_at: null,
    type: null,
    banner_svg: null,
    discovered_at: null,
    discover_query: null,
    watchers: null,
    size: null,
    open_issues: null,
    default_branch: null,
    avatar_url: null,
    banner_color: null,
    starred_at: null,
    translated_description: null,
    translated_description_lang: null,
    translated_readme: null,
    translated_readme_lang: null,
    detected_language: null,
    ...overrides,
  }
}

describe('classifyRepoType', () => {
  it('classifies awesome-list by topic', () => {
    const repo = makeRepo({ topics: '["awesome-list"]' })
    expect(classifyRepoType(repo)).toBe('awesome-list')
  })

  it('classifies awesome-list by name prefix', () => {
    const repo = makeRepo({ name: 'awesome-react' })
    expect(classifyRepoType(repo)).toBe('awesome-list')
  })

  it('classifies awesome-list by description', () => {
    const repo = makeRepo({ description: 'A curated list of React libraries' })
    expect(classifyRepoType(repo)).toBe('awesome-list')
  })

  it('classifies learning by topic', () => {
    const repo = makeRepo({ topics: '["tutorial","javascript"]' })
    expect(classifyRepoType(repo)).toBe('learning')
  })

  it('classifies learning by description', () => {
    const repo = makeRepo({ description: 'Learn how to build REST APIs' })
    expect(classifyRepoType(repo)).toBe('learning')
  })

  it('classifies framework by topic', () => {
    const repo = makeRepo({ topics: '["framework"]' })
    expect(classifyRepoType(repo)).toBe('framework')
  })

  it('classifies framework by name suffix', () => {
    const repo = makeRepo({ name: 'express-framework' })
    expect(classifyRepoType(repo)).toBe('framework')
  })

  it('classifies tool by topic', () => {
    const repo = makeRepo({ topics: '["cli","tool"]' })
    expect(classifyRepoType(repo)).toBe('tool')
  })

  it('classifies tool by name suffix', () => {
    const repo = makeRepo({ name: 'my-app-cli' })
    expect(classifyRepoType(repo)).toBe('tool')
  })

  it('classifies application by topic', () => {
    const repo = makeRepo({ topics: '["app","desktop"]' })
    expect(classifyRepoType(repo)).toBe('application')
  })

  it('classifies application by name suffix', () => {
    const repo = makeRepo({ name: 'my-desktop-app' })
    expect(classifyRepoType(repo)).toBe('application')
  })

  it('classifies boilerplate as application', () => {
    const repo = makeRepo({ name: 'react-boilerplate' })
    expect(classifyRepoType(repo)).toBe('application')
  })

  it('falls back to other with no signals', () => {
    const repo = makeRepo({ name: 'random-project' })
    expect(classifyRepoType(repo)).toBe('other')
  })

  it('handles malformed topics JSON gracefully', () => {
    const repo = makeRepo({ topics: 'not-json' })
    expect(classifyRepoType(repo)).toBe('other')
  })

  it('handles null description without throwing', () => {
    const repo = makeRepo({ description: null, topics: '["cli"]' })
    expect(classifyRepoType(repo)).toBe('tool')
  })

  it('description matching is case-insensitive', () => {
    const repo = makeRepo({ description: 'A CURATED LIST of tools' })
    expect(classifyRepoType(repo)).toBe('awesome-list')
  })

  it('awesome-list beats learning when both have signals (topic awesome-list +10 > topic tutorial +5)', () => {
    const repo = makeRepo({ topics: '["awesome-list","tutorial"]' })
    expect(classifyRepoType(repo)).toBe('awesome-list')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /d/Coding/Git-Suite && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|classifyRepoType" | head -20
```
Expected: FAIL — `classifyRepoType` not found.

- [ ] **Step 3: Create `src/lib/classifyRepoType.ts`**

```typescript
import type { RepoRow } from '../types/repo'

export type RepoType =
  | 'awesome-list'
  | 'learning'
  | 'framework'
  | 'tool'
  | 'application'
  | 'other'

export function classifyRepoType(repo: RepoRow): RepoType {
  const scores: Record<RepoType, number> = {
    'awesome-list': 0,
    'learning': 0,
    'framework': 0,
    'tool': 0,
    'application': 0,
    'other': 0,
  }

  // Parse topics
  let topics: string[] = []
  try {
    topics = JSON.parse(repo.topics) as string[]
  } catch {
    // treat as empty
  }

  // Topic signals
  for (const t of topics) {
    if (t === 'awesome-list') scores['awesome-list'] += 10
    if (['tutorial', 'course', 'roadmap', 'education', 'learn'].includes(t)) scores['learning'] += 5
    if (['framework', 'library'].includes(t)) scores['framework'] += 5
    if (['cli', 'tool', 'plugin', 'extension'].includes(t)) scores['tool'] += 5
    if (['app', 'application', 'desktop', 'mobile', 'web-app'].includes(t)) scores['application'] += 5
  }

  // Name signals
  const name = repo.name.toLowerCase()
  if (name.startsWith('awesome-'))                                    scores['awesome-list'] += 8
  if (name.endsWith('-cli'))                                          scores['tool'] += 6
  if (name.endsWith('-framework') || name.endsWith('-lib'))           scores['framework'] += 6
  if (name.endsWith('-app') || name.endsWith('-desktop'))             scores['application'] += 6
  if (name.endsWith('-boilerplate') || name.endsWith('-starter') || name.endsWith('-template')) scores['application'] += 4

  // Description signals (case-insensitive substring)
  const desc = (repo.description ?? '').toLowerCase()
  if (desc.includes('curated list') || desc.includes('collection of') || desc.includes('awesome')) scores['awesome-list'] += 6
  if (desc.includes('learn') || desc.includes('guide to') || desc.includes('how to') || desc.includes('tutorial')) scores['learning'] += 4
  if (desc.includes('framework for') || desc.includes('library for')) scores['framework'] += 4
  if (desc.includes('cli') || desc.includes('command-line tool'))     scores['tool'] += 4

  // Pick the winner (excluding 'other' from the competition)
  const types: Exclude<RepoType, 'other'>[] = ['awesome-list', 'learning', 'framework', 'tool', 'application']
  let winner: RepoType = 'other'
  let best = 0
  for (const t of types) {
    if (scores[t] > best) { best = scores[t]; winner = t }
  }

  return winner
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /d/Coding/Git-Suite && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗" | head -30
```
Expected: all `classifyRepoType` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add classifyRepoType — pure client-side repo type scorer"
```

---

## Task 3: Create `repoTypeConfig.ts`

**Files:**
- Create: `src/config/repoTypeConfig.ts`

- [ ] **Step 1: Create the config file**

Create `src/config/repoTypeConfig.ts`:

```typescript
import { LuStar, LuBookOpen, LuLayers, LuWrench, LuMonitor } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { RepoType } from '../lib/classifyRepoType'

export const REPO_TYPE_CONFIG: Record<RepoType, {
  label: string
  icon: IconType | null
  accentColor: string
}> = {
  'awesome-list': { label: 'Awesome List', icon: LuStar,     accentColor: '#f59e0b' },
  'learning':     { label: 'Learning',     icon: LuBookOpen, accentColor: '#3b82f6' },
  'framework':    { label: 'Framework',    icon: LuLayers,   accentColor: '#8b5cf6' },
  'tool':         { label: 'Tool',         icon: LuWrench,   accentColor: '#10b981' },
  'application':  { label: 'Application', icon: LuMonitor,  accentColor: '#ef4444' },
  'other':        { label: 'Other',        icon: null,       accentColor: 'transparent' },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config/repoTypeConfig.ts
git commit -m "feat: add REPO_TYPE_CONFIG — type labels, icons, accent colors"
```

---

## Task 4: Update `RepoCard` with accent border + type badge

**Files:**
- Modify: `src/components/RepoCard.tsx` (props interface ~line 190; body JSX ~line 377-384)
- Modify: `src/styles/globals.css` (`.repo-card` ~line 1149; `.repo-card:hover` ~line 1160)

- [ ] **Step 1: Split `.repo-card` border shorthand in globals.css**

In `src/styles/globals.css`, find the `.repo-card` rule (line ~1149) and replace:
```css
border: 1px solid var(--border);
```
with:
```css
border-top: 1px solid var(--border);
border-right: 1px solid var(--border);
border-bottom: 1px solid var(--border);
border-left: 1px solid var(--border);
```

Also update the `.repo-card:hover` rule: replace:
```css
border-color: var(--border2);
```
with:
```css
border-top-color: var(--border2);
border-right-color: var(--border2);
border-bottom-color: var(--border2);
```
(Do **not** set `border-left-color` here — the inline accent style must survive hover.)

Also replace `transition: border-color 0.15s, box-shadow 0.15s;` in `.repo-card` with:
```css
transition: border-top-color 0.15s, border-right-color 0.15s, border-bottom-color 0.15s, box-shadow 0.15s;
```

- [ ] **Step 2: Add `repoType` prop to `RepoCard`**

In `src/components/RepoCard.tsx`, add imports at the top:
```typescript
import { REPO_TYPE_CONFIG } from '../config/repoTypeConfig'
import type { RepoType } from '../lib/classifyRepoType'
```

Change the `RepoCardProps` interface (line ~190) to add the optional prop:
```typescript
interface RepoCardProps {
  repo: RepoRow
  onNavigate: (path: string) => void
  onTagClick: (tag: string) => void
  onOwnerClick?: (owner: string) => void
  repoType?: RepoType
}
```

Update the function signature to destructure `repoType`:
```typescript
export default function RepoCard({ repo, onNavigate, onTagClick, onOwnerClick, repoType }: RepoCardProps) {
```

- [ ] **Step 3: Apply the accent left-border inline style**

Inside `RepoCard`, derive the config before the JSX return:
```typescript
const typeConfig = repoType ? REPO_TYPE_CONFIG[repoType] : null
const accentBorderLeft = typeConfig && repoType !== 'other'
  ? `2px solid ${typeConfig.accentColor}`
  : undefined
```

Find the root `<div className="repo-card"` JSX element. Add an inline `style` prop (or merge with any existing one):
```tsx
<div
  className="repo-card"
  style={{ borderLeft: accentBorderLeft }}
  onClick={() => onNavigate(...)}
  ...
>
```

- [ ] **Step 4: Add the type badge after `<CardTags>`**

Find the `<CardTags ... />` usage in the JSX (line ~378-384). After the closing `/>`, add:
```tsx
{typeConfig && repoType !== 'other' && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
    {typeConfig.icon && (
      <typeConfig.icon size={10} style={{ color: typeConfig.accentColor, flexShrink: 0 }} />
    )}
    <span style={{ fontSize: 11, color: typeConfig.accentColor }}>{typeConfig.label}</span>
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/RepoCard.tsx src/styles/globals.css
git commit -m "feat: add repoType accent border and type badge to RepoCard"
```

---

## Task 5: Create `FilterDropdown` component

**Files:**
- Create: `src/components/FilterDropdown.tsx`

This is the most complex new component. It replaces the existing inline filter panel and `LanguageDropdown`.

- [ ] **Step 1: Create `src/components/FilterDropdown.tsx`**

```typescript
import { useState } from 'react'
import { LuFilter } from 'react-icons/lu'
import LanguageIcon from './LanguageIcon'
import type { LangDef } from '../lib/languages'

// ── Types ─────────────────────────────────────────────────────────
export type FilterTab = 'activity' | 'stars' | 'license' | 'topics' | 'languages'

type ActivityFilter = 'week' | 'month' | 'halfyear'
type StarsFilter    = 100 | 1000 | 10000

interface SearchFilters {
  activity?: ActivityFilter
  stars?: StarsFilter
  license?: string
  topics?: string[]
}

interface FilterDropdownProps {
  initialTab: FilterTab
  filters: SearchFilters
  activeLanguage: string
  languages: LangDef[]
  onClose: (lastTab: FilterTab) => void   // passes back the active tab so Discover can remember it
  onChange: (filters: SearchFilters, language: string) => void
}

// ── Language categories (lifted from Discover.tsx) ─────────────────
const LANGUAGE_CATEGORIES = [
  { label: 'Web',        keys: ['javascript', 'typescript', 'html', 'css', 'vue', 'svelte', 'coffeescript'] },
  { label: 'Systems',    keys: ['c', 'c++', 'c#', 'rust', 'go', 'zig', 'fortran', 'assembly'] },
  { label: 'JVM',        keys: ['java', 'kotlin', 'scala', 'clojure', 'groovy'] },
  { label: 'Scripting',  keys: ['python', 'ruby', 'php', 'perl', 'shell', 'powershell', 'lua'] },
  { label: 'Functional', keys: ['haskell', 'elixir', 'erlang', 'ocaml', 'elm'] },
  { label: 'Mobile',     keys: ['swift', 'dart'] },
  { label: 'Data',       keys: ['r', 'julia'] },
  { label: 'Other',      keys: ['nix', 'solidity'] },
]

// ── Sub-component: radio group ─────────────────────────────────────
function FilterRadioGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T | undefined }[]
  value: T | undefined
  onChange: (v: T | undefined) => void
}) {
  return (
    <div className="fdd-radio-group">
      {options.map(opt => (
        <button
          key={String(opt.value ?? 'any')}
          className={`fdd-radio-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────
export default function FilterDropdown({
  initialTab,
  filters,
  activeLanguage,
  languages,
  onClose,
  onChange,
}: FilterDropdownProps) {
  // Internal staging state — committed only on Apply or Clear All
  const [activeTab, setActiveTab] = useState<FilterTab>(initialTab)
  const [staged, setStaged] = useState<SearchFilters>({ ...filters })
  const [stagedLang, setStagedLang] = useState(activeLanguage)
  const [topicInput, setTopicInput] = useState(filters.topics?.join(', ') ?? '')

  function handleApply() {
    const topics = topicInput
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
    const committed: SearchFilters = { ...staged, topics: topics.length ? topics : undefined }
    onChange(committed, stagedLang)
    onClose(activeTab)
  }

  function handleClearAll() {
    onChange({}, '')
    onClose(activeTab)
  }

  // Close on outside click
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose(activeTab)
    }
  }

  // Close on ESC key
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose(activeTab)
  }

  return (
    <>
      {/* Invisible backdrop to catch outside clicks */}
      <div
        className="fdd-backdrop"
        onClick={handleBackdropClick}
      />
      {/* Panel owns keyboard events — tabIndex and autoFocus so ESC works */}
      <div
        className="fdd-panel"
        role="dialog"
        aria-label="Filters"
        tabIndex={-1}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onKeyDown={handleKeyDown}
      >
        {/* Left tab list */}
        <div className="fdd-tabs">
          {(['activity', 'stars', 'license', 'topics', 'languages'] as FilterTab[]).map(tab => (
            <button
              key={tab}
              className={`fdd-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div className="fdd-content">
          {activeTab === 'activity' && (
            <FilterRadioGroup<ActivityFilter>
              options={[
                { label: 'Any time',      value: undefined },
                { label: 'Last 7 days',   value: 'week' },
                { label: 'Last 30 days',  value: 'month' },
                { label: 'Last 6 months', value: 'halfyear' },
              ]}
              value={staged.activity}
              onChange={v => setStaged(s => ({ ...s, activity: v }))}
            />
          )}

          {activeTab === 'stars' && (
            <FilterRadioGroup<StarsFilter>
              options={[
                { label: 'Any',   value: undefined },
                { label: '>100',  value: 100 },
                { label: '>1k',   value: 1000 },
                { label: '>10k',  value: 10000 },
              ]}
              value={staged.stars}
              onChange={v => setStaged(s => ({ ...s, stars: v }))}
            />
          )}

          {activeTab === 'license' && (
            <FilterRadioGroup<string>
              options={[
                { label: 'Any',        value: undefined },
                { label: 'MIT',        value: 'mit' },
                { label: 'Apache 2.0', value: 'apache-2.0' },
                { label: 'GPL 3.0',    value: 'gpl-3.0' },
              ]}
              value={staged.license}
              onChange={v => setStaged(s => ({ ...s, license: v }))}
            />
          )}

          {activeTab === 'topics' && (
            <div className="fdd-topics">
              <input
                className="fdd-topic-input"
                placeholder="e.g. cli, web, machine-learning"
                value={topicInput}
                onChange={e => setTopicInput(e.target.value)}
                autoFocus
              />
              {topicInput.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                <span key={tag} className="fdd-topic-chip">
                  {tag}
                  <button
                    className="fdd-topic-chip-remove"
                    onClick={() => {
                      const next = topicInput.split(',').map(t => t.trim()).filter(t => t && t !== tag)
                      setTopicInput(next.join(', '))
                    }}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {activeTab === 'languages' && (
            <div className="fdd-langs">
              <button
                className={`fdd-lang-all${!stagedLang ? ' active' : ''}`}
                onClick={() => setStagedLang('')}
              >
                All Languages
              </button>
              {LANGUAGE_CATEGORIES.map(cat => {
                const langs = cat.keys
                  .map(k => languages.find(l => l.key === k))
                  .filter((l): l is NonNullable<typeof l> => l != null)
                if (langs.length === 0) return null
                return (
                  <div key={cat.label} className="fdd-lang-category">
                    <div className="fdd-lang-cat-header">{cat.label}</div>
                    <div className="fdd-lang-cat-items">
                      {langs.map(lang => (
                        <button
                          key={lang.key}
                          className={`fdd-lang-item${stagedLang === lang.key ? ' active' : ''}`}
                          onClick={() => setStagedLang(lang.key)}
                        >
                          {lang.icon && (
                            <LanguageIcon lang={lang.key} size={11} coloured={stagedLang === lang.key} />
                          )}
                          {lang.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="fdd-footer">
          <button className="fdd-clear-btn" onClick={handleClearAll}>Clear All</button>
          <button className="fdd-apply-btn" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Add CSS for `FilterDropdown` in globals.css**

Append to `src/styles/globals.css`:

```css
/* ── FilterDropdown ─────────────────────────────────────────────── */
.fdd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.fdd-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: min(480px, calc(100vw - 32px));
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 40px rgba(0,0,0,0.16);
  display: grid;
  grid-template-columns: 140px 1fr;
  grid-template-rows: 1fr auto;
  z-index: 100;
  overflow: hidden;
}

.fdd-tabs {
  grid-column: 1;
  grid-row: 1;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.fdd-tab {
  background: none;
  border: none;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--t2);
  text-align: left;
  cursor: pointer;
  border-radius: 0;
  transition: background 0.1s, color 0.1s;
}
.fdd-tab:hover { background: var(--bg3); }
.fdd-tab.active { color: var(--t1); font-weight: 600; background: var(--accent-soft); }

.fdd-content {
  grid-column: 2;
  grid-row: 1;
  padding: 16px;
  overflow-y: auto;
  max-height: 320px;
}

.fdd-footer {
  grid-column: 1 / -1;
  grid-row: 2;
  border-top: 1px solid var(--border);
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fdd-clear-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--t3);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: color 0.12s;
}
.fdd-clear-btn:hover { color: var(--t1); }

.fdd-apply-btn {
  background: var(--accent);
  border: none;
  font-size: 12px;
  color: #fff;
  cursor: pointer;
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  font-weight: 500;
  transition: opacity 0.12s;
}
.fdd-apply-btn:hover { opacity: 0.88; }

/* Radio groups inside FilterDropdown */
.fdd-radio-group { display: flex; flex-direction: column; gap: 2px; }
.fdd-radio-btn {
  background: none;
  border: none;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--t2);
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.1s, color 0.1s;
}
.fdd-radio-btn:hover { background: var(--bg3); }
.fdd-radio-btn.active { color: var(--accent-text); font-weight: 600; background: var(--accent-soft); }

/* Topics tab */
.fdd-topics { display: flex; flex-direction: column; gap: 8px; }
.fdd-topic-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg3);
  color: var(--t1);
  outline: none;
  box-sizing: border-box;
}
.fdd-topic-input:focus { border-color: var(--accent-border); background: var(--bg); }
.fdd-topic-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  border-radius: 20px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--accent-text);
  margin: 0 4px 4px 0;
}
.fdd-topic-chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--accent-text);
  font-size: 12px;
  padding: 0;
  line-height: 1;
}

/* Languages tab — reuse existing lang-dropdown-* feel */
.fdd-langs { display: flex; flex-direction: column; gap: 4px; }
.fdd-lang-all {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  font-size: 11px;
  color: var(--t2);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  margin-bottom: 4px;
}
.fdd-lang-all:hover { background: var(--bg3); }
.fdd-lang-all.active { background: var(--accent-soft); color: var(--accent-text); border-color: var(--accent-border); }
.fdd-lang-category { margin-bottom: 8px; }
.fdd-lang-cat-header { font-size: 10px; color: var(--t3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.fdd-lang-cat-items { display: flex; flex-wrap: wrap; gap: 3px; }
.fdd-lang-item {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px 7px;
  font-size: 11px;
  color: var(--t2);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.fdd-lang-item:hover { background: var(--bg3); color: var(--t1); }
.fdd-lang-item.active { background: var(--accent-soft); color: var(--accent-text); border-color: var(--accent-border); }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterDropdown.tsx src/styles/globals.css
git commit -m "feat: add FilterDropdown component — unified filter + language popover"
```

---

## Task 6: Rewire `Discover.tsx` — phases 1, 2, 3, 4 integration

**Files:**
- Modify: `src/views/Discover.tsx` (multiple locations)

This task wires everything together. Work through each section in order.

### 6a: Add imports and new state

- [ ] **Step 1: Add new imports at the top of Discover.tsx**

After the existing imports, add:
```typescript
import { LuFilter } from 'react-icons/lu'
import { classifyRepoType, type RepoType } from '../lib/classifyRepoType'
import { REPO_TYPE_CONFIG } from '../config/repoTypeConfig'
import FilterDropdown, { type FilterTab } from '../components/FilterDropdown'
```

- [ ] **Step 2: Remove the `LANGUAGE_CATEGORIES` constant (lines 70-79)**

The constant is being moved into `FilterDropdown.tsx`. Delete lines 70-79 from `Discover.tsx`.

- [ ] **Step 3: Remove `LanguageDropdown` component (lines 118-193)**

Delete the entire `LanguageDropdown` function definition from `Discover.tsx` (lines 118-193). Also remove the `LanguageIcon` import from the top if it's no longer used elsewhere in `Discover.tsx` — check with `grep -n 'LanguageIcon' src/views/Discover.tsx` first.

- [ ] **Step 4: Remove old filter state, add new state**

In the state block (around lines 227-232), remove these three lines:
```typescript
const [showFilters, setShowFilters] = useState(false)
const [stagedFilters, setStagedFilters] = useState<SearchFilters>({})
const [stagedTopicInput, setStagedTopicInput] = useState('')
```

Add new state (after the `appliedFilters` line):
```typescript
const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
const [filterDropdownInitialTab, setFilterDropdownInitialTab] = useState<FilterTab>('activity')
const [activeTypes, setActiveTypes] = useState<Set<RepoType>>(new Set())
const [repoTypes, setRepoTypes] = useState<Map<string, RepoType>>(new Map())
```

### 6b: Fix `handleSearch` to accept `overrideLanguage`

- [ ] **Step 5: Extend `handleSearch` signature**

Find the `handleSearch` function definition (around line 361). Change its signature and add `langFilter` derivation:

```typescript
const handleSearch = async (
  overrideFilters?: SearchFilters,
  overrideQuery?: string,
  overrideLanguage?: string,
) => {
  const filters = overrideFilters ?? appliedFilters
  const q = overrideQuery ?? query
  const langFilter = (overrideLanguage !== undefined ? overrideLanguage : activeLanguage) || undefined
```

Then replace all existing `const langFilter = activeLanguage || undefined` lines inside `handleSearch` with the already-computed `langFilter` variable (there should be one around line 371 and possibly one around line 399 — both should reference the new variable).

### 6c: Fix `loadTrending` to use its `filters` parameter

- [ ] **Step 6: Wire filters into `loadTrending`**

Find `loadTrending` (lines 308-324). Currently line 314 is:
```typescript
const q = buildViewModeQuery(viewMode, activeLanguage, '')
```

Replace with a version that appends filter qualifiers:
```typescript
const baseQ = buildViewModeQuery(viewMode, activeLanguage, '')
const filterParts: string[] = []
if (filters?.activity === 'week')     filterParts.push('pushed:>' + (() => { const d = new Date(); d.setDate(d.getDate() - 7);  return d.toISOString().split('T')[0] })())
if (filters?.activity === 'month')    filterParts.push('pushed:>' + (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })())
if (filters?.activity === 'halfyear') filterParts.push('pushed:>' + (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().split('T')[0] })())
if (filters?.stars)    filterParts.push(`stars:>${filters.stars}`)
if (filters?.license)  filterParts.push(`license:${filters.license}`)
if (filters?.topics?.length) filterParts.push(...filters.topics)
const q = [baseQ, ...filterParts].filter(Boolean).join('+')
```

### 6d: Classify repos on each fetch

- [ ] **Step 7: Batch-update repos + repoTypes after each fetch**

In `loadTrending`, replace:
```typescript
setRepos(data)
```
with:
```typescript
setRepos(data)
setRepoTypes(new Map(data.map(r => [r.id, classifyRepoType(r)])))
```

Do the same in all places in `handleSearch` where `setRepos(res)` is called (there are two: one in the raw branch ~line 376, one after `runTagSearch` resolves — but `runTagSearch` calls `setRepos` internally, so find it there too around lines 350-358).

In `runTagSearch` (lines 346-359), after `setRepos(res)`, add:
```typescript
setRepoTypes(new Map(res.map(r => [r.id, classifyRepoType(r)])))
```

In the raw search branch in `handleSearch`, after `setRepos(res)`, add:
```typescript
setRepoTypes(new Map(res.map(r => [r.id, classifyRepoType(r)])))
```

### 6e: Add `handleFilterChange`

- [ ] **Step 8: Add `handleFilterChange` and remove old filter functions**

Delete `openFilterPanel`, `applyFilters`, and `clearFilters` functions.

Add `handleFilterChange`:
```typescript
function handleFilterChange(newFilters: SearchFilters, newLanguage: string) {
  setAppliedFilters(newFilters)
  setActiveLanguage(newLanguage)
  handleSearch(newFilters, undefined, newLanguage)
}
```

Also remove `activeFilterCount` (lines ~457-462) and `filterPills` / `ActiveFilterPill` JSX — the new badge count replaces the old `activeFilterCount`:
```typescript
const filterBadgeCount =
  (activeLanguage !== '' ? 1 : 0) +
  (appliedFilters.activity ? 1 : 0) +
  (appliedFilters.stars ? 1 : 0) +
  (appliedFilters.license ? 1 : 0) +
  (appliedFilters.topics?.length ? 1 : 0)
```

### 6f: Rebuild the tab row JSX

- [ ] **Step 9: Replace the `.discover-view-row` JSX**

Find the existing tab row + language dropdown (lines ~703-717):
```tsx
{/* View mode tabs + Language dropdown */}
<div className="discover-view-row">
  <div className="discover-view-tabs">
    {VIEW_MODES.map(vm => (...))}
  </div>
  <LanguageDropdown activeLanguage={activeLanguage} onSelect={setActiveLanguage} />
</div>
```

Replace with:
```tsx
{/* Tab row — Zone A | Zone B | Zone C */}
<div className="discover-view-row">
  {/* Zone A: Sort tabs */}
  <div className="discover-view-tabs">
    {VIEW_MODES.map(vm => (
      <button
        key={vm.key}
        className={`view-tab${viewMode === vm.key ? ' active' : ''}`}
        onClick={() => setViewMode(vm.key)}
      >
        {vm.label}
      </button>
    ))}
  </div>

  {/* Zone B: Type filter tabs */}
  <div className="discover-type-tabs">
    {(Object.keys(REPO_TYPE_CONFIG) as RepoType[]).map(type => {
      const cfg = REPO_TYPE_CONFIG[type]
      const isActive = activeTypes.has(type)
      return (
        <button
          key={type}
          className={`type-tab${isActive ? ' active' : ''}`}
          onClick={() => {
            setActiveTypes(prev => {
              const next = new Set(prev)
              if (next.has(type)) next.delete(type)
              else next.add(type)
              return next
            })
          }}
        >
          {cfg.icon && <cfg.icon size={10} />}
          {cfg.label}
        </button>
      )
    })}
  </div>

  {/* Zone C: Filter controls */}
  <div className="discover-zone-c">
    <div className="discover-zone-c-divider" />
    <div style={{ position: 'relative' }}>
      <button
        className={`discover-filter-icon-btn${filterBadgeCount > 0 ? ' has-filters' : ''}`}
        aria-label={filterBadgeCount > 0 ? `Filters (${filterBadgeCount} active)` : 'Filters'}
        onClick={() => setFilterDropdownOpen(o => !o)}
      >
        <LuFilter size={13} />
        {filterBadgeCount > 0 && (
          <span className="filter-badge">{filterBadgeCount}</span>
        )}
      </button>
      <button
        className="discover-lang-btn"
        onClick={() => {
          setFilterDropdownInitialTab('languages')
          setFilterDropdownOpen(o => !o)
        }}
      >
        Languages
      </button>
      {filterDropdownOpen && (
        <FilterDropdown
          initialTab={filterDropdownInitialTab}
          filters={appliedFilters}
          activeLanguage={activeLanguage}
          languages={LANGUAGES}
          onClose={(lastTab) => {
            setFilterDropdownInitialTab(lastTab)  // remember last tab for next open
            setFilterDropdownOpen(false)
          }}
          onChange={handleFilterChange}
        />
      )}
    </div>
  </div>
</div>
```

### 6g: Remove old filter panel JSX and wire `visibleRepos`

- [ ] **Step 10: Remove the slide-down filter panel JSX**

Delete the block `{/* Slide-down filter panel */}` and the existing filter toggle button (`discover-filter-btn`, ~lines 597-611) and the entire `{showFilters && <div className="filter-panel">...}` block (lines 614-666) and the `{/* Active filter pills */}` block (lines 694-701).

- [ ] **Step 11: Wire `visibleRepos` into the repo grid**

Find the grid render (around line 776):
```tsx
{repos.map(repo => (
  <RepoCard
    key={`${repo.owner}/${repo.name}`}
    repo={repo}
    onNavigate={navigateToRepo}
    onTagClick={addTag}
    onOwnerClick={openProfile}
  />
))}
```

Replace with:
```tsx
{repos
  .filter(r => activeTypes.size === 0 || activeTypes.has(repoTypes.get(r.id) ?? 'other'))
  .map(repo => (
    <RepoCard
      key={`${repo.owner}/${repo.name}`}
      repo={repo}
      onNavigate={navigateToRepo}
      onTagClick={addTag}
      onOwnerClick={openProfile}
      repoType={repoTypes.get(repo.id)}
    />
  ))
}
```

Also update the empty state check to use filtered length:
```tsx
{!loading && !error && repos.filter(r => activeTypes.size === 0 || activeTypes.has(repoTypes.get(r.id) ?? 'other')).length === 0 && query.trim() && (
```

- [ ] **Step 12: Verify TypeScript compiles with no errors**

```bash
cd /d/Coding/Git-Suite && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

### 6h: Add missing CSS for Zone B and Zone C

- [ ] **Step 13: Add CSS for new tab row zones**

First, update the **existing** `.discover-view-row` rule in `src/styles/globals.css` (line ~792). Add `gap: 8px` and `flex-wrap: wrap` to it:
```css
.discover-view-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 8px;
  flex-wrap: wrap;
}
```
Do **not** append a second `.discover-view-row` rule — modify the existing one.

Then append the following new rules to `src/styles/globals.css`:

```css
/* Zone B: type filter tabs */
.discover-type-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.type-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: none;
  color: var(--t2);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.type-tab:hover { background: var(--bg3); color: var(--t1); }
.type-tab.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* Zone C: filter icon + languages button */
.discover-zone-c {
  display: flex;
  align-items: center;
  gap: 6px;
}

.discover-zone-c-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
}

.discover-filter-icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--t2);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.discover-filter-icon-btn:hover { background: var(--bg3); color: var(--t1); }
.discover-filter-icon-btn.has-filters { color: var(--accent-text); border-color: var(--accent-border); }

.filter-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
}

.discover-lang-btn {
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--t2);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  white-space: nowrap;
}
.discover-lang-btn:hover { background: var(--bg3); color: var(--t1); }
```

- [ ] **Step 14: Run all tests to confirm nothing is broken**

```bash
cd /d/Coding/Git-Suite && npm test 2>&1 | tail -20
```
Expected: all tests pass (classifier tests + any existing tests).

- [ ] **Step 15: Commit**

```bash
git add src/views/Discover.tsx src/styles/globals.css
git commit -m "feat: Discover view redesign — three-zone tab row, type filter tabs, unified FilterDropdown"
```

---

## Task 7: Clean up dead CSS and unused imports

- [ ] **Step 1: Remove dead CSS classes**

In `src/styles/globals.css`, search for and remove (or leave as-is if still used elsewhere — check with grep first):
- `.discover-filter-btn` and `.discover-filter-btn.has-filters` — replaced by `.discover-filter-icon-btn`
- `.discover-filter-badge` — replaced by `.filter-badge`
- `.filter-panel`, `.filter-panel-body`, `.filter-panel-footer`, `.filter-clear-btn`, `.filter-apply-btn`, `.filter-section`, `.filter-section-label`, `.filter-radio-group`, `.filter-radio-btn`, `.filter-topic-input` — replaced by `fdd-*` equivalents
- `.lang-dropdown-wrap`, `.lang-dropdown-trigger`, `.lang-dropdown-panel`, `.lang-dropdown-all`, `.lang-dropdown-category`, `.lang-dropdown-cat-header`, `.lang-dropdown-cat-items`, `.lang-dropdown-item`, `.lang-dropdown-caret` — no longer used

Check each before deleting:
```bash
grep -n "discover-filter-btn\|lang-dropdown\|filter-panel\|filter-radio\|filter-section\|filter-topic-input\|active-filter-pill" /d/Coding/Git-Suite/src/views/Discover.tsx
```

- [ ] **Step 2: Remove `FilterRadio` and `ActiveFilterPill` sub-components from Discover.tsx**

These are now unused (filter UI moved to `FilterDropdown.tsx`). Delete both function definitions from `Discover.tsx`.

- [ ] **Step 3: Run full test suite**

```bash
cd /d/Coding/Git-Suite && npm test 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 4: Final commit**

```bash
git add src/views/Discover.tsx src/styles/globals.css
git commit -m "chore: remove dead CSS and unused filter sub-components from Discover"
```

---

## Quick Test Checklist (manual verification)

After all tasks complete, start the app and verify:

1. Tab row shows three zones: [Most Popular | Most Forked | Rising] ... [Awesome List | Learning | ...] ... [| ▼ Filters | Languages]
2. Clicking a sort tab changes the loaded repos.
3. Clicking a type tab (e.g. "Tool") filters the grid to only tool repos; clicking again clears it; multiple types work as union.
4. Clicking the funnel icon opens `FilterDropdown` on Activity tab; clicking Languages button opens it on Languages tab.
5. Selecting a language and clicking Apply: grid reloads with the language filter; badge count = 1.
6. Clicking Clear All: badge resets to 0; grid reloads with no filters.
7. Clicking outside the dropdown discards staged changes.
8. Navigating to a repo detail and pressing back: sort tab and text filters restore; type tab resets to empty.
9. Repo cards show left-border accent color per type; type badge appears in card body below tags (not for "other" type).
