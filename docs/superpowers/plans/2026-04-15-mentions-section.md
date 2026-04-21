# Mentions Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract contributor/sponsor/acknowledgment sections from README body into a dedicated Mentions section before References.

**Architecture:** A new `rehypeExtractMentions` rehype plugin walks the HAST tree, identifies acknowledgment headings by regex, splices those sections out, and appends them as a `<section class="rm-mentions">` node at the end of the tree. `rehypeFootnoteLinks` (which runs later) then appends References after it, producing the correct order: content → Mentions → References.

**Tech Stack:** TypeScript, unified/rehype (HAST tree manipulation), CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-15-mentions-section-design.md`

---

### Task 1: Add `rehypeExtractMentions` plugin

**Files:**
- Modify: `src/components/ReadmeRenderer.tsx:131-170` (insert new plugin after `rehypeRemoveTocSection`)

The plugin follows the exact same pattern as `rehypeRemoveTocSection` (lines 131–170): filter `tree.children`, reassign via `(tree as any).children =`, never splice.

- [ ] **Step 1: Write the heading matcher function**

Add this above the existing `rehypeRemoveTocSection` function (around line 131):

```typescript
// ── Rehype plugin: extract acknowledgment sections into Mentions ───
// Identifies headings like "Contributors", "Sponsors", "Backers",
// "Acknowledgments", "Thanks to", "Built with", "Powered by", etc.
// and relocates those sections (heading + content until next heading
// at same/higher level) into a single <section class="rm-mentions">
// appended to the document. Runs after rehype-sanitize and before
// rehypeFootnoteLinks so extracted content still receives footnote,
// image classification, and heading ID treatment.
//
// Uses filter + reassignment (not splice) — same approach as
// rehypeRemoveTocSection for the same unified compatibility reason.
const MENTIONS_HEADINGS = /^(?:(?:code\s+)?contributors?|financial\s+contributors?|sponsors?|backers?|thanks?\s+to|built\s+with|powered\s+by|made\s+by|acknowledg(?:e?ments?|ing)|supporters?|partners?)$/i

function isMentionsHeading(node: unknown): boolean {
  if ((node as any)?.type !== 'element') return false
  const el = node as Element
  if (!/^h[1-6]$/.test(el.tagName)) return false
  const text = extractNodeText(el).trim().toLowerCase().replace(/^[^\w]+/, '').replace(/[^\w]+$/, '').trim()
  return MENTIONS_HEADINGS.test(text)
}
```

- [ ] **Step 2: Write the plugin function**

Add immediately after the heading matcher:

```typescript
function rehypeExtractMentions() {
  return (tree: Root) => {
    const collected: typeof tree.children = []
    let inMention = false
    let mentionLevel = 0

    ;(tree as any).children = tree.children.filter((node: any) => {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
        const level = parseInt(node.tagName[1])
        if (isMentionsHeading(node)) {
          inMention = true
          mentionLevel = level
          collected.push(node)
          return false
        }
        if (inMention && level <= mentionLevel) {
          inMention = false
          return true
        }
      }
      if (inMention) {
        collected.push(node)
        return false
      }
      return true
    })

    if (collected.length === 0) return

    const section: Element = {
      type: 'element',
      tagName: 'section',
      properties: { className: ['rm-mentions'] },
      children: [
        {
          type: 'element',
          tagName: 'h2',
          properties: { className: ['rm-mentions-heading'], id: 'mentions' },
          children: [{ type: 'text', value: 'Mentions' }],
        },
        ...collected,
      ],
    }
    tree.children.push(section)
  }
}
```

- [ ] **Step 3: Add plugin to the rehypePlugins array**

In the `<ReactMarkdown>` element (line 1489), insert `rehypeExtractMentions` after `rehypeRemoveTocSection`:

```typescript
// Before:
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeImageClassifier, ...]}

