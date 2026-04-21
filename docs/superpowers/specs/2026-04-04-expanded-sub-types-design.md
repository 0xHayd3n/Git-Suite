# Expanded Sub-Types Design

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Add 39 new sub-types across all 8 existing buckets (50 → 89 total)

## Overview

The current classification system has 8 buckets with 50 sub-types. Many common GitHub repo categories fall through classification (`classifyRepoBucket` returns `null`) or land in overly generic sub-types like `library` or `platform`. This design adds 39 new sub-types to fill those gaps, with full classifier coverage (topic, name, and description matching) for each.

## Files Modified

| File | Change |
|------|--------|
| `src/constants/repoTypes.ts` | Add 39 new sub-type entries across all 8 buckets |
| `src/constants/bucketIcons.ts` | Add 39 new icon imports and mappings |
| `src/lib/classifyRepoType.ts` | Add topic, name, and description matching rules for all 39 sub-types; update existing tests for `computer-vision` and `nlp` topic reclassification |
| `src/lib/classifyRepoType.test.ts` | Add test cases for each new sub-type; update existing `computer-vision` → `ai-model` and `nlp` → `ai-model` tests to expect new sub-types |
| `src/config/repoTypeConfig.ts` | No changes needed (verified: builds config dynamically from `REPO_BUCKETS` and `SUB_TYPE_ICONS`) |

No new files are created. No UI component changes needed — `BucketMegaMenu`, `BucketNav`, `BucketTabBar`, `RepoCard`, and `RepoListRow` all derive from `REPO_BUCKETS` and `SUB_TYPE_ICONS` dynamically.

## Bucket-by-Bucket Additions

### 1. Dev Tools (8 → 14)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| Profiler | `profiler` | `Gauge` | `profiler`, `profiling`, `flamegraph`, `performance-profiling` | `profiler`, `flamegraph`, `py-spy` | `profiler`, `profiling tool`, `flame graph` |
| Code Generator | `code-generator` | `FileCode2` | `code-generator`, `scaffolding`, `codegen`, `openapi-generator`, `yeoman` | `codegen`, `generator`, `yeoman`, `hygen`, `plop` | `code generator`, `scaffolding tool`, `generates code` |
| Documentation Tool | `doc-tool` | `NotebookText` | `documentation`, `docs`, `documentation-tool`, `sphinx`, `jsdoc`, `typedoc`, `docusaurus`, `mkdocs` | `sphinx`, `typedoc`, `jsdoc`, `docusaurus`, `mkdocs`, `storybook` | `documentation tool`, `documentation generator`, `api documentation` |
| Static Analysis | `static-analysis` | `ShieldCheck` | `static-analysis`, `sast`, `sonarqube`, `semgrep`, `codeql`, `code-quality` | `sonarqube`, `semgrep`, `codeql`, `static-analysis` | `static analysis`, `code quality`, `security scanning` |
| API Tool | `api-tool` | `Unplug` | `api-tool`, `swagger`, `openapi`, `postman`, `api-design`, `api-testing` | `swagger`, `openapi`, `postman` | `api tool`, `api testing`, `api design`, `api documentation` |
| Monorepo Tool | `monorepo-tool` | `FolderTree` | `monorepo`, `turborepo`, `nx`, `lerna`, `workspaces` | `monorepo`, `turborepo`, `lerna`, `nx` | `monorepo`, `workspace management` |

