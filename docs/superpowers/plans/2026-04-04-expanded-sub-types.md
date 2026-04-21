# Expanded Sub-Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 39 new sub-types across all 8 existing buckets (50 → 89 total) with full classifier coverage.

**Architecture:** Each bucket gets new sub-type entries in `repoTypes.ts`, icon mappings in `bucketIcons.ts`, and classifier rules (topic/name/description) in `classifyRepoType.ts`. Tests are written first (TDD). The classifier's bucket check order is reordered so Editors is checked before Dev Tools (required for API three-way split).

**Tech Stack:** TypeScript, Vitest, Lucide React icons

**Spec:** `docs/superpowers/specs/2026-04-04-expanded-sub-types-design.md`

---

### Task 1: Reorder classifier bucket checks — Editors before Dev Tools

The existing classifier checks Dev Tools topics before Editors. The API three-way split requires Editors' `api-client-app` to be checked before Dev Tools' `api-tool`. Move the entire Editors topic block above the Dev Tools topic block.

**Files:**
- Modify: `src/lib/classifyRepoType.ts:86-116` (swap Editors and Dev Tools topic blocks)

- [ ] **Step 1: Move Editors topic block above Dev Tools topic block**

In `classifyRepoType.ts`, cut the entire Editors topic section (lines 103-116, from `// Editors` through the `design-tool` check) and paste it above the Dev Tools section (before line 86 `// Dev Tools`). The new order in the topic phase becomes: AI & ML → Learning → Frameworks → Language Projects → **Editors → Dev Tools** → Infrastructure → Utilities.

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: All existing tests PASS (reordering does not change behavior since Editors and Dev Tools have no overlapping topic keywords currently).

- [ ] **Step 3: Commit**

```bash
git add src/lib/classifyRepoType.ts
git commit -m "refactor: reorder classifier — check Editors before Dev Tools topics"
```

---

### Task 2: AI & ML — 5 new sub-types (mlops, computer-vision, nlp-tool, vector-db, ai-coding)

This task also updates existing tests and removes `computer-vision`, `nlp`, `natural-language-processing` from the `ai-model` catch-all.

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 5 sub-types to `ai-ml` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 5 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules, update `ai-model` keywords)
- Modify: `src/lib/classifyRepoType.test.ts` (update 2 existing tests, add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `ai-ml` bucket's `subTypes` array, add after the existing `prompt-lib` entry:

```typescript
      { id: 'mlops',           label: 'MLOps',           bucket: 'ai-ml' },
      { id: 'computer-vision', label: 'Computer Vision', bucket: 'ai-ml' },
      { id: 'nlp-tool',        label: 'NLP Tool',        bucket: 'ai-ml' },
      { id: 'vector-db',       label: 'Vector DB',       bucket: 'ai-ml' },
      { id: 'ai-coding',       label: 'AI Coding',       bucket: 'ai-ml' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `Eye, Languages, CodeXml` (plus `Workflow` and `DatabaseZap` are already imported).

Add to `SUB_TYPE_ICONS`:

```typescript
  'mlops':           Workflow,
  'computer-vision': Eye,
  'nlp-tool':        Languages,
  'vector-db':       DatabaseZap,
  'ai-coding':       CodeXml,
```

- [ ] **Step 3: Update existing tests and write new failing tests**

Update the two existing tests that will change:

```typescript
  it('classifies computer-vision topic as ai-ml/computer-vision', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["computer-vision"]' }))).toEqual({ bucket: 'ai-ml', subType: 'computer-vision' })
  })
  it('classifies nlp topic as ai-ml/nlp-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["nlp"]' }))).toEqual({ bucket: 'ai-ml', subType: 'nlp-tool' })
  })
