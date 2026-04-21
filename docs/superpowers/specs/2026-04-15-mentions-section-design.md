# Mentions Section — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Problem

GitHub READMEs often contain contributor grids, sponsor badges, backer counts, acknowledgment sections, and similar "credit" content. This content clutters the main README body and isn't part of the core documentation. Currently it renders inline with everything else.

## Solution

Extract acknowledgment-type sections from the README body and relocate them into a dedicated **Mentions** section that appears between the main content and the References section. The original content is preserved as-is — just moved.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | All acknowledgment sections | Contributors, sponsors, backers, thanks to, built with, powered by, acknowledgments, supporters, partners |
| Presentation | Preserve original content | Relocated, not reformatted — contributor grids, badges, etc. render as the author intended |
| Placement | Before References, same level | Page order: README content → Mentions → References |
| Collapsibility | Always expanded | Content is visible without interaction |
| Sidebar nav | Yes | "Mentions" appears in the "On this page" TOC sidebar |
| Approach | New rehype plugin | Follows the existing codebase pattern (rehypeRemoveTocSection, rehypeFootnoteLinks) |

## Technical Design

### Heading Detection

A regex pattern identifies acknowledgment-type headings:

```
/^(code\s+)?contributors?|financial\s+contributors?|sponsors?|backers?|thanks?\s+to|built\s+with|powered\s+by|made\s+by|acknowledg(e?ments?|ing)|supporters?|partners?$/i
```

This is applied to the extracted text content of heading elements (h1–h6), trimmed and lowercased.

### Plugin: `rehypeExtractMentions`

A new rehype plugin function defined in `ReadmeRenderer.tsx` (colocated with the other plugins). Behavior:

1. Walk the tree's top-level `children` array
2. When a heading matches the acknowledgment pattern, collect that heading + all subsequent siblings until the next heading at the same or higher level
3. Remove collected nodes from their original positions
4. If any nodes were collected, wrap them in:
   ```html
   <section class="rm-mentions">
     <h2 class="rm-mentions-heading" id="mentions">Mentions</h2>
     <!-- collected nodes here -->
   </section>
   ```
5. Append the section to `tree.children` (at the end)

The plugin uses a filter-and-collect approach (like `rehypeRemoveTocSection`) rather than splice, since unified reconstructs child array references between passes.

### Pipeline Ordering

```
rehypeRaw
→ rehypeSanitize
→ rehypeRemoveTocSection
→ rehypeExtractMentions        ← NEW
→ rehypeImageClassifier
→ rehypeAddHeadingIds
→ rehypeYouTubeLinks
→ rehypeGitHubRepoLinks
→ rehypeBlobLinks
→ rehypeFootnoteLinks          ← appends References after Mentions
→ rehypeImageOnlyLinks
→ rehypeTtsAnnotate
```

Positioning after ToC removal and before everything else ensures:
- Extracted content still receives image classification, heading IDs, footnote conversion, YouTube/GitHub link tagging, and blob link detection
- The "Mentions" h2 gets a slug ID from `rehypeAddHeadingIds`, making it appear in the TOC sidebar automatically
- `rehypeFootnoteLinks` appends References after Mentions, producing the correct page order

### TTS Integration

Add `mentions` to the `SKIP_SECTION_HEADINGS` regex in `rehypeTtsAnnotate.ts` so TTS does not read relocated contributor/sponsor content aloud:

```typescript
// Before:
const SKIP_SECTION_HEADINGS = /^to[\s-]?do(?:\s+list)?$/i

// After:
const SKIP_SECTION_HEADINGS = /^to[\s-]?do(?:\s+list)?|mentions$/i
```

### CSS Styling

Add `.rm-mentions` styles to `globals.css`, mirroring the existing `.rm-references` section styling:

- Top border/divider for visual separation from main content
- `.rm-mentions-heading` styled consistently with `.rm-references-heading`
- Inner content inherits standard `readme-body` styles (no special treatment needed)

## Files Changed

| File | Change |
|------|--------|
| `src/components/ReadmeRenderer.tsx` | Add `rehypeExtractMentions` plugin (~40-50 lines); insert in rehypePlugins array after `rehypeRemoveTocSection` |
| `src/utils/rehypeTtsAnnotate.ts` | Add `mentions` to `SKIP_SECTION_HEADINGS` regex |
| `src/styles/globals.css` | Add `.rm-mentions` and `.rm-mentions-heading` styles |