### 2. Frameworks (6 → 11)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| Desktop Framework | `desktop-framework` | `AppWindow` | `electron`, `tauri`, `wails`, `pyqt`, `qt`, `gtk`, `wxwidgets`, `desktop-app`, `desktop-application` | `electron`, `tauri`, `wails`, `pyqt`, `gtk` | `desktop framework`, `desktop application`, `cross-platform desktop` |
| State Management | `state-management` | `RefreshCw` | `state-management`, `redux`, `zustand`, `mobx`, `pinia`, `jotai`, `recoil`, `xstate`, `ngrx`, `vuex` | `redux`, `zustand`, `mobx`, `pinia`, `jotai`, `recoil`, `xstate` | `state management`, `state library`, `global state` |
| Data Visualization | `data-viz` | `LineChart` | `data-visualization`, `visualization`, `charting`, `d3`, `chart`, `plotly`, `recharts`, `echarts`, `grafana-plugin` | `d3`, `chart`, `plotly`, `recharts`, `echarts`, `nivo`, `visx` | `data visualization`, `charting library`, `chart library`, `interactive chart` |
| Animation Library | `animation` | `Sparkles` | `animation`, `motion`, `gsap`, `lottie`, `threejs`, `three-js`, `webgl`, `3d`, `framer-motion`, `anime` | `animation`, `gsap`, `lottie`, `three`, `framer-motion`, `anime` | `animation library`, `motion library`, `3d rendering`, `webgl` |
| Auth Library | `auth-library` | `Lock` | `passport`, `nextauth`, `lucia`, `supertokens`, `auth-library`, `authentication-library`, `jwt`, `oauth2` | `passport`, `nextauth`, `lucia`, `supertokens` | `authentication library`, `auth library`, `login system`, `oauth library` |

### 3. AI & ML (6 → 11)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| MLOps | `mlops` | `Workflow` | `mlops`, `mlflow`, `kubeflow`, `bentoml`, `model-serving`, `model-deployment`, `weights-and-biases`, `wandb`, `ml-pipeline` | `mlflow`, `kubeflow`, `bentoml`, `wandb`, `mlops` | `mlops`, `model serving`, `model deployment`, `ml pipeline`, `experiment tracking` |
| Computer Vision | `computer-vision` | `Eye` | `computer-vision`, `opencv`, `image-recognition`, `object-detection`, `yolo`, `detectron`, `image-processing`, `image-segmentation`, `ocr` | `opencv`, `yolo`, `detectron`, `tesseract`, `ocr` | `computer vision`, `object detection`, `image recognition`, `image processing`, `image segmentation` |
| NLP Tool | `nlp-tool` | `Languages` | `nlp`, `natural-language-processing`, `spacy`, `nltk`, `tokenizer`, `text-processing`, `sentiment-analysis`, `named-entity-recognition`, `text-classification` | `spacy`, `nltk`, `tokenizer`, `nlp` | `natural language processing`, `text processing`, `nlp library`, `tokenizer`, `sentiment analysis` |
| Vector DB / RAG | `vector-db` | `DatabaseZap` | `vector-database`, `vector-db`, `rag`, `retrieval-augmented`, `embeddings`, `chromadb`, `pinecone`, `weaviate`, `faiss`, `qdrant`, `milvus` | `chromadb`, `pinecone`, `weaviate`, `faiss`, `qdrant`, `milvus` | `vector database`, `vector search`, `retrieval augmented`, `embedding store`, `similarity search` |
| AI Coding | `ai-coding` | `CodeXml` | `ai-coding`, `code-assistant`, `copilot`, `code-generation`, `code-completion`, `ai-code`, `cursor`, `aider`, `continue-dev` | `copilot`, `cursor`, `aider`, `codeium`, `tabby` | `ai coding`, `code assistant`, `code completion`, `ai-powered coding` |

### 4. Learning (5 → 9)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| Interview Prep | `interview-prep` | `BriefcaseBusiness` | `interview`, `interview-questions`, `interview-preparation`, `leetcode`, `system-design`, `coding-interview`, `technical-interview`, `algo-practice` | `interview`, `leetcode`, `system-design-primer` | `interview preparation`, `interview questions`, `coding interview`, `system design interview` |
| Roadmap | `roadmap` | `Map` | `roadmap`, `developer-roadmap`, `learning-path`, `career-path`, `skill-tree` | `roadmap` | `developer roadmap`, `learning path`, `learning roadmap`, `career path` |
| Coding Challenge | `coding-challenge` | `Trophy` | `coding-challenge`, `coding-challenges`, `advent-of-code`, `project-euler`, `exercism`, `kata`, `competitive-programming`, `hackerrank`, `codewars` | `advent-of-code`, `exercism`, `euler`, `codewars`, `hackerrank` | `coding challenge`, `coding exercise`, `practice problems`, `competitive programming` |
| Research Paper | `research-paper` | `FileSearch` | `research`, `paper`, `papers`, `papers-with-code`, `arxiv`, `research-paper`, `paper-implementation`, `scientific-paper` | `paper`, `arxiv`, `papers-with-code` | `research paper`, `paper implementation`, `academic paper`, `arxiv paper` |