```

Add new tests after the existing AI & ML section:

```typescript
  // ���─ AI & ML — new sub-types ───────────────────────────────────────
  it('classifies mlops topic as ai-ml/mlops', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["mlops"]' }))).toEqual({ bucket: 'ai-ml', subType: 'mlops' })
  })
  it('classifies mlflow topic as ai-ml/mlops', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["mlflow"]' }))).toEqual({ bucket: 'ai-ml', subType: 'mlops' })
  })
  it('classifies opencv topic as ai-ml/computer-vision', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["opencv"]' }))).toEqual({ bucket: 'ai-ml', subType: 'computer-vision' })
  })
  it('classifies spacy topic as ai-ml/nlp-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["spacy"]' }))).toEqual({ bucket: 'ai-ml', subType: 'nlp-tool' })
  })
  it('classifies vector-database topic as ai-ml/vector-db', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["vector-database"]' }))).toEqual({ bucket: 'ai-ml', subType: 'vector-db' })
  })
  it('classifies chromadb name as ai-ml/vector-db', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'chromadb' }))).toEqual({ bucket: 'ai-ml', subType: 'vector-db' })
  })
  it('classifies ai-coding topic as ai-ml/ai-coding', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["ai-coding"]' }))).toEqual({ bucket: 'ai-ml', subType: 'ai-coding' })
  })
  it('classifies code-assistant topic as ai-ml/ai-coding', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["code-assistant"]' }))).toEqual({ bucket: 'ai-ml', subType: 'ai-coding' })
  })
  it('classifies computer vision by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A computer vision library for detecting objects' }))).toEqual({ bucket: 'ai-ml', subType: 'computer-vision' })
  })
  it('classifies mlops by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An mlops platform for model serving and deployment' }))).toEqual({ bucket: 'ai-ml', subType: 'mlops' })
  })
  it('classifies nlp by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A natural language processing toolkit for text processing' }))).toEqual({ bucket: 'ai-ml', subType: 'nlp-tool' })
  })
  it('classifies vector-db by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A vector database for similarity search' }))).toEqual({ bucket: 'ai-ml', subType: 'vector-db' })
  })
  it('classifies ai-coding by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An ai coding assistant for code completion' }))).toEqual({ bucket: 'ai-ml', subType: 'ai-coding' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL — new tests fail, updated tests fail (still matching old `ai-model`).

- [ ] **Step 5: Add classifier rules**

In `classifyRepoType.ts`, add these topic checks **before** the existing `ml-framework` check (at the top of the AI & ML section):

```typescript
  // AI & ML — new specific sub-types (before existing checks)
  if (hasTopic('mlops', 'mlflow', 'kubeflow', 'bentoml', 'model-serving',
               'model-deployment', 'weights-and-biases', 'wandb', 'ml-pipeline'))
    return { bucket: 'ai-ml', subType: 'mlops' }
  if (hasTopic('computer-vision', 'opencv', 'image-recognition', 'object-detection',
               'yolo', 'detectron', 'image-processing', 'image-segmentation', 'ocr'))
    return { bucket: 'ai-ml', subType: 'computer-vision' }
  if (hasTopic('nlp', 'natural-language-processing', 'spacy', 'nltk', 'tokenizer',
               'text-processing', 'sentiment-analysis', 'named-entity-recognition',
               'text-classification'))
    return { bucket: 'ai-ml', subType: 'nlp-tool' }
  if (hasTopic('vector-database', 'vector-db', 'rag', 'retrieval-augmented',
               'embeddings', 'chromadb', 'pinecone', 'weaviate', 'faiss', 'qdrant', 'milvus'))
    return { bucket: 'ai-ml', subType: 'vector-db' }
  if (hasTopic('ai-coding', 'code-assistant', 'copilot', 'code-generation',
               'code-completion', 'ai-code', 'cursor', 'aider', 'continue-dev'))
    return { bucket: 'ai-ml', subType: 'ai-coding' }
```

Then **remove** `computer-vision`, `nlp`, `natural-language-processing` from the existing `ai-model` topic check (they are now handled by the new checks above).

Add name signals (in the AI & ML name section):

```typescript
  // AI & ML — new name signals
  if (nameHas('mlflow', 'kubeflow', 'bentoml', 'wandb', 'mlops'))
    return { bucket: 'ai-ml', subType: 'mlops' }
  if (nameHas('opencv', 'yolo', 'detectron', 'tesseract', 'ocr'))
    return { bucket: 'ai-ml', subType: 'computer-vision' }
  if (nameHas('spacy', 'nltk', 'tokenizer', 'nlp'))
    return { bucket: 'ai-ml', subType: 'nlp-tool' }
  if (nameHas('chromadb', 'pinecone', 'weaviate', 'faiss', 'qdrant', 'milvus'))
    return { bucket: 'ai-ml', subType: 'vector-db' }
  if (nameHas('copilot', 'cursor', 'aider', 'codeium', 'tabby'))
    return { bucket: 'ai-ml', subType: 'ai-coding' }
```

Add description signals (in the AI & ML description section):

```typescript
  // AI & ML — new description signals
  if (descHas('mlops', 'model serving', 'model deployment', 'ml pipeline', 'experiment tracking'))
    return { bucket: 'ai-ml', subType: 'mlops' }
  if (descHas('computer vision', 'object detection', 'image recognition', 'image processing', 'image segmentation'))
    return { bucket: 'ai-ml', subType: 'computer-vision' }
  if (descHas('natural language processing', 'text processing', 'nlp library', 'tokenizer', 'sentiment analysis'))
    return { bucket: 'ai-ml', subType: 'nlp-tool' }
  if (descHas('vector database', 'vector search', 'retrieval augmented', 'embedding store', 'similarity search'))
    return { bucket: 'ai-ml', subType: 'vector-db' }
  if (descHas('ai coding', 'code assistant', 'code completion', 'ai-powered coding'))
    return { bucket: 'ai-ml', subType: 'ai-coding' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add AI & ML sub-types (mlops, computer-vision, nlp-tool, vector-db, ai-coding)"
```

---

### Task 3: Learning — 4 new sub-types (interview-prep, roadmap, coding-challenge, research-paper)

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 4 sub-types to `learning` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 4 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules)
- Modify: `src/lib/classifyRepoType.test.ts` (add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `learning` bucket's `subTypes` array, add after `cheatsheet`:

```typescript
      { id: 'interview-prep',  label: 'Interview Prep',  bucket: 'learning' },
      { id: 'roadmap',         label: 'Roadmap',         bucket: 'learning' },
      { id: 'coding-challenge',label: 'Coding Challenge', bucket: 'learning' },
      { id: 'research-paper',  label: 'Research Paper',  bucket: 'learning' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `BriefcaseBusiness, Map, Trophy, FileSearch`.

Add to `SUB_TYPE_ICONS`:

```typescript
  'interview-prep':  BriefcaseBusiness,
  'roadmap':         Map,
  'coding-challenge': Trophy,
  'research-paper':  FileSearch,
```

- [ ] **Step 3: Write failing tests**

Add after the existing Learning topic tests:

```typescript
  // ── Learning — new sub-types ──────────────────────────────────────
  it('classifies interview topic as learning/interview-prep', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["interview"]' }))).toEqual({ bucket: 'learning', subType: 'interview-prep' })
  })
  it('classifies leetcode topic as learning/interview-prep', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["leetcode"]' }))).toEqual({ bucket: 'learning', subType: 'interview-prep' })
  })
  it('classifies coding-interview topic as learning/interview-prep', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["coding-interview"]' }))).toEqual({ bucket: 'learning', subType: 'interview-prep' })
  })
  it('classifies roadmap topic as learning/roadmap', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["roadmap"]' }))).toEqual({ bucket: 'learning', subType: 'roadmap' })
  })
  it('classifies roadmap name as learning/roadmap', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'developer-roadmap' }))).toEqual({ bucket: 'learning', subType: 'roadmap' })
  })
  it('classifies coding-challenge topic as learning/coding-challenge', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["coding-challenge"]' }))).toEqual({ bucket: 'learning', subType: 'coding-challenge' })
  })
  it('classifies competitive-programming topic as learning/coding-challenge', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["competitive-programming"]' }))).toEqual({ bucket: 'learning', subType: 'coding-challenge' })
  })
  it('classifies research-paper topic as learning/research-paper', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["research-paper"]' }))).toEqual({ bucket: 'learning', subType: 'research-paper' })
  })
  it('classifies arxiv topic as learning/research-paper', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["arxiv"]' }))).toEqual({ bucket: 'learning', subType: 'research-paper' })
  })
  it('classifies interview prep by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myrepo', description: 'A collection of coding interview questions and solutions' }))).toEqual({ bucket: 'learning', subType: 'interview-prep' })
  })
  it('classifies roadmap by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myrepo', description: 'A developer roadmap and learning path for backend engineers' }))).toEqual({ bucket: 'learning', subType: 'roadmap' })
  })
  it('classifies coding challenge by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myrepo', description: 'A set of coding challenge solutions and practice problems' }))).toEqual({ bucket: 'learning', subType: 'coding-challenge' })
  })
  it('classifies research paper by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myrepo', description: 'Implementation of a research paper on transformers' }))).toEqual({ bucket: 'learning', subType: 'research-paper' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL — new tests fail.

- [ ] **Step 5: Add classifier rules**

In the topic phase, add these checks **before** the existing `awesome-list` check (at the top of the Learning section):

```typescript
  // Learning — new specific sub-types
  if (hasTopic('interview', 'interview-questions', 'interview-preparation', 'leetcode',
               'system-design', 'coding-interview', 'technical-interview', 'algo-practice'))
    return { bucket: 'learning', subType: 'interview-prep' }
  if (hasTopic('roadmap', 'developer-roadmap', 'learning-path', 'career-path', 'skill-tree'))
    return { bucket: 'learning', subType: 'roadmap' }
  if (hasTopic('coding-challenge', 'coding-challenges', 'advent-of-code', 'project-euler',
               'exercism', 'kata', 'competitive-programming', 'hackerrank', 'codewars'))
    return { bucket: 'learning', subType: 'coding-challenge' }
  if (hasTopic('research', 'paper', 'papers', 'papers-with-code', 'arxiv',
               'research-paper', 'paper-implementation', 'scientific-paper'))
    return { bucket: 'learning', subType: 'research-paper' }
```

Add name signals:

```typescript
  if (nameHas('interview', 'leetcode', 'system-design-primer'))
    return { bucket: 'learning', subType: 'interview-prep' }
  if (nameHas('roadmap'))
    return { bucket: 'learning', subType: 'roadmap' }
  if (nameHas('advent-of-code', 'exercism', 'euler', 'codewars', 'hackerrank'))
    return { bucket: 'learning', subType: 'coding-challenge' }
  if (nameHas('paper', 'arxiv', 'papers-with-code'))
    return { bucket: 'learning', subType: 'research-paper' }
```

Add description signals:

```typescript
  if (descHas('interview preparation', 'interview questions', 'coding interview', 'system design interview'))
    return { bucket: 'learning', subType: 'interview-prep' }
  if (descHas('developer roadmap', 'learning path', 'learning roadmap', 'career path'))
    return { bucket: 'learning', subType: 'roadmap' }
  if (descHas('coding challenge', 'coding exercise', 'practice problems', 'competitive programming'))
    return { bucket: 'learning', subType: 'coding-challenge' }
  if (descHas('research paper', 'paper implementation', 'academic paper', 'arxiv paper'))
    return { bucket: 'learning', subType: 'research-paper' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add Learning sub-types (interview-prep, roadmap, coding-challenge, research-paper)"
```

---

### Task 4: Frameworks — 5 new sub-types (desktop-framework, state-management, data-viz, animation, auth-library)

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 5 sub-types to `frameworks` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 5 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules)
- Modify: `src/lib/classifyRepoType.test.ts` (add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `frameworks` bucket's `subTypes` array, add after `game-engine`:

```typescript
      { id: 'desktop-framework', label: 'Desktop Framework', bucket: 'frameworks' },
      { id: 'state-management',  label: 'State Management',  bucket: 'frameworks' },
      { id: 'data-viz',          label: 'Data Viz',          bucket: 'frameworks' },
      { id: 'animation',         label: 'Animation',         bucket: 'frameworks' },
      { id: 'auth-library',      label: 'Auth Library',      bucket: 'frameworks' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `AppWindow, RefreshCw, LineChart, Sparkles, Lock`.

Add to `SUB_TYPE_ICONS`:

```typescript
  'desktop-framework': AppWindow,
  'state-management':  RefreshCw,
  'data-viz':          LineChart,
  'animation':         Sparkles,
  'auth-library':      Lock,
```

- [ ] **Step 3: Write failing tests**

```typescript
  // ── Frameworks — new sub-types ────────────────────────────────────
  it('classifies electron topic as frameworks/desktop-framework', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["electron"]' }))).toEqual({ bucket: 'frameworks', subType: 'desktop-framework' })
  })
  it('classifies tauri topic as frameworks/desktop-framework', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["tauri"]' }))).toEqual({ bucket: 'frameworks', subType: 'desktop-framework' })
  })
  it('classifies state-management topic as frameworks/state-management', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["state-management"]' }))).toEqual({ bucket: 'frameworks', subType: 'state-management' })
  })
  it('classifies redux topic as frameworks/state-management', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["redux"]' }))).toEqual({ bucket: 'frameworks', subType: 'state-management' })
  })
  it('classifies zustand name as frameworks/state-management', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'zustand' }))).toEqual({ bucket: 'frameworks', subType: 'state-management' })
  })
  it('classifies data-visualization topic as frameworks/data-viz', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["data-visualization"]' }))).toEqual({ bucket: 'frameworks', subType: 'data-viz' })
  })
  it('classifies d3 name as frameworks/data-viz', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'd3' }))).toEqual({ bucket: 'frameworks', subType: 'data-viz' })
  })
  it('classifies animation topic as frameworks/animation', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["animation"]' }))).toEqual({ bucket: 'frameworks', subType: 'animation' })
  })
  it('classifies threejs topic as frameworks/animation', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["threejs"]' }))).toEqual({ bucket: 'frameworks', subType: 'animation' })
  })
  it('classifies passport topic as frameworks/auth-library', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["passport"]' }))).toEqual({ bucket: 'frameworks', subType: 'auth-library' })
  })
  it('classifies nextauth topic as frameworks/auth-library', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["nextauth"]' }))).toEqual({ bucket: 'frameworks', subType: 'auth-library' })
  })
  it('classifies data viz by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A data visualization library for interactive charts' }))).toEqual({ bucket: 'frameworks', subType: 'data-viz' })
  })
  it('classifies desktop framework by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myapp', description: 'Build cross-platform desktop applications with web tech' }))).toEqual({ bucket: 'frameworks', subType: 'desktop-framework' })
  })
  it('classifies state management by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A state management library for React apps' }))).toEqual({ bucket: 'frameworks', subType: 'state-management' })
  })
  it('classifies animation by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A motion library for smooth UI animations' }))).toEqual({ bucket: 'frameworks', subType: 'animation' })
  })
  it('classifies auth library by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An authentication library for Node.js apps' }))).toEqual({ bucket: 'frameworks', subType: 'auth-library' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL

- [ ] **Step 5: Add classifier rules**

Topic checks — add **before** the existing `css-framework` check:

```typescript
  // Frameworks — new specific sub-types
  if (hasTopic('electron', 'tauri', 'wails', 'pyqt', 'qt', 'gtk', 'wxwidgets',
               'desktop-app', 'desktop-application'))
    return { bucket: 'frameworks', subType: 'desktop-framework' }
  if (hasTopic('state-management', 'redux', 'zustand', 'mobx', 'pinia', 'jotai',
               'recoil', 'xstate', 'ngrx', 'vuex'))
    return { bucket: 'frameworks', subType: 'state-management' }
  if (hasTopic('data-visualization', 'visualization', 'charting', 'd3', 'chart',
               'plotly', 'recharts', 'echarts', 'grafana-plugin'))
    return { bucket: 'frameworks', subType: 'data-viz' }
  if (hasTopic('animation', 'motion', 'gsap', 'lottie', 'threejs', 'three-js',
               'webgl', '3d', 'framer-motion', 'anime'))
    return { bucket: 'frameworks', subType: 'animation' }
  if (hasTopic('passport', 'nextauth', 'lucia', 'supertokens', 'auth-library',
               'authentication-library', 'jwt', 'oauth2'))
    return { bucket: 'frameworks', subType: 'auth-library' }
```

Name signals — add before existing framework name checks:

```typescript
  if (nameHas('electron', 'tauri', 'wails', 'pyqt', 'gtk'))
    return { bucket: 'frameworks', subType: 'desktop-framework' }
  if (nameHas('redux', 'zustand', 'mobx', 'pinia', 'jotai', 'recoil', 'xstate'))
    return { bucket: 'frameworks', subType: 'state-management' }
  if (nameHas('d3', 'chart', 'plotly', 'recharts', 'echarts', 'nivo', 'visx'))
    return { bucket: 'frameworks', subType: 'data-viz' }
  if (nameHas('animation', 'gsap', 'lottie', 'three', 'framer-motion', 'anime'))
    return { bucket: 'frameworks', subType: 'animation' }
  if (nameHas('passport', 'nextauth', 'lucia', 'supertokens'))
    return { bucket: 'frameworks', subType: 'auth-library' }
```

Description signals — add before existing framework desc checks:

```typescript
  if (descHas('desktop framework', 'desktop application', 'cross-platform desktop'))
    return { bucket: 'frameworks', subType: 'desktop-framework' }
  if (descHas('state management', 'state library', 'global state'))
    return { bucket: 'frameworks', subType: 'state-management' }
  if (descHas('data visualization', 'charting library', 'chart library', 'interactive chart'))
    return { bucket: 'frameworks', subType: 'data-viz' }
  if (descHas('animation library', 'motion library', '3d rendering', 'webgl'))
    return { bucket: 'frameworks', subType: 'animation' }
  if (descHas('authentication library', 'auth library', 'login system', 'oauth library'))
    return { bucket: 'frameworks', subType: 'auth-library' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add Frameworks sub-types (desktop-framework, state-management, data-viz, animation, auth-library)"
```

---

### Task 5: Language Projects — 4 new sub-types (type-checker, lang-server, repl, pkg-registry)

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 4 sub-types to `lang-projects` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 4 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules)
- Modify: `src/lib/classifyRepoType.test.ts` (add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `lang-projects` bucket's `subTypes` array, add after `compiler`:

```typescript
      { id: 'type-checker', label: 'Type Checker',      bucket: 'lang-projects' },
      { id: 'lang-server',  label: 'Language Server',    bucket: 'lang-projects' },
      { id: 'repl',         label: 'REPL',              bucket: 'lang-projects' },
      { id: 'pkg-registry', label: 'Package Registry',  bucket: 'lang-projects' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `Braces, CheckCheck, ChevronRightSquare, Warehouse`.

Add to `SUB_TYPE_ICONS`:

```typescript
  'type-checker': CheckCheck,
  'lang-server':  Braces,
  'repl':         ChevronRightSquare,
  'pkg-registry': Warehouse,
```

- [ ] **Step 3: Write failing tests**

```typescript
  // ── Language Projects — new sub-types ─────────────────────────────
  it('classifies type-checker topic as lang-projects/type-checker', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["type-checker"]' }))).toEqual({ bucket: 'lang-projects', subType: 'type-checker' })
  })
  it('classifies mypy topic as lang-projects/type-checker', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["mypy"]' }))).toEqual({ bucket: 'lang-projects', subType: 'type-checker' })
  })
  it('classifies pyright name as lang-projects/type-checker', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'pyright' }))).toEqual({ bucket: 'lang-projects', subType: 'type-checker' })
  })
  it('classifies lsp topic as lang-projects/lang-server', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["lsp"]' }))).toEqual({ bucket: 'lang-projects', subType: 'lang-server' })
  })
  it('classifies rust-analyzer name as lang-projects/lang-server', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'rust-analyzer' }))).toEqual({ bucket: 'lang-projects', subType: 'lang-server' })
  })
  it('classifies repl topic as lang-projects/repl', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["repl"]' }))).toEqual({ bucket: 'lang-projects', subType: 'repl' })
  })
  it('classifies ipython name as lang-projects/repl', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'ipython' }))).toEqual({ bucket: 'lang-projects', subType: 'repl' })
  })
  it('classifies package-registry topic as lang-projects/pkg-registry', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["package-registry"]' }))).toEqual({ bucket: 'lang-projects', subType: 'pkg-registry' })
  })
  it('classifies verdaccio name as lang-projects/pkg-registry', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'verdaccio' }))).toEqual({ bucket: 'lang-projects', subType: 'pkg-registry' })
  })
  it('classifies type checker by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A fast type checker for Python code' }))).toEqual({ bucket: 'lang-projects', subType: 'type-checker' })
  })
  it('classifies language server by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A language server protocol implementation for Go' }))).toEqual({ bucket: 'lang-projects', subType: 'lang-server' })
  })
  it('classifies repl by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An interactive shell and repl for Ruby' }))).toEqual({ bucket: 'lang-projects', subType: 'repl' })
  })
  it('classifies package registry by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A private registry for npm packages' }))).toEqual({ bucket: 'lang-projects', subType: 'pkg-registry' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL

- [ ] **Step 5: Add classifier rules**

Topic checks — add **before** the existing `compiler` check:

```typescript
  // Language Projects — new specific sub-types
  if (hasTopic('type-checker', 'type-checking', 'typechecker', 'mypy', 'flow',
               'type-system', 'type-inference'))
    return { bucket: 'lang-projects', subType: 'type-checker' }
  if (hasTopic('language-server', 'lsp', 'language-server-protocol', 'rust-analyzer',
               'gopls', 'typescript-language-server'))
    return { bucket: 'lang-projects', subType: 'lang-server' }
  if (hasTopic('repl', 'interactive', 'interactive-shell', 'ipython', 'read-eval-print'))
    return { bucket: 'lang-projects', subType: 'repl' }
  if (hasTopic('package-registry', 'registry', 'npm-registry', 'verdaccio',
               'crates-io', 'pypi', 'artifact-repository'))
    return { bucket: 'lang-projects', subType: 'pkg-registry' }
```

Name signals — add before existing lang-projects name checks:

```typescript
  if (nameHas('mypy', 'flow', 'pytype', 'type-checker', 'pyright'))
    return { bucket: 'lang-projects', subType: 'type-checker' }
  if (nameHas('rust-analyzer', 'gopls', 'lsp', 'language-server'))
    return { bucket: 'lang-projects', subType: 'lang-server' }
  if (nameHas('repl', 'ipython', 'irb'))
    return { bucket: 'lang-projects', subType: 'repl' }
  if (nameHas('verdaccio', 'registry', 'pypi'))
    return { bucket: 'lang-projects', subType: 'pkg-registry' }
```

Description signals — add before existing lang-projects desc checks:

```typescript
  if (descHas('type checker', 'type checking', 'type system', 'type inference'))
    return { bucket: 'lang-projects', subType: 'type-checker' }
  if (descHas('language server', 'lsp implementation', 'language server protocol', 'code intelligence'))
    return { bucket: 'lang-projects', subType: 'lang-server' }
  if (descHas('repl', 'interactive shell', 'read-eval-print', 'interactive console'))
    return { bucket: 'lang-projects', subType: 'repl' }
  if (descHas('package registry', 'private registry', 'artifact repository', 'package repository'))
    return { bucket: 'lang-projects', subType: 'pkg-registry' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add Language Projects sub-types (type-checker, lang-server, repl, pkg-registry)"
```

---

### Task 6: Editors & IDEs — 4 new sub-types (db-client, api-client-app, diff-tool, file-manager)

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 4 sub-types to `editors` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 4 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules)
- Modify: `src/lib/classifyRepoType.test.ts` (add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `editors` bucket's `subTypes` array, add after `design-tool`:

```typescript
      { id: 'db-client',       label: 'Database Client', bucket: 'editors' },
      { id: 'api-client-app',  label: 'REST Client',     bucket: 'editors' },
      { id: 'diff-tool',       label: 'Diff Tool',       bucket: 'editors' },
      { id: 'file-manager',    label: 'File Manager',    bucket: 'editors' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `Table2, Send, GitCompareArrows, FolderOpen`.

Add to `SUB_TYPE_ICONS`:

```typescript
  'db-client':      Table2,
  'api-client-app': Send,
  'diff-tool':      GitCompareArrows,
  'file-manager':   FolderOpen,
```

- [ ] **Step 3: Write failing tests**

```typescript
  // ── Editors — new sub-types ───────────────────────────────────────
  it('classifies database-client topic as editors/db-client', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["database-client"]' }))).toEqual({ bucket: 'editors', subType: 'db-client' })
  })
  it('classifies database-gui topic as editors/db-client', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["database-gui"]' }))).toEqual({ bucket: 'editors', subType: 'db-client' })
  })
  it('classifies dbeaver name as editors/db-client', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'dbeaver' }))).toEqual({ bucket: 'editors', subType: 'db-client' })
  })
  it('classifies hoppscotch topic as editors/api-client-app', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["hoppscotch"]' }))).toEqual({ bucket: 'editors', subType: 'api-client-app' })
  })
  it('classifies rest-client topic as editors/api-client-app', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["rest-client"]' }))).toEqual({ bucket: 'editors', subType: 'api-client-app' })
  })
  it('classifies bruno name as editors/api-client-app', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'bruno' }))).toEqual({ bucket: 'editors', subType: 'api-client-app' })
  })
  it('classifies diff-tool topic as editors/diff-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["diff-tool"]' }))).toEqual({ bucket: 'editors', subType: 'diff-tool' })
  })
  it('classifies delta name as editors/diff-tool', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'delta' }))).toEqual({ bucket: 'editors', subType: 'diff-tool' })
  })
  it('classifies file-manager topic as editors/file-manager', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["file-manager"]' }))).toEqual({ bucket: 'editors', subType: 'file-manager' })
  })
  it('classifies yazi name as editors/file-manager', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'yazi' }))).toEqual({ bucket: 'editors', subType: 'file-manager' })
  })
  it('classifies db client by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myapp', description: 'A database gui for managing PostgreSQL' }))).toEqual({ bucket: 'editors', subType: 'db-client' })
  })
  it('classifies rest client by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myapp', description: 'A lightweight http client for testing APIs' }))).toEqual({ bucket: 'editors', subType: 'api-client-app' })
  })
  it('classifies diff tool by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myapp', description: 'A syntax-aware diff tool for code review' }))).toEqual({ bucket: 'editors', subType: 'diff-tool' })
  })
  it('classifies file manager by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myapp', description: 'A terminal file manager with vim keybindings' }))).toEqual({ bucket: 'editors', subType: 'file-manager' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL

- [ ] **Step 5: Add classifier rules**

Topic checks — add at the top of the Editors section (before existing `vscode` check). Since Editors is now checked before Dev Tools (from Task 1), `api-client-app` will be checked before `api-tool`:

```typescript
  // Editors — new specific sub-types
  if (hasTopic('database-client', 'database-gui', 'database-management', 'dbeaver',
               'pgadmin', 'sql-client', 'database-tool', 'db-management'))
    return { bucket: 'editors', subType: 'db-client' }
  if (hasTopic('rest-client', 'http-client', 'graphql-client',
               'hoppscotch', 'insomnia', 'bruno'))
    return { bucket: 'editors', subType: 'api-client-app' }
  if (hasTopic('diff', 'diff-tool', 'merge-tool', 'code-diff', 'file-comparison'))
    return { bucket: 'editors', subType: 'diff-tool' }
  if (hasTopic('file-manager', 'file-browser', 'file-explorer', 'terminal-file-manager'))
    return { bucket: 'editors', subType: 'file-manager' }
```

Name signals — add before existing editor name checks:

```typescript
  if (nameHas('dbeaver', 'pgadmin', 'tableplus', 'beekeeper', 'dbgate', 'sqltools'))
    return { bucket: 'editors', subType: 'db-client' }
  if (nameHas('hoppscotch', 'insomnia', 'bruno', 'httpie'))
    return { bucket: 'editors', subType: 'api-client-app' }
  if (nameHas('diff', 'meld', 'delta', 'difftastic'))
    return { bucket: 'editors', subType: 'diff-tool' }
  if (nameHas('ranger', 'nnn', 'yazi', 'mc', 'lf', 'broot'))
    return { bucket: 'editors', subType: 'file-manager' }
```

Description signals — add before existing editor desc checks:

```typescript
  if (descHas('database client', 'database gui', 'database management tool', 'sql client', 'database browser'))
    return { bucket: 'editors', subType: 'db-client' }
  if (descHas('rest client', 'http client', 'api testing tool'))
    return { bucket: 'editors', subType: 'api-client-app' }
  if (descHas('diff tool', 'merge tool', 'file comparison', 'code diff'))
    return { bucket: 'editors', subType: 'diff-tool' }
  if (descHas('file manager', 'file browser', 'file explorer', 'directory browser'))
    return { bucket: 'editors', subType: 'file-manager' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add Editors sub-types (db-client, api-client-app, diff-tool, file-manager)"
```

---

### Task 7: Dev Tools — 6 new sub-types (profiler, code-generator, doc-tool, static-analysis, api-tool, monorepo-tool)

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 6 sub-types to `dev-tools` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 6 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules)
- Modify: `src/lib/classifyRepoType.test.ts` (add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `dev-tools` bucket's `subTypes` array, add after `vcs-tool`:

```typescript
      { id: 'profiler',       label: 'Profiler',        bucket: 'dev-tools' },
      { id: 'code-generator', label: 'Code Generator',  bucket: 'dev-tools' },
      { id: 'doc-tool',       label: 'Documentation Tool', bucket: 'dev-tools' },
      { id: 'static-analysis',label: 'Static Analysis', bucket: 'dev-tools' },
      { id: 'api-tool',       label: 'API Tool',        bucket: 'dev-tools' },
      { id: 'monorepo-tool',  label: 'Monorepo Tool',   bucket: 'dev-tools' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `Gauge, FileCode2, NotebookText, ShieldCheck, Unplug, FolderTree`.

Add to `SUB_TYPE_ICONS`:

```typescript
  'profiler':        Gauge,
  'code-generator':  FileCode2,
  'doc-tool':        NotebookText,
  'static-analysis': ShieldCheck,
  'api-tool':        Unplug,
  'monorepo-tool':   FolderTree,
```

- [ ] **Step 3: Write failing tests**

```typescript
  // ── Dev Tools — new sub-types ─────────────────────────────────────
  it('classifies profiler topic as dev-tools/profiler', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["profiler"]' }))).toEqual({ bucket: 'dev-tools', subType: 'profiler' })
  })
  it('classifies flamegraph topic as dev-tools/profiler', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["flamegraph"]' }))).toEqual({ bucket: 'dev-tools', subType: 'profiler' })
  })
  it('classifies code-generator topic as dev-tools/code-generator', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["code-generator"]' }))).toEqual({ bucket: 'dev-tools', subType: 'code-generator' })
  })
  it('classifies yeoman name as dev-tools/code-generator', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'yeoman' }))).toEqual({ bucket: 'dev-tools', subType: 'code-generator' })
  })
  it('classifies documentation topic as dev-tools/doc-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["documentation"]' }))).toEqual({ bucket: 'dev-tools', subType: 'doc-tool' })
  })
  it('classifies docusaurus name as dev-tools/doc-tool', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'docusaurus' }))).toEqual({ bucket: 'dev-tools', subType: 'doc-tool' })
  })
  it('classifies static-analysis topic as dev-tools/static-analysis', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["static-analysis"]' }))).toEqual({ bucket: 'dev-tools', subType: 'static-analysis' })
  })
  it('classifies semgrep name as dev-tools/static-analysis', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'semgrep' }))).toEqual({ bucket: 'dev-tools', subType: 'static-analysis' })
  })
  it('classifies swagger topic as dev-tools/api-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["swagger"]' }))).toEqual({ bucket: 'dev-tools', subType: 'api-tool' })
  })
  it('classifies openapi topic as dev-tools/api-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["openapi"]' }))).toEqual({ bucket: 'dev-tools', subType: 'api-tool' })
  })
  it('classifies monorepo topic as dev-tools/monorepo-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["monorepo"]' }))).toEqual({ bucket: 'dev-tools', subType: 'monorepo-tool' })
  })
  it('classifies turborepo name as dev-tools/monorepo-tool', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'turborepo' }))).toEqual({ bucket: 'dev-tools', subType: 'monorepo-tool' })
  })
  it('classifies doc tool by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A documentation tool for generating API docs' }))).toEqual({ bucket: 'dev-tools', subType: 'doc-tool' })
  })
  it('classifies profiler by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A profiling tool for finding performance bottlenecks' }))).toEqual({ bucket: 'dev-tools', subType: 'profiler' })
  })
  it('classifies code generator by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A code generator that scaffolding tool for new projects' }))).toEqual({ bucket: 'dev-tools', subType: 'code-generator' })
  })
  it('classifies static analysis by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A static analysis tool for code quality checks' }))).toEqual({ bucket: 'dev-tools', subType: 'static-analysis' })
  })
  it('classifies api tool by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An api tool for api design and testing' }))).toEqual({ bucket: 'dev-tools', subType: 'api-tool' })
  })
  it('classifies monorepo by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A monorepo tool for workspace management' }))).toEqual({ bucket: 'dev-tools', subType: 'monorepo-tool' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL

- [ ] **Step 5: Add classifier rules**

Topic checks — add at the top of the Dev Tools section (before existing `algorithm` check):

```typescript
  // Dev Tools — new specific sub-types
  if (hasTopic('profiler', 'profiling', 'flamegraph', 'performance-profiling'))
    return { bucket: 'dev-tools', subType: 'profiler' }
  if (hasTopic('code-generator', 'scaffolding', 'codegen', 'openapi-generator', 'yeoman'))
    return { bucket: 'dev-tools', subType: 'code-generator' }
  if (hasTopic('documentation', 'docs', 'documentation-tool', 'sphinx', 'jsdoc',
               'typedoc', 'docusaurus', 'mkdocs'))
    return { bucket: 'dev-tools', subType: 'doc-tool' }
  if (hasTopic('static-analysis', 'sast', 'sonarqube', 'semgrep', 'codeql', 'code-quality'))
    return { bucket: 'dev-tools', subType: 'static-analysis' }
  if (hasTopic('api-tool', 'swagger', 'openapi', 'postman', 'api-design', 'api-testing'))
    return { bucket: 'dev-tools', subType: 'api-tool' }
  if (hasTopic('monorepo', 'turborepo', 'nx', 'lerna', 'workspaces'))
    return { bucket: 'dev-tools', subType: 'monorepo-tool' }
```

Name signals — add before existing dev-tools name checks:

```typescript
  if (nameHas('profiler', 'flamegraph', 'py-spy'))
    return { bucket: 'dev-tools', subType: 'profiler' }
  if (nameHas('codegen', 'generator', 'yeoman', 'hygen', 'plop'))
    return { bucket: 'dev-tools', subType: 'code-generator' }
  if (nameHas('sphinx', 'typedoc', 'jsdoc', 'docusaurus', 'mkdocs', 'storybook'))
    return { bucket: 'dev-tools', subType: 'doc-tool' }
  if (nameHas('sonarqube', 'semgrep', 'codeql', 'static-analysis'))
    return { bucket: 'dev-tools', subType: 'static-analysis' }
  if (nameHas('swagger', 'openapi', 'postman'))
    return { bucket: 'dev-tools', subType: 'api-tool' }
  if (nameHas('monorepo', 'turborepo', 'lerna', 'nx'))
    return { bucket: 'dev-tools', subType: 'monorepo-tool' }
```

Description signals — add before existing dev-tools desc checks (or create if none exist):

```typescript
  if (descHas('profiler', 'profiling tool', 'flame graph'))
    return { bucket: 'dev-tools', subType: 'profiler' }
  if (descHas('code generator', 'scaffolding tool', 'generates code'))
    return { bucket: 'dev-tools', subType: 'code-generator' }
  if (descHas('documentation tool', 'documentation generator', 'api documentation'))
    return { bucket: 'dev-tools', subType: 'doc-tool' }
  if (descHas('static analysis', 'code quality', 'security scanning'))
    return { bucket: 'dev-tools', subType: 'static-analysis' }
  if (descHas('api tool', 'api testing', 'api design', 'api documentation'))
    return { bucket: 'dev-tools', subType: 'api-tool' }
  if (descHas('monorepo', 'workspace management'))
    return { bucket: 'dev-tools', subType: 'monorepo-tool' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add Dev Tools sub-types (profiler, code-generator, doc-tool, static-analysis, api-tool, monorepo-tool)"
```

---

### Task 8: Infrastructure — 6 new sub-types (message-queue, ci-cd, search-engine, auth-infra, api-gateway, logging)

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 6 sub-types to `infrastructure` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 6 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules)
- Modify: `src/lib/classifyRepoType.test.ts` (add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `infrastructure` bucket's `subTypes` array, add after `blockchain`:

```typescript
      { id: 'message-queue', label: 'Message Queue',  bucket: 'infrastructure' },
      { id: 'ci-cd',         label: 'CI/CD',          bucket: 'infrastructure' },
      { id: 'search-engine', label: 'Search Engine',  bucket: 'infrastructure' },
      { id: 'auth-infra',    label: 'Auth / Identity', bucket: 'infrastructure' },
      { id: 'api-gateway',   label: 'API Gateway',    bucket: 'infrastructure' },
      { id: 'logging',       label: 'Logging',        bucket: 'infrastructure' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `Repeat2, Rocket, Search, KeyRound, Route, ScrollText`.

Add to `SUB_TYPE_ICONS`:

```typescript
  'message-queue': Repeat2,
  'ci-cd':         Rocket,
  'search-engine': Search,
  'auth-infra':    KeyRound,
  'api-gateway':   Route,
  'logging':       ScrollText,
```

- [ ] **Step 3: Write failing tests**

```typescript
  // ── Infrastructure — new sub-types ────────────────────────────────
  it('classifies kafka topic as infrastructure/message-queue', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["kafka"]' }))).toEqual({ bucket: 'infrastructure', subType: 'message-queue' })
  })
  it('classifies rabbitmq topic as infrastructure/message-queue', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["rabbitmq"]' }))).toEqual({ bucket: 'infrastructure', subType: 'message-queue' })
  })
  it('classifies message-queue topic as infrastructure/message-queue', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["message-queue"]' }))).toEqual({ bucket: 'infrastructure', subType: 'message-queue' })
  })
  it('classifies ci-cd topic as infrastructure/ci-cd', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["ci-cd"]' }))).toEqual({ bucket: 'infrastructure', subType: 'ci-cd' })
  })
  it('classifies github-actions topic as infrastructure/ci-cd', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["github-actions"]' }))).toEqual({ bucket: 'infrastructure', subType: 'ci-cd' })
  })
  it('classifies jenkins name as infrastructure/ci-cd', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'jenkins' }))).toEqual({ bucket: 'infrastructure', subType: 'ci-cd' })
  })
  it('classifies elasticsearch topic as infrastructure/search-engine', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["elasticsearch"]' }))).toEqual({ bucket: 'infrastructure', subType: 'search-engine' })
  })
  it('classifies meilisearch name as infrastructure/search-engine', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'meilisearch' }))).toEqual({ bucket: 'infrastructure', subType: 'search-engine' })
  })
  it('classifies identity-provider topic as infrastructure/auth-infra', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["identity-provider"]' }))).toEqual({ bucket: 'infrastructure', subType: 'auth-infra' })
  })
  it('classifies keycloak name as infrastructure/auth-infra', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'keycloak' }))).toEqual({ bucket: 'infrastructure', subType: 'auth-infra' })
  })
  it('classifies sso topic as infrastructure/auth-infra', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["sso"]' }))).toEqual({ bucket: 'infrastructure', subType: 'auth-infra' })
  })
  it('classifies api-gateway topic as infrastructure/api-gateway', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["api-gateway"]' }))).toEqual({ bucket: 'infrastructure', subType: 'api-gateway' })
  })
  it('classifies kong name as infrastructure/api-gateway', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'kong' }))).toEqual({ bucket: 'infrastructure', subType: 'api-gateway' })
  })
  it('classifies logging topic as infrastructure/logging', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["logging"]' }))).toEqual({ bucket: 'infrastructure', subType: 'logging' })
  })
  it('classifies loki name as infrastructure/logging', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'loki' }))).toEqual({ bucket: 'infrastructure', subType: 'logging' })
  })
  it('classifies ci/cd by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'myci', description: 'A continuous integration and continuous deployment pipeline tool' }))).toEqual({ bucket: 'infrastructure', subType: 'ci-cd' })
  })
  it('classifies message queue by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A fast message queue for event streaming' }))).toEqual({ bucket: 'infrastructure', subType: 'message-queue' })
  })
  it('classifies search engine by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A blazing fast search engine with full-text search' }))).toEqual({ bucket: 'infrastructure', subType: 'search-engine' })
  })
  it('classifies auth infra by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An identity provider with single sign-on support' }))).toEqual({ bucket: 'infrastructure', subType: 'auth-infra' })
  })
  it('classifies api gateway by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An api gateway for microservices api management' }))).toEqual({ bucket: 'infrastructure', subType: 'api-gateway' })
  })
  it('classifies logging by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A structured logging library for log aggregation' }))).toEqual({ bucket: 'infrastructure', subType: 'logging' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL

- [ ] **Step 5: Add classifier rules**

Topic checks — add at the top of the Infrastructure section (before existing `container` check):

```typescript
  // Infrastructure — new specific sub-types
  if (hasTopic('message-queue', 'message-broker', 'kafka', 'rabbitmq', 'nats', 'zeromq',
               'amqp', 'pub-sub', 'event-streaming', 'pulsar'))
    return { bucket: 'infrastructure', subType: 'message-queue' }
  if (hasTopic('ci-cd', 'ci', 'cd', 'continuous-integration', 'continuous-deployment',
               'github-actions', 'jenkins', 'drone', 'woodpecker', 'gitlab-ci', 'circleci'))
    return { bucket: 'infrastructure', subType: 'ci-cd' }
  if (hasTopic('search-engine', 'full-text-search', 'elasticsearch', 'meilisearch',
               'typesense', 'solr', 'opensearch', 'lucene', 'search-index'))
    return { bucket: 'infrastructure', subType: 'search-engine' }
  if (hasTopic('identity', 'identity-provider', 'idp', 'keycloak', 'authentik',
               'casdoor', 'zitadel', 'sso', 'single-sign-on', 'ldap', 'saml', 'oidc'))
    return { bucket: 'infrastructure', subType: 'auth-infra' }
  if (hasTopic('api-gateway', 'gateway', 'kong', 'traefik', 'apisix',
               'api-management', 'api-proxy'))
    return { bucket: 'infrastructure', subType: 'api-gateway' }
  if (hasTopic('logging', 'log', 'log-management', 'elk', 'loki', 'fluentd',
               'fluentbit', 'logstash', 'structured-logging', 'syslog'))
    return { bucket: 'infrastructure', subType: 'logging' }
```

Name signals — add before existing infrastructure name checks:

```typescript
  if (nameHas('kafka', 'rabbitmq', 'nats', 'zeromq', 'pulsar', 'celery'))
    return { bucket: 'infrastructure', subType: 'message-queue' }
  if (nameHas('jenkins', 'drone', 'woodpecker', 'circleci', 'github-actions'))
    return { bucket: 'infrastructure', subType: 'ci-cd' }
  if (nameHas('elasticsearch', 'meilisearch', 'typesense', 'solr', 'opensearch', 'lunr'))
    return { bucket: 'infrastructure', subType: 'search-engine' }
  if (nameHas('keycloak', 'authentik', 'casdoor', 'zitadel', 'authelia'))
    return { bucket: 'infrastructure', subType: 'auth-infra' }
  if (nameHas('kong', 'traefik', 'apisix', 'tyk'))
    return { bucket: 'infrastructure', subType: 'api-gateway' }
  if (nameHas('loki', 'fluentd', 'fluentbit', 'logstash', 'graylog', 'vector'))
    return { bucket: 'infrastructure', subType: 'logging' }
```

Description signals — add before existing infrastructure desc checks:

```typescript
  if (descHas('message queue', 'message broker', 'event streaming', 'pub/sub', 'async messaging'))
    return { bucket: 'infrastructure', subType: 'message-queue' }
  if (descHas('ci/cd', 'continuous integration', 'continuous deployment', 'build pipeline', 'deployment pipeline'))
    return { bucket: 'infrastructure', subType: 'ci-cd' }
  if (descHas('search engine', 'full-text search', 'search index', 'search server'))
    return { bucket: 'infrastructure', subType: 'search-engine' }
  if (descHas('identity provider', 'identity management', 'single sign-on', 'authentication server', 'identity platform'))
    return { bucket: 'infrastructure', subType: 'auth-infra' }
  if (descHas('api gateway', 'api management', 'api proxy', 'gateway service'))
    return { bucket: 'infrastructure', subType: 'api-gateway' }
  if (descHas('logging', 'log management', 'log aggregation', 'structured logging', 'log collector'))
    return { bucket: 'infrastructure', subType: 'logging' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add Infrastructure sub-types (message-queue, ci-cd, search-engine, auth-infra, api-gateway, logging)"
```

---

### Task 9: Utilities — 5 new sub-types (scraper, file-converter, i18n, config-tool, notification)

**Files:**
- Modify: `src/constants/repoTypes.ts` (add 5 sub-types to `utilities` bucket)
- Modify: `src/constants/bucketIcons.ts` (add 5 icon mappings)
- Modify: `src/lib/classifyRepoType.ts` (add topic/name/desc rules)
- Modify: `src/lib/classifyRepoType.test.ts` (add new tests)

- [ ] **Step 1: Add sub-types to repoTypes.ts**

In the `utilities` bucket's `subTypes` array, add after `automation`:

```typescript
      { id: 'scraper',        label: 'Scraper',        bucket: 'utilities' },
      { id: 'file-converter', label: 'File Converter',  bucket: 'utilities' },
      { id: 'i18n',           label: 'i18n',            bucket: 'utilities' },
      { id: 'config-tool',    label: 'Config Tool',     bucket: 'utilities' },
      { id: 'notification',   label: 'Notification',    bucket: 'utilities' },
```

- [ ] **Step 2: Add icons to bucketIcons.ts**

Add imports: `Radar, FileOutput, Earth, Settings, Bell`.

Add to `SUB_TYPE_ICONS`:

```typescript
  'scraper':        Radar,
  'file-converter': FileOutput,
  'i18n':           Earth,
  'config-tool':    Settings,
  'notification':   Bell,
```

- [ ] **Step 3: Write failing tests**

```typescript
  // ── Utilities — new sub-types ─────────────────────────────────────
  it('classifies scraper topic as utilities/scraper', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["scraper"]' }))).toEqual({ bucket: 'utilities', subType: 'scraper' })
  })
  it('classifies web-scraper topic as utilities/scraper', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["web-scraper"]' }))).toEqual({ bucket: 'utilities', subType: 'scraper' })
  })
  it('classifies puppeteer topic as utilities/scraper', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["puppeteer"]' }))).toEqual({ bucket: 'utilities', subType: 'scraper' })
  })
  it('classifies scrapy name as utilities/scraper', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'scrapy' }))).toEqual({ bucket: 'utilities', subType: 'scraper' })
  })
  it('classifies file-converter topic as utilities/file-converter', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["file-converter"]' }))).toEqual({ bucket: 'utilities', subType: 'file-converter' })
  })
  it('classifies ffmpeg name as utilities/file-converter', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'ffmpeg' }))).toEqual({ bucket: 'utilities', subType: 'file-converter' })
  })
  it('classifies pandoc name as utilities/file-converter', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'pandoc' }))).toEqual({ bucket: 'utilities', subType: 'file-converter' })
  })
  it('classifies i18n topic as utilities/i18n', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["i18n"]' }))).toEqual({ bucket: 'utilities', subType: 'i18n' })
  })
  it('classifies internationalization topic as utilities/i18n', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["internationalization"]' }))).toEqual({ bucket: 'utilities', subType: 'i18n' })
  })
  it('classifies i18next name as utilities/i18n', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'i18next' }))).toEqual({ bucket: 'utilities', subType: 'i18n' })
  })
  it('classifies config topic as utilities/config-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["config"]' }))).toEqual({ bucket: 'utilities', subType: 'config-tool' })
  })
  it('classifies dotenv name as utilities/config-tool', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'dotenv' }))).toEqual({ bucket: 'utilities', subType: 'config-tool' })
  })
  it('classifies feature-flag topic as utilities/config-tool', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["feature-flag"]' }))).toEqual({ bucket: 'utilities', subType: 'config-tool' })
  })
  it('classifies notification topic as utilities/notification', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["notification"]' }))).toEqual({ bucket: 'utilities', subType: 'notification' })
  })
  it('classifies ntfy name as utilities/notification', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'ntfy' }))).toEqual({ bucket: 'utilities', subType: 'notification' })
  })
  it('classifies push-notification topic as utilities/notification', () => {
    expect(classifyRepoBucket(makeRepo({ topics: '["push-notification"]' }))).toEqual({ bucket: 'utilities', subType: 'notification' })
  })
  it('classifies web scraper by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A fast web scraper for extracting data from sites' }))).toEqual({ bucket: 'utilities', subType: 'scraper' })
  })
  it('classifies file converter by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A file converter for media converter tasks' }))).toEqual({ bucket: 'utilities', subType: 'file-converter' })
  })
  it('classifies i18n by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'An internationalization library for React apps' }))).toEqual({ bucket: 'utilities', subType: 'i18n' })
  })
  it('classifies config tool by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A configuration tool for managing environment variables' }))).toEqual({ bucket: 'utilities', subType: 'config-tool' })
  })
  it('classifies notification by description', () => {
    expect(classifyRepoBucket(makeRepo({ name: 'mylib', description: 'A push notification service for mobile apps' }))).toEqual({ bucket: 'utilities', subType: 'notification' })
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: FAIL

- [ ] **Step 5: Add classifier rules**

Topic checks — add at the top of the Utilities section (before existing `cli` check):

```typescript
  // Utilities — new specific sub-types
  if (hasTopic('scraper', 'web-scraper', 'crawler', 'web-crawler', 'scraping',
               'web-scraping', 'spider', 'crawlee', 'puppeteer', 'playwright', 'selenium'))
    return { bucket: 'utilities', subType: 'scraper' }
  if (hasTopic('file-converter', 'converter', 'conversion', 'ffmpeg', 'pandoc',
               'imagemagick', 'transcoding', 'media-converter', 'format-conversion'))
    return { bucket: 'utilities', subType: 'file-converter' }
  if (hasTopic('i18n', 'internationalization', 'localization', 'l10n', 'i18next',
               'formatjs', 'translation', 'multilingual', 'lingui'))
    return { bucket: 'utilities', subType: 'i18n' }
  if (hasTopic('config', 'configuration', 'dotenv', 'env', 'config-management',
               'cosmiconfig', 'hydra', 'viper', 'feature-flag', 'feature-flags'))
    return { bucket: 'utilities', subType: 'config-tool' }
  if (hasTopic('notification', 'notifications', 'push-notification', 'ntfy', 'gotify',
               'apprise', 'alert', 'push', 'web-push'))
    return { bucket: 'utilities', subType: 'notification' }
```

Name signals — add before existing utilities name checks:

```typescript
  if (nameHas('scrapy', 'crawlee', 'scraper', 'crawler', 'colly', 'spider'))
    return { bucket: 'utilities', subType: 'scraper' }
  if (nameHas('ffmpeg', 'pandoc', 'imagemagick', 'converter'))
    return { bucket: 'utilities', subType: 'file-converter' }
  if (nameHas('i18next', 'formatjs', 'lingui', 'i18n', 'polyglot'))
    return { bucket: 'utilities', subType: 'i18n' }
  if (nameHas('dotenv', 'cosmiconfig', 'hydra', 'viper', 'config'))
    return { bucket: 'utilities', subType: 'config-tool' }
  if (nameHas('ntfy', 'gotify', 'apprise', 'pushover', 'notifo'))
    return { bucket: 'utilities', subType: 'notification' }
```

Description signals — add before existing utilities desc checks:

```typescript
  if (descHas('web scraper', 'web crawler', 'scraping tool', 'data scraping', 'site crawler'))
    return { bucket: 'utilities', subType: 'scraper' }
  if (descHas('file converter', 'format converter', 'media converter', 'transcoding tool', 'file conversion'))
    return { bucket: 'utilities', subType: 'file-converter' }
  if (descHas('internationalization', 'localization', 'i18n library', 'translation tool', 'multilingual'))
    return { bucket: 'utilities', subType: 'i18n' }
  if (descHas('configuration tool', 'config management', 'environment variables', 'feature flags', 'configuration library'))
    return { bucket: 'utilities', subType: 'config-tool' }
  if (descHas('notification service', 'push notification', 'notification tool', 'alert service'))
    return { bucket: 'utilities', subType: 'notification' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/constants/repoTypes.ts src/constants/bucketIcons.ts src/lib/classifyRepoType.ts src/lib/classifyRepoType.test.ts
git commit -m "feat: add Utilities sub-types (scraper, file-converter, i18n, config-tool, notification)"
```

---

### Task 10: Final verification — full test suite and build

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS (no regressions across entire project)

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors (verifies all icon imports are valid and TypeScript is happy)

- [ ] **Step 3: Verify sub-type count**

Run: `npx vitest run src/lib/classifyRepoType.test.ts`

Check the test output — there should be 89 sub-types total across all buckets. You can verify by checking `REPO_BUCKETS.flatMap(b => b.subTypes).length === 89` in a quick test or console log.

- [ ] **Step 4: Commit any fixes if needed**

If any test or build failures were found, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve test/build issues from expanded sub-types"
```
