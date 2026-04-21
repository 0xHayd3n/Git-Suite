# Glass Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply consistent glassmorphism styling to four navigation/toolbar bars and their dropdown panels.

**Architecture:** Define a shared `.glass` CSS utility class once, then apply its properties to six existing selectors in `globals.css`. CSS-only changes — zero JSX modifications.

**Tech Stack:** Vanilla CSS with `backdrop-filter`

**Spec:** `docs/superpowers/specs/2026-04-09-glass-bars-design.md`

---

## File Structure

All changes happen in a single file:

- **Modify:** `src/styles/globals.css` — add `.glass` utility class and update 6 existing selectors

---

### Task 1: Add the `.glass` utility class

**Files:**
- Modify: `src/styles/globals.css:63` (after the design tokens `:root` block)

- [ ] **Step 1: Add the `.glass` class after the `:root` closing brace**

Insert after line 63 (`}` closing `:root`):

```css
/* ── Glass utility ── */
.glass {
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-color: rgba(255, 255, 255, 0.10);
}
```

- [ ] **Step 2: Verify the file parses correctly**

Run: `npx stylelint src/styles/globals.css --fix 2>/dev/null || echo "no stylelint, check manually"`

If no linter is configured, visually confirm the block is well-formed.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: add .glass utility class for glassmorphism bars"
```

---

### Task 2: Apply glass to dropdown panels

These are `position: absolute` panels where `backdrop-filter` blur is fully visible.

**Files:**
- Modify: `src/styles/globals.css:8146` (`.bnav-panel`)
- Modify: `src/styles/globals.css:8046` (`.btb-mega-panel`)
- Modify: `src/styles/globals.css:2308` (`.view-mode-bar__sort-dropdown`)

- [ ] **Step 1: Update `.bnav-panel` (line 8146)**

Replace:
```css
  background: var(--bg2);
  border: 1px solid var(--border);
```

With:
```css
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.10);
```

- [ ] **Step 2: Update `.btb-mega-panel` (line 8046)**

Replace:
```css
  background: var(--bg2);
  border: 1px solid var(--border);
```

With:
```css
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.10);
```

- [ ] **Step 3: Update `.view-mode-bar__sort-dropdown` (line 2308)**

Replace:
```css
  background: var(--bg2);
  border: 1px solid var(--border);
```

With:
```css
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.10);
```

- [ ] **Step 4: Visually verify dropdowns in the app**

Run: `npm run dev` (or equivalent)

Open the app, hover over the BucketNav tabs to trigger the dropdown panel. Check that:
1. The panel background is translucent, not solid
2. Content behind the panel is blurred
3. Text inside the panel is still readable
4. The BucketTabBar mega-menu and ViewModeBar sort dropdown look the same

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: apply glass styling to dropdown panels"
```

---

### Task 3: Apply glass to inline bars

These bars are in normal document flow. The glass treatment gives them a consistent translucent background tint.

**Files:**
- Modify: `src/styles/globals.css:1920` (`.breadcrumb-bar`)
- Modify: `src/styles/globals.css:2229` (`.view-mode-bar`)
- Modify: `src/styles/globals.css:7288` (`.discover-filter-row`)

- [ ] **Step 1: Update `.breadcrumb-bar` (line 1920)**

Add these properties to the existing rule (which has no background currently):

```css
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
```

And change the existing border from:
```css
  border-bottom: 1px solid var(--border);
```
To:
```css
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
```

- [ ] **Step 2: Update `.view-mode-bar` (line 2229)**

Add these properties to the existing rule (which has no background currently):

```css
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
```

And change the existing border from:
```css
  border-bottom: 1px solid var(--border);
```
To:
```css
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
```

- [ ] **Step 3: Update `.discover-filter-row` (line 7288)**

Add these properties to the existing rule (which has no background currently):

```css
  background: rgba(26, 26, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
```

And change the existing border from:
```css
  border-bottom: 1px solid var(--border);
```
To:
```css
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
```

- [ ] **Step 4: Visually verify inline bars in the app**

Open the app and check:
1. BreadcrumbBar has a subtle translucent tint
2. ViewModeBar has a subtle translucent tint
3. Discover filter row has a subtle translucent tint
4. Text and controls on all bars remain fully readable
5. Borders are slightly lighter than before (rgba white 10% vs 7%)

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: apply glass styling to inline navigation bars"
```
