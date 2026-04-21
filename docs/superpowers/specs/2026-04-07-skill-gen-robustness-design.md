# Skill Generation Robustness Improvements

**Date:** 2026-04-07
**Status:** Approved

## Problem

The skill generation pipeline has three areas of brittleness:

1. **Regex-based TOML parsing** — `parseCargoToml()` and `parsePyprojectToml()` use regex to extract fields from TOML files. This fails on escaped strings, multiline values, arrays of tables, and complex nested structures common in real-world Rust and Python projects.

2. **Hallucinated API references go uncorrected** — The validator detects function names (`foo()`) and CLI flags (`--bar`) that aren't in extraction data, but only emits warnings. Users can receive skills referencing fabricated APIs.

3. **No extraction caching** — Every `generate()` and `enhance()` call re-fetches the file tree, manifest, classification, and extraction from GitHub, even for the same repo within the same session.

## Design

### 1. Replace Regex TOML Parsing with `smol-toml`

**Files changed:** `manifest-parser.ts`, `package.json`

**Approach:**
- Install `smol-toml` (14KB, zero deps, TOML spec-compliant)
- Replace `parseCargoToml()` internals: call `parse(content)` from smol-toml, navigate the resulting object tree for `package.name`, `package.version`, `package.edition`, `package.description`, and `bin` entries
- Replace `parsePyprojectToml()` internals: call `parse(content)`, access `project.name`, `project.version`, `project.description`, `project.requires-python`, and `project.scripts`
- Preserve existing fallback: if `parse()` throws, log the error for debugging and return `{ ecosystem: 'unknown', rawManifest: content }`
- `rawManifest` continues to hold the original string content (not the parsed object) — it's used downstream in template building
- No changes to `parsePackageJson` (JSON.parse is fine), `parseGoMod` (line-oriented regex is appropriate), or `parseSetupPy` (simple string matching is adequate)

**What this fixes:**
- Escaped strings in TOML values
- Multiline strings (triple-quoted)
- Arrays of tables (`[[bin]]` with multiple entries)
- Nested tables and inline tables
- Comments interspersed with values
- Non-standard whitespace

### 2. Promote Hallucination Detection to Auto-Fix

**Files changed:** `validator.ts`

**Approach — Export verification (existing check 4):**
- When `foo()` appears outside code blocks and is not in `extraction.exports`, auto-remove the containing markdown unit
- For bullet lines (`- ...` or `* ...`): remove the entire bullet item
- For prose lines: remove the entire line (not sentence-level — sentence boundary detection is too fragile with version numbers, file paths, and abbreviations in markdown text)
- Increment `autoFixes` counter
- Also retain a warning for visibility

**Approach — Command verification (existing check 5):**
- Same stripping logic for `--flag` references not in `extraction.commands`
- Remove the containing bullet or line

**Safeguards:**
- Only auto-strip when extraction data is non-empty (empty extraction means extraction may have failed — can't verify against nothing)
- Minimum threshold: require 5+ exports or 5+ commands before auto-stripping (sparse extraction is not authoritative enough — small utility libraries may only expose 3-4 exports and the extractor could miss re-exports)
- Never strip inside code blocks (already excluded by `getTextOutsideCodeBlocks`)
- Collapse excess newlines after stripping (reuse existing `\n{3,}` → `\n\n` pattern)

### 3. In-Memory Extraction Cache

**New file:** `electron/skill-gen/extraction-cache.ts`

**Cache structure:**
```
Key:    "${owner}/${name}@${defaultBranch}"
Value:  { extraction: ExtractionResult, repoType: RepoType, timestamp: number }
TTL:    10 minutes
Max:    50 entries (LRU eviction on insert when full)
```

**Implementation:**
- Plain `Map<string, CacheEntry>` with FIFO eviction (Map iteration order is insertion order, not access order — true LRU would require delete-and-reinsert on read, which isn't worth the complexity for a 50-entry cache)
- `get(key)`: return value if exists and `Date.now() - timestamp < TTL`, else delete and return null
- `set(key, value)`: if map size >= 50, delete the oldest entry (first key via iterator); insert with current timestamp
- `clear()`: exposed for testing or manual invalidation

**Pipeline integration (`pipeline.ts`):**
- Extract the shared extraction logic (steps 1–4) from `generate()` and `enhance()` into a `getOrExtract(input)` helper
- `getOrExtract` must preserve the existing `token` guard — only run extraction when `token` is truthy; return default empty extraction otherwise
- `getOrExtract` checks cache first; on miss, runs extraction and caches result
- Both `generate()` and `enhance()` call `getOrExtract()` instead of duplicating extraction code

**Trade-off:** If a user re-generates after pushing new commits to the same branch, the cache may serve stale data for up to 10 minutes. This is acceptable — re-generation within a single session is rare, and the `clear()` method is available if needed.

## Files Summary

| File | Change |
|------|--------|
| `package.json` | Add `smol-toml` dependency |
| `electron/skill-gen/manifest-parser.ts` | Replace regex TOML parsing with `smol-toml` |
| `electron/skill-gen/validator.ts` | Promote export/command checks to auto-fix with stripping |
| `electron/skill-gen/extraction-cache.ts` | New — in-memory LRU cache |
| `electron/skill-gen/pipeline.ts` | Add cache integration, extract shared `getOrExtract()` helper |

## Testing

| Change | Tests |
|--------|-------|
| TOML parsing | Unit tests with complex TOML fixtures: escaped strings, multiline values, multiple `[[bin]]` entries, inline tables, comments. Verify fallback on malformed input. |
| Auto-fix stripping | Unit tests: bullet removal, line removal, safeguard thresholds (verify no stripping when exports < 5), code-block exclusion, newline collapse. |
| Extraction cache | Unit tests: TTL expiry, capacity eviction at 50 entries, `clear()`, `getOrExtract` with/without token. |

## Out of Scope

- Persistent (SQLite) caching — not needed; in-memory with 10min TTL is sufficient
- AST-based export parsing (replacing regex `.d.ts` parsing) — separate improvement
- UI surfacing of validation warnings — separate concern
