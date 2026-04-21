# Scanned Components in Skill Generation

## Problem

The components skill file generator (`buildComponentsPrompt()` in `skill-gen.ts`) only passes the README to the AI and asks it to document components it can find there. Many component libraries (e.g. material-ui) have READMEs that are high-level introductions with no individual component documentation. The AI correctly reports it cannot find any components.

Meanwhile, the component scanner (`componentScanner.ts`) successfully discovers and fetches component source files from the repo, and the component parser (`componentParser.ts`) extracts names and props. This data is used for the Components tab UI but is never passed to skill generation.

## Solution

Feed scanned component metadata (names + props) into the components skill generation prompt so the AI has concrete data to document.

## Changes

### 1. Extend `SkillGenInput` (`electron/skill-gen.ts`)

Add an optional field:

```typescript
scannedComponents?: { name: string; props: { name: string; type: string; required: boolean; defaultValue?: string }[] }[]
```

### 2. Update `buildComponentsPrompt()` (`electron/skill-gen.ts`)

When `scannedComponents` is present and non-empty, inject a structured metadata block into the prompt:

```
SCANNED COMPONENTS (from source code analysis):
- Accordion: expanded (boolean, required), onChange (function, optional), disabled (boolean, optional)
- Alert: severity (string, required), variant (string, optional), onClose (function, optional)
...
```

Change the instruction from "Document all components you can identify from the README" to "Document all components listed below. Use the README for general context and the scanned data for component names and props."

When `scannedComponents` is empty or undefined, fall back to the current README-only behavior.

### 3. Remove component cap (`electron/componentScanner.ts`)

Remove `.slice(0, 50)` on line 62. The existing `batchFetch` with batch size 10 handles large repos. No other scanner changes needed.

Note: Authenticated GitHub API allows 5,000 requests/hr. Even a large monorepo with 500+ component files is well within limits for a single scan operation. Unauthenticated requests (60/hr) could hit limits, but the app requires authentication for most features anyway.

### 4. Wire scanner into skill generation (`electron/main.ts`)

In the `skill:generate` IPC handler, when `isComponents` is true:

1. Extend the existing SELECT query to also fetch `default_branch` from the `repos` table (fall back to `'main'`)
2. Call `scanComponents(owner, name, defaultBranch)`
3. Run each `ScannedComponent` through `parseComponent(path, source, framework)` — note the three required arguments: `path` and `source` come from `ScannedComponent`, `framework` comes from `ComponentScanResult.framework`
4. Attach the result to `skillInput.scannedComponents`

If `scanComponents()` or parsing fails (network errors, etc.), catch the error and proceed with `scannedComponents` as undefined — falling back to README-only behavior. Scanner failure should not block skill generation.

The existing generation call chain (`generateComponentsSkillViaLocalCLI` / `generateComponentsSkill`) picks up the new field automatically via the updated prompt builder.

The master skill prompt (`buildPrompt`) and `COMPONENT_PROMPT_APPEND` are unchanged — only the components sub-skill prompt (`buildComponentsPrompt`) uses scanned data. The master skill's component handling (enabled component list in `[CORE]`/`[EXTENDED]`/`[DEEP]` sections) remains independent.

Note: `parseComponent` lives in `src/utils/componentParser.ts` (renderer source tree), but importing from `../src/utils/` in the main process is already established by `componentScanner.ts` importing from `../src/utils/componentScanner`.

## Prompt size

With hundreds of components at ~60 chars per prop line and 3-5 props each, the component metadata block is ~10-20KB — well within Haiku's context limits alongside the 12KB truncated README.

Components with no extracted props are still included by name so the AI can document them from training knowledge.

## Files touched

| File | Change |
|------|--------|
| `electron/skill-gen.ts` | Add `scannedComponents` to `SkillGenInput`, update `buildComponentsPrompt()` |
| `electron/componentScanner.ts` | Remove `.slice(0, 50)` cap |
| `electron/main.ts` | Wire scanner + parser into `skill:generate` handler, extend SELECT to include `default_branch` |

No new files, no DB schema changes, no new IPC channels.