### 5. Editors & IDEs (6 → 10)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| Database Client | `db-client` | `Table2` | `database-client`, `database-gui`, `database-management`, `dbeaver`, `pgadmin`, `sql-client`, `database-tool`, `db-management` | `dbeaver`, `pgadmin`, `tableplus`, `beekeeper`, `dbgate`, `sqltools` | `database client`, `database gui`, `database management tool`, `sql client`, `database browser` |
| API Client App | `api-client-app` | `Send` | `api-client`, `rest-client`, `http-client`, `graphql-client`, `hoppscotch`, `insomnia`, `bruno` | `hoppscotch`, `insomnia`, `bruno`, `httpie` | `api client`, `rest client`, `http client`, `api testing tool` |
| Diff / Merge Tool | `diff-tool` | `GitCompareArrows` | `diff`, `diff-tool`, `merge-tool`, `code-diff`, `file-comparison` | `diff`, `meld`, `delta`, `difftastic` | `diff tool`, `merge tool`, `file comparison`, `code diff` |
| File Manager | `file-manager` | `FolderOpen` | `file-manager`, `file-browser`, `file-explorer`, `terminal-file-manager` | `ranger`, `nnn`, `yazi`, `mc`, `lf`, `broot` | `file manager`, `file browser`, `file explorer`, `directory browser` |

### 6. Language Projects (5 → 9)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| Language Server | `lang-server` | `Braces` | `language-server`, `lsp`, `language-server-protocol`, `rust-analyzer`, `gopls`, `typescript-language-server` | `rust-analyzer`, `gopls`, `lsp`, `language-server` | `language server`, `lsp implementation`, `language server protocol`, `code intelligence` |
| Type Checker | `type-checker` | `CheckCheck` | `type-checker`, `type-checking`, `typechecker`, `mypy`, `flow`, `type-system`, `type-inference` | `mypy`, `flow`, `pytype`, `type-checker`, `pyright` | `type checker`, `type checking`, `type system`, `type inference` |
| REPL | `repl` | `ChevronRightSquare` | `repl`, `interactive`, `interactive-shell`, `ipython`, `read-eval-print` | `repl`, `ipython`, `irb` | `repl`, `interactive shell`, `read-eval-print`, `interactive console` |
| Package Registry | `pkg-registry` | `Warehouse` | `package-registry`, `registry`, `npm-registry`, `verdaccio`, `crates-io`, `pypi`, `artifact-repository` | `verdaccio`, `registry`, `pypi` | `package registry`, `private registry`, `artifact repository`, `package repository` |

### 7. Infrastructure (7 → 13)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| Message Queue | `message-queue` | `Repeat2` | `message-queue`, `message-broker`, `kafka`, `rabbitmq`, `nats`, `zeromq`, `amqp`, `pub-sub`, `event-streaming`, `pulsar` | `kafka`, `rabbitmq`, `nats`, `zeromq`, `pulsar`, `celery` | `message queue`, `message broker`, `event streaming`, `pub/sub`, `async messaging` |
| CI/CD | `ci-cd` | `Rocket` | `ci-cd`, `ci`, `cd`, `continuous-integration`, `continuous-deployment`, `github-actions`, `jenkins`, `drone`, `woodpecker`, `gitlab-ci`, `circleci` | `jenkins`, `drone`, `woodpecker`, `circleci`, `github-actions` | `ci/cd`, `continuous integration`, `continuous deployment`, `build pipeline`, `deployment pipeline` |
| Search Engine | `search-engine` | `Search` | `search-engine`, `full-text-search`, `elasticsearch`, `meilisearch`, `typesense`, `solr`, `opensearch`, `lucene`, `search-index` | `elasticsearch`, `meilisearch`, `typesense`, `solr`, `opensearch`, `lunr` | `search engine`, `full-text search`, `search index`, `search server` |
| Auth / Identity | `auth-infra` | `KeyRound` | `identity`, `identity-provider`, `idp`, `keycloak`, `authentik`, `casdoor`, `zitadel`, `sso`, `single-sign-on`, `ldap`, `saml`, `oidc` | `keycloak`, `authentik`, `casdoor`, `zitadel`, `authelia` | `identity provider`, `identity management`, `single sign-on`, `authentication server`, `identity platform` |
| API Gateway | `api-gateway` | `Route` | `api-gateway`, `gateway`, `kong`, `traefik`, `apisix`, `api-management`, `api-proxy` | `kong`, `traefik`, `apisix`, `tyk` | `api gateway`, `api management`, `api proxy`, `gateway service` |
| Logging | `logging` | `ScrollText` | `logging`, `log`, `log-management`, `elk`, `loki`, `fluentd`, `fluentbit`, `logstash`, `structured-logging`, `syslog` | `loki`, `fluentd`, `fluentbit`, `logstash`, `graylog`, `vector` | `logging`, `log management`, `log aggregation`, `structured logging`, `log collector` |

