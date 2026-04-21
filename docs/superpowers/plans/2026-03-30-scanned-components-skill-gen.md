# Scanned Components in Skill Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed scanned component metadata (names + props) into the components skill generation prompt so the AI can document components even when the README doesn't list them.

**Architecture:** The component scanner already fetches source files and the parser extracts names/props. We extend `SkillGenInput` with a `scannedComponents` field, update `buildComponentsPrompt()` to inject that data, remove the 50-component cap, and wire the scanner into the `skill:generate` IPC handler.

**Tech Stack:** TypeScript, Electron IPC, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-scanned-components-skill-gen-design.md`

---

### Task 1: Add `scannedComponents` to `SkillGenInput`

**Files:**
- Modify: `electron/skill-gen.ts:6-15`

- [ ] **Step 1: Add the field to the interface**

In `electron/skill-gen.ts`, add `scannedComponents` to the `SkillGenInput` interface:

```typescript
export interface SkillGenInput {
  owner: string
  name: string
  language: string
  topics: string[]
  readme: string       // raw markdown, may be empty string
  version: string      // from latest release tag, or 'unknown'
  isComponents?: boolean
  enabledComponents?: string[]
  scannedComponents?: { name: string; props: { name: string; type: string; required: boolean; defaultValue?: string }[] }[]
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run electron/skill-gen.test.ts`
Expected: All 7 tests PASS (no breaking change — field is optional)

- [ ] **Step 3: Commit**

```bash
git add electron/skill-gen.ts
git commit -m "feat: add scannedComponents field to SkillGenInput"
```

---

### Task 2: Update `buildComponentsPrompt()` to use scanned data

**Files:**
- Modify: `electron/skill-gen.ts:98-143`
- Test: `electron/skill-gen.test.ts`

- [ ] **Step 1: Write failing test — prompt includes scanned component data**

First, update the import on line 2 of `electron/skill-gen.test.ts` from:

```typescript
import { generateSkill, type SkillGenInput } from './skill-gen'
```

to:

```typescript
import { generateSkill, generateComponentsSkill, type SkillGenInput } from './skill-gen'
```

Then add the new describe block at the end of the file:

```typescript
describe('generateComponentsSkill', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('includes scanned component names and props in prompt', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      {
        ...baseInput,
        isComponents: true,
        scannedComponents: [
          { name: 'Button', props: [{ name: 'disabled', type: 'boolean', required: false }] },
          { name: 'Alert', props: [{ name: 'severity', type: 'string', required: true }] },
        ],
      },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('SCANNED COMPONENTS')
    expect(prompt).toContain('Button')
    expect(prompt).toContain('disabled (boolean, optional)')
    expect(prompt).toContain('Alert')
    expect(prompt).toContain('severity (string, required)')
  })