// After:
rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeRemoveTocSection, rehypeExtractMentions, rehypeImageClassifier, ...]}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/ReadmeRenderer.tsx
git commit -m "feat: add rehypeExtractMentions plugin to relocate acknowledgment sections"
```

---

### Task 2: Update TTS to skip Mentions section

**Files:**
- Modify: `src/utils/rehypeTtsAnnotate.ts:75`

- [ ] **Step 1: Write the failing test**

Add to `src/utils/rehypeTtsAnnotate.test.ts`, inside the existing `describe` block:

```typescript
it('skips content under a Mentions heading', () => {
  const { output } = process('<h2>Intro</h2><p>Hello.</p><h2>Mentions</h2><p>Contributor stuff.</p><h2>Next</h2><p>More.</p>')
  expect(output.sentences.map(s => s.text)).toEqual(['Hello.', 'More.'])
  expect(output.sections).toEqual([
    { headingText: 'Intro', sentenceIndex: 0 },
    { headingText: 'Next', sentenceIndex: 1 },
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/rehypeTtsAnnotate.test.ts`
Expected: FAIL — "Mentions" section content is not skipped, so sentences include "Contributor stuff."

- [ ] **Step 3: Update SKIP_SECTION_HEADINGS regex**

In `src/utils/rehypeTtsAnnotate.ts` line 75, add `mentions` to the pattern:

```typescript
// Before:
const SKIP_SECTION_HEADINGS = /^to[\s-]?do(?:\s+list)?$/i

// After:
const SKIP_SECTION_HEADINGS = /^to[\s-]?do(?:\s+list)?|mentions$/i
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/rehypeTtsAnnotate.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/rehypeTtsAnnotate.ts src/utils/rehypeTtsAnnotate.test.ts
git commit -m "feat: skip Mentions section in TTS annotation"
```

---

### Task 3: Add CSS for Mentions section

**Files:**
- Modify: `src/styles/globals.css:3587-3601` (insert before `.rm-references` block)

- [ ] **Step 1: Add `.rm-mentions` styles**

Insert immediately before the `.rm-references` block (line 3587):

```css
/* ── Mentions section (relocated contributor/sponsor content) ── */
.rm-mentions {
  margin-top: 36px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.rm-mentions-heading {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--t2);
  margin: 0 0 12px 0;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
```

This mirrors the `.rm-references` / `.rm-references-heading` styles at lines 3588–3601 exactly.

- [ ] **Step 2: Remove top margin from .rm-references when preceded by .rm-mentions**

When Mentions is present, References follows immediately after. The double top-border would look odd, so collapse the gap:

```css
.rm-mentions + .rm-references {
  margin-top: 24px;
  border-top: none;
  padding-top: 0;
}
```

Add this right after the `.rm-mentions-heading` block.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add Mentions section CSS styling"
```

---

### Task 4: Add integration test for ReadmeRenderer

**Files:**
- Modify: `src/components/ReadmeRenderer.test.tsx`

- [ ] **Step 1: Add test for Mentions section extraction**

Add a new `describe` block at the end of the test file:

```typescript
describe('mentions section extraction', () => {
  it('extracts a Contributors heading and its content into rm-mentions section', () => {
    const md = '## Intro\n\nHello world.\n\n## Contributors\n\nThanks to all contributors.\n\n## License\n\nMIT'
    const { container } = render(
      <MemoryRouter><ReadmeRenderer content={md} repoOwner="test" repoName="test" basePath="" /></MemoryRouter>
    )
    // Mentions section exists with the extracted content
    const mentions = container.querySelector('.rm-mentions')
    expect(mentions).not.toBeNull()
    expect(mentions!.querySelector('.rm-mentions-heading')?.textContent).toBe('Mentions')
    expect(mentions!.textContent).toContain('Thanks to all contributors')

    // The Contributors heading lives inside .rm-mentions, not in the main content flow.
    // Query h2s outside the mentions section to verify extraction.
    const rmContent = container.querySelector('.rm-content')!
    const mainH2s = Array.from(rmContent.querySelectorAll('h2:not(.rm-mentions h2)')).map(h => h.textContent)
    expect(mainH2s).not.toContain('Contributors')
    // But non-mention headings are preserved
    expect(mainH2s).toContain('Intro')
    expect(mainH2s).toContain('License')
  })

  it('does not create rm-mentions section when no acknowledgment headings exist', () => {
    const md = '## Intro\n\nHello world.\n\n## License\n\nMIT'
    const { container } = render(
      <MemoryRouter><ReadmeRenderer content={md} repoOwner="test" repoName="test" basePath="" /></MemoryRouter>
    )
    expect(container.querySelector('.rm-mentions')).toBeNull()
  })

  it('extracts multiple acknowledgment sections into a single Mentions block', () => {
    const md = '## Intro\n\nHello.\n\n## Sponsors\n\nSponsor list.\n\n## Backers\n\nBacker list.\n\n## License\n\nMIT'
    const { container } = render(
      <MemoryRouter><ReadmeRenderer content={md} repoOwner="test" repoName="test" basePath="" /></MemoryRouter>
    )
    const mentions = container.querySelector('.rm-mentions')
    expect(mentions).not.toBeNull()
    expect(mentions!.textContent).toContain('Sponsor list')
    expect(mentions!.textContent).toContain('Backer list')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/components/ReadmeRenderer.test.tsx`
Expected: All tests PASS (these are integration tests — the plugin is already implemented from Task 1)

- [ ] **Step 3: Commit**

```bash
git add src/components/ReadmeRenderer.test.tsx
git commit -m "test: add integration tests for Mentions section extraction"
```