### 8. Utilities (7 → 12)

| Sub-Type | ID | Icon | Topic Keywords | Name Keywords | Desc Keywords |
|---|---|---|---|---|---|
| Scraper / Crawler | `scraper` | `Radar` | `scraper`, `web-scraper`, `crawler`, `web-crawler`, `scraping`, `web-scraping`, `spider`, `crawlee`, `puppeteer`, `playwright`, `selenium` | `scrapy`, `crawlee`, `scraper`, `crawler`, `colly`, `spider` | `web scraper`, `web crawler`, `scraping tool`, `data scraping`, `site crawler` |
| File Converter | `file-converter` | `FileOutput` | `file-converter`, `converter`, `conversion`, `ffmpeg`, `pandoc`, `imagemagick`, `transcoding`, `media-converter`, `format-conversion` | `ffmpeg`, `pandoc`, `imagemagick`, `converter` | `file converter`, `format converter`, `media converter`, `transcoding tool`, `file conversion` |
| i18n / Localization | `i18n` | `Earth` | `i18n`, `internationalization`, `localization`, `l10n`, `i18next`, `formatjs`, `translation`, `multilingual`, `lingui` | `i18next`, `formatjs`, `lingui`, `i18n`, `polyglot` | `internationalization`, `localization`, `i18n library`, `translation tool`, `multilingual` |
| Config Tool | `config-tool` | `Settings` | `config`, `configuration`, `dotenv`, `env`, `config-management`, `cosmiconfig`, `hydra`, `viper`, `feature-flag`, `feature-flags` | `dotenv`, `cosmiconfig`, `hydra`, `viper`, `config` | `configuration tool`, `config management`, `environment variables`, `feature flags`, `configuration library` |
| Notification | `notification` | `Bell` | `notification`, `notifications`, `push-notification`, `ntfy`, `gotify`, `apprise`, `alert`, `push`, `web-push` | `ntfy`, `gotify`, `apprise`, `pushover`, `notifo` | `notification service`, `push notification`, `notification tool`, `alert service` |

## Classifier Ordering

The classifier uses a priority system: topics → name → description. Within each phase, more specific sub-types are checked before general catch-alls. The new sub-types slot into the existing order as follows:

### Structural Change: Bucket Check Order

The existing classifier checks buckets in this order: AI & ML → Learning → Frameworks → Language Projects → Dev Tools → Editors → Infrastructure → Utilities. To support the API three-way split (where Editors' `api-client-app` must be checked before Dev Tools' `api-tool`), the **Editors bucket must be checked before Dev Tools** in the topic phase. The new order: AI & ML → Learning → Frameworks → Language Projects → **Editors → Dev Tools** → Infrastructure → Utilities.

### Topic Phase Ordering (per bucket)

**AI & ML:** mlops → computer-vision → nlp-tool → vector-db → ai-coding → (existing: ml-framework → dataset → neural-net → ai-agent → prompt-lib → ai-model)