  it('includes defaultValue when present', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      {
        ...baseInput,
        isComponents: true,
        scannedComponents: [
          { name: 'Toggle', props: [{ name: 'active', type: 'boolean', required: false, defaultValue: 'false' }] },
        ],
      },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('active (boolean, optional, default: false)')
  })

  it('falls back to README-only when scannedComponents is empty', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      { ...baseInput, isComponents: true, scannedComponents: [] },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('SCANNED COMPONENTS')
    expect(prompt).toContain('Document all components you can identify from the README')
  })

  it('falls back to README-only when scannedComponents is undefined', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill({ ...baseInput, isComponents: true }, 'sk-ant-test')
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('SCANNED COMPONENTS')
    expect(prompt).toContain('Document all components you can identify from the README')
  })

  it('lists components with no props by name only', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      {
        ...baseInput,
        isComponents: true,
        scannedComponents: [{ name: 'Divider', props: [] }],
      },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('- Divider: (no props extracted)')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/skill-gen.test.ts`
Expected: FAIL — the new tests fail because `buildComponentsPrompt` doesn't use `scannedComponents` yet

- [ ] **Step 3: Implement `buildComponentsPrompt()` changes**

In `electron/skill-gen.ts`, replace the `buildComponentsPrompt` function:

```typescript
function formatScannedComponents(components: NonNullable<SkillGenInput['scannedComponents']>): string {
  return components.map(c => {
    if (c.props.length === 0) return `- ${c.name}: (no props extracted)`
    const propList = c.props.map(p => {
      let desc = `${p.name} (${p.type}, ${p.required ? 'required' : 'optional'}`
      if (p.defaultValue) desc += `, default: ${p.defaultValue}`
      desc += ')'
      return desc
    }).join(', ')
    return `- ${c.name}: ${propList}`
  }).join('\n')
}

function buildComponentsPrompt(input: SkillGenInput): string {
  const readmeTruncated = input.readme.slice(0, 12000)
  const hasScanned = input.scannedComponents && input.scannedComponents.length > 0

  let componentSection: string
  if (hasScanned) {
    const scannedBlock = formatScannedComponents(input.scannedComponents!)
    componentSection = `SCANNED COMPONENTS (from source code analysis):
${scannedBlock}

Document all components listed above. Use the README for general context (package name, import paths, design system) and the scanned data for component names and props.`
  } else {
    componentSection = input.enabledComponents && input.enabledComponents.length > 0
      ? `Only document these components: ${input.enabledComponents.join(', ')}.`
      : 'Document all components you can identify from the README.'
  }

  return `Generate a components skill file for the GitHub repository "${input.owner}/${input.name}".

Language: ${input.language}
Version: ${input.version}

README:
${readmeTruncated}

${componentSection}

Produce a components.skill.md file using this exact format:

## [COMPONENTS]

One sentence describing what this component library provides and its design system (e.g. Material Design, Radix primitives, headless, etc.).

Then for each component, use this structure:

### ComponentName
**Import:** \`import { ComponentName } from 'package-name'\`
**Props:** (list key props as: \`propName\` — type — default — description)
**Variants:** variant1 | variant2 | variant3 (omit if not applicable)
**Example:**
\`\`\`tsx
<ComponentName prop="value" onEvent={handler} />
\`\`\`
**Gotcha:** one-line gotcha if there is a common mistake (omit if none)

---

Rules:
- Write for an AI coding assistant — optimise for fast, accurate component usage
- Include ONLY components documented in the README or listed in the scanned data above — do not invent components
- Key props only (3–6 per component) — skip internal/rarely-used props
- Prefer real prop names from the scanned data or README over guessed names
- Do not include URLs unless they appear verbatim in the README
- Group related components under a #### Category heading (e.g. #### Form & Input)
- Start immediately with ## [COMPONENTS] on its own line — no preamble
- Do not use any tools — output the skill file text directly.`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/skill-gen.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/skill-gen.ts electron/skill-gen.test.ts
git commit -m "feat: inject scanned component metadata into components skill prompt"
```

---

### Task 3: Remove the 50-component cap

**Files:**
- Modify: `electron/componentScanner.ts:59-62`
- Test: `src/utils/componentScanner.test.ts`

- [ ] **Step 1: Check existing componentScanner tests**

Run: `npx vitest run src/utils/componentScanner.test.ts`
Expected: PASS (baseline)

- [ ] **Step 2: Remove `.slice(0, 50)`**

In `electron/componentScanner.ts`, change line 59-62 from:

```typescript
    // 4. Filter to component files, cap at 50
    const candidates = filePaths
      .filter(p => isComponentFile(p, framework))
      .slice(0, 50)
```

to:

```typescript
    // 4. Filter to component files
    const candidates = filePaths
      .filter(p => isComponentFile(p, framework))
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `npx vitest run src/utils/componentScanner.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/componentScanner.ts
git commit -m "feat: remove 50-component cap from scanner"
```

---

### Task 4: Wire scanner into `skill:generate` IPC handler

**Files:**
- Modify: `electron/main.ts:712-737`

- [ ] **Step 1: Add all required imports**

At the top of `electron/main.ts`, add the `parseComponent` import:

```typescript
import { parseComponent } from '../src/utils/componentParser'
```

Update the existing `componentScanner` import to also export `scanComponents`:

```typescript
import { registerComponentsIPC, scanComponents } from './componentScanner'
```

Update the existing `skill-gen` import to include the `SkillGenInput` type (it is NOT currently imported):

```typescript
import { generateSkillViaLocalCLI, generateComponentsSkillViaLocalCLI, generateSkill, generateComponentsSkill, type SkillGenInput, /* ...keep existing imports... */ } from './skill-gen'
```

- [ ] **Step 2: Extend the SELECT query to include `default_branch`**

In `electron/main.ts`, change the SELECT at line 721 from:

```typescript
  const repo = db.prepare('SELECT id, language, topics FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { id: string; language: string | null; topics: string | null } | undefined
```

to:

```typescript
  const repo = db.prepare('SELECT id, language, topics, default_branch FROM repos WHERE owner = ? AND name = ?').get(owner, name) as
    { id: string; language: string | null; topics: string | null; default_branch: string | null } | undefined
```

- [ ] **Step 3: Add scanner + parser wiring before `skillInput`**

After the `isComponents` detection block (after line 735), add:

```typescript
  // Scan and parse components for the skill generation prompt
  let scannedComponents: SkillGenInput['scannedComponents']
  if (isComponents) {
    try {
      const branch = repo.default_branch ?? 'main'
      const scanResult = await scanComponents(owner, name, branch)
      scannedComponents = scanResult.components.map(c =>
        parseComponent(c.path, c.source, scanResult.framework)
      ).map(pc => ({
        name: pc.name,
        props: pc.props.map(p => ({
          name: p.name,
          type: p.type,
          required: p.required,
          ...(p.defaultValue !== undefined ? { defaultValue: p.defaultValue } : {}),
        })),
      }))
    } catch (err) {
      console.error('[skill-gen] Component scan failed, falling back to README-only:', err)
    }
  }
```

- [ ] **Step 4: Add `scannedComponents` to `skillInput`**

Change the `skillInput` line from:

```typescript
  const skillInput = { owner, name, language, topics, readme, version, isComponents, enabledComponents: options?.enabledComponents }
```

to:

```typescript
  const skillInput = { owner, name, language, topics, readme, version, isComponents, enabledComponents: options?.enabledComponents, scannedComponents }
```

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire component scanner into skill generation for richer prompts"
```