- `nlp-tool` must come before the general `ai-model` catch-all, which currently absorbs `nlp` and `natural-language-processing` topics
- `computer-vision` must come before `ai-model`, which currently absorbs `computer-vision` topics
- `vector-db` must come before `ai-model` to catch embedding/RAG repos

**Learning:** interview-prep → roadmap → coding-challenge → research-paper → (existing: awesome-list → book → tutorial → course → cheatsheet)

- `interview-prep` before `tutorial` (interview repos often have `learn`/`education` topics)
- `research-paper` before `book` (paper repos sometimes carry `book` topics)

**Frameworks:** desktop-framework → state-management → data-viz → animation → auth-library → (existing: css-framework → ui-library → web-framework → backend-framework → mobile-framework → game-engine)

- `desktop-framework` before `web-framework` (Electron/Tauri repos often have `javascript`/`react` topics)
- `auth-library` before `backend-framework` (passport/nextauth repos sometimes have `express`/`nextjs` topics)

**Dev Tools:** profiler → code-generator → doc-tool → static-analysis → api-tool → monorepo-tool → (existing: algorithm → testing → linter → formatter → build-tool → pkg-manager → debugger → vcs-tool)

**Editors:** db-client → api-client-app → diff-tool → file-manager → (existing: code-editor → ide → terminal → notebook → text-editor → design-tool)

- `api-client-app` in Editors checked before `api-tool` in Dev Tools and `api-client` in Utilities

**Language Projects:** type-checker → lang-server → repl → pkg-registry → (existing: compiler → transpiler → runtime → lang-impl → style-guide)

- `type-checker` before `lang-server` (pyright is both, but primarily a type checker)

**Infrastructure:** message-queue → ci-cd → search-engine → auth-infra → api-gateway → logging → (existing: container → devops → cloud-platform → database → monitoring → networking → blockchain)

- `ci-cd` before `devops` (more specific)
- `logging` before `monitoring` (more specific)
- `api-gateway` before `networking` (more specific)

**Utilities:** scraper → file-converter → i18n → config-tool → notification → (existing: cli-tool → plugin → boilerplate → library → api-client → platform → automation)

- `scraper` before `automation` (scraping keywords are unambiguous)

## Icon Collision Resolution

| Icon | Original Use | Resolved |
|------|-------------|----------|
| `BarChart3` | `ml-framework` | Use `LineChart` for `data-viz` |
| `Monitor` | `ide` | Use `AppWindow` for `desktop-framework` |
| `ShieldCheck` | `static-analysis` (new) | Use `CheckCheck` for `type-checker` |
| `TerminalSquare` | `terminal` | Use `ChevronRightSquare` for `repl` |
| `FlaskConical` | `testing` | Use `FileSearch` for `research-paper` |
| `Bug` | `debugger` | Use `Radar` for `scraper` |
| `Globe` | `platform` | Use `Earth` for `i18n` |
| `BookOpen` | `lang-projects` bucket icon | Use `NotebookText` for `doc-tool` |
| `DatabaseZap` | `database` | Shared with `vector-db` (intentional — both are databases) |
| `Workflow` | `devops` | Shared with `mlops` (intentional — both are ops/pipeline) |
| `ArrowRightLeft` | `transpiler` | Use `Repeat2` for `message-queue` |

## Overlap Disambiguation

### API Three-Way Split
- **Editors → `api-client-app`**: Standalone GUI apps for sending requests (Hoppscotch, Insomnia, Bruno). Uses app-specific topic keywords (`hoppscotch`, `insomnia`, `bruno`, `rest-client`, `http-client`, `graphql-client`).
- **Dev Tools → `api-tool`**: API design & documentation (Swagger, OpenAPI specs, Postman collections). Uses design-specific keywords (`swagger`, `openapi`, `postman`, `api-design`, `api-testing`).
- **Utilities → `api-client`**: Libraries/SDKs imported in code (Axios, node-fetch). Catches generic `api-client`, `sdk` topics.

Keywords are deduplicated: `hoppscotch`, `insomnia`, `bruno` appear ONLY in `api-client-app`; `swagger`, `openapi`, `postman` appear ONLY in `api-tool`. The classifier checks Editors topics before Dev Tools topics for these sub-types (requires reordering the Editors bucket check before Dev Tools in the topic phase).

### Auth Two-Way Split
- **Frameworks → `auth-library`**: Libraries you import in your app (Passport.js, NextAuth, Lucia). Uses library-specific topic keywords (`passport`, `nextauth`, `lucia`, `supertokens`, `auth-library`, `jwt`, `oauth2`).
- **Infrastructure → `auth-infra`**: Self-hosted identity servers (Keycloak, Authentik, Zitadel). Uses infrastructure-specific keywords (`identity`, `identity-provider`, `idp`, `keycloak`, `authentik`, `sso`, `ldap`, `saml`, `oidc`).

Generic topics like `auth`, `authentication`, `oauth`, `login` are NOT used by either sub-type to avoid ambiguity. Only specific library/infra names trigger classification.

### Logging vs Monitoring
- **Infrastructure → `logging`**: Log collection, aggregation, storage (Loki, Fluentd, ELK)
- **Infrastructure → `monitoring`**: Metrics, dashboards, alerting (Prometheus, Grafana, Datadog)

### CI/CD vs DevOps
- **Infrastructure → `ci-cd`**: Build/test/deploy pipelines (Jenkins, GitHub Actions, Drone)
- **Infrastructure → `devops`**: Infrastructure-as-code and orchestration (Terraform, Ansible, Kubernetes)

### Config Tool vs Automation
- **Utilities → `config-tool`**: App configuration management (dotenv, feature flags)
- **Utilities → `automation`**: Workflow automation tools (n8n, Zapier)

## Explicit Labels for Ambiguous Sub-Types

| ID | Label (for `REPO_BUCKETS`) |
|---|---|
| `vector-db` | `Vector DB` |
| `i18n` | `i18n` |
| `auth-infra` | `Auth / Identity` |
| `diff-tool` | `Diff Tool` |
| `api-client-app` | `REST Client` |
| `data-viz` | `Data Viz` |
| `ci-cd` | `CI/CD` |

All other sub-types use their "Sub-Type" column name as-is (e.g., "Profiler", "Code Generator", "Desktop Framework").

## Testing Strategy

Each new sub-type needs at minimum:
1. One topic-based classification test
2. One name-based classification test (where name keywords exist)
3. One description-based classification test (where description keywords exist)
4. Priority/ordering tests for overlap cases (API split, auth split, etc.)

### Existing Tests That Must Be Updated

The following existing tests assert classifications that will change with the new sub-types:
- `computer-vision` topic: currently asserts `ai-ml/ai-model` → update to `ai-ml/computer-vision`
- `nlp` topic: currently asserts `ai-ml/ai-model` → update to `ai-ml/nlp-tool`
- `natural-language-processing` topic: currently asserts `ai-ml/ai-model` → update to `ai-ml/nlp-tool`

These topics are being promoted from the generic `ai-model` catch-all to their own dedicated sub-types. The `computer-vision` and `nlp`/`natural-language-processing` keywords must be **removed** from the existing `ai-model` topic check and placed in the new sub-type checks instead.

## Summary

| Bucket | Before | After | New Sub-Types |
|--------|--------|-------|---------------|
| Dev Tools | 8 | 14 | profiler, code-generator, doc-tool, static-analysis, api-tool, monorepo-tool |
| Frameworks | 6 | 11 | desktop-framework, state-management, data-viz, animation, auth-library |
| AI & ML | 6 | 11 | mlops, computer-vision, nlp-tool, vector-db, ai-coding |
| Learning | 5 | 9 | interview-prep, roadmap, coding-challenge, research-paper |
| Editors & IDEs | 6 | 10 | db-client, api-client-app, diff-tool, file-manager |
| Language Projects | 5 | 9 | lang-server, type-checker, repl, pkg-registry |
| Infrastructure | 7 | 13 | message-queue, ci-cd, search-engine, auth-infra, api-gateway, logging |
| Utilities | 7 | 12 | scraper, file-converter, i18n, config-tool, notification |
| **Total** | **50** | **89** | **39** |
