# CLAUDE.md, friendly-regex Context File

> **Purpose.** Hard copy of project context for Claude Code sessions. Auto-loads at session start, eliminates cold-start exploration cost, and captures non-obvious gotchas that are otherwise only recoverable by reading commit history. Optimized for Claude as the primary reader: dense, scannable, file-path-rich, no prose where a table suffices.
>
> **Last updated:** 2026-06-12 against branch `main` (hidden-tags refill + visible-space counts rework).
> **Refresh trigger:** Update sections 13, 14, 15 whenever a feature ships that changes wiring, gotchas, or vocabulary.

---

## 1. Project Mission

The repo is the **Transaction Enrichment Portal** (TEP), a banking-domain SPA. Operators check out per-bank/per-side transaction libraries, build **TagSpec** rule definitions that match incoming transactions via regex/numeric/date conditions, extract structured **Attributes** from matched rows, and sync the resulting library back to the TEP backend. Audit role gets read-only across the app; DevOps role additionally sees an Integration Logs surface. The product replaces a legacy C# tagging tool (still present in `backend/` for reference only).

## 2. Tech Stack

| Concern            | Choice                                                                 |
|--------------------|------------------------------------------------------------------------|
| UI framework       | React 19.1, function components, ref-as-prop, no `forwardRef`/`React.FC` |
| Language           | TypeScript 5.8 strict (`noUnusedLocals`, `noUnusedParameters`)         |
| Build tool         | Vite 6.3 with `@tailwindcss/vite` plugin                                |
| Styling            | Tailwind CSS 4.1, class-based dark mode via `@custom-variant dark`     |
| State              | React Context only (no Redux, Zustand, MobX). Reducers for tag mutations. |
| Routing            | None. Single-page tab UI (`TabContainer` in `src/components/layout/`).  |
| DnD                | `@dnd-kit/core`, `sortable`, `modifiers`, `utilities`                  |
| Floating UI        | `@floating-ui/react` (popovers, dropdowns, tooltips)                    |
| Animation          | `motion` v12                                                           |
| Onboarding         | `intro.js` v8                                                           |
| Background visuals | `@tsparticles/react` + `@tsparticles/slim` (login page only)            |
| Testing            | Vitest 3.2 + `happy-dom` (default) or `jsdom` + Testing Library + jest-dom |
| Linting            | ESLint 9.25 flat config (React Hooks + React Refresh + typescript-eslint) |
| Deploy             | Vercel. `vercel.json` rewrites `/api/identity` and `/api/tep` to backend hosts. |
| Security posture   | No CSP yet. Tokens in `localStorage`. No `dangerouslySetInnerHTML` anywhere. |

## 3. Build / Dev / Test Commands

| Command                     | What it does                                                     |
|-----------------------------|------------------------------------------------------------------|
| `npm run dev`               | Vite dev server. Proxies `/api/identity` and `/api/tep` from `.env`. |
| `npm run build`             | `tsc -b && vite build`. Will fail on any TS error.                |
| `npm run preview`           | Serve `dist/` locally.                                            |
| `npm run lint`              | ESLint over the whole repo.                                       |
| `npm run test`              | Vitest single-shot run.                                           |
| `npm run test:coverage`     | Vitest with v8 coverage (text + json-summary). Scoped to `src/utils/**`, `src/types/tagSpec.ts`, `src/components/shared/**`. |
| `npm run generate-stats`    | `node scripts/generate-bank-stats.mjs`, pre-build analytics dump. |

Setup file: [src/test-setup.ts](src/test-setup.ts) (Testing Library cleanup hook). Test pattern: co-located `*.test.ts(x)` in the same folder as implementation.

## 4. Environment

`.env` at repo root carries:

- `VITE_IDENTITY_API_URL`. Identity service base (default prod: `https://identity.swittlelab.com`).
- `VITE_TEP_API_URL`. TEP service base (default prod: `https://tepapi.swittlelab.com`).
- `VITE_TEP_API_KEY`. Static API key for TEP service (sent in `TepHeaders`).

Vite dev proxy and Vercel rewrites both map `/api/identity` and `/api/tep` to those targets, so client code calls relative paths and the same code works in dev and prod.

## 5. Top-Level Directory Map

| Path                           | Purpose                                                                            |
|--------------------------------|------------------------------------------------------------------------------------|
| [src/](src/)                   | Application source (see section 7).                                                |
| [src/api/](src/api/)           | HTTP client layer. One file per backend resource. Returns parsed payloads.         |
| [src/components/](src/components/) | Feature-grouped React components (16 sub-folders).                              |
| [src/context/](src/context/)   | React Context providers (8 files).                                                 |
| [src/hooks/](src/hooks/)       | Custom hooks (12 files).                                                           |
| [src/types/](src/types/)       | Type definitions for core domain objects (TagSpec, transaction, comments, etc.).   |
| [src/utils/](src/utils/)       | Pure utilities (regex compilation, rule evaluation, attribute extraction, etc.). Heavily tested. |
| [src/constants/](src/constants/) | Field catalogs, operation lists, LOV config.                                     |
| [src/data/](src/data/)         | Sample JSON datasets used by sample-data mode.                                     |
| [docs/](docs/)                 | `FEATURES.md`, `code-review.md`, design specs in `docs/superpowers/specs/`.        |
| [scripts/](scripts/)           | Build/report generators: `generate-bank-stats.mjs`, `generate-docx.cjs`, `generate-pdf.cjs`. |
| [backend/](backend/)           | Legacy C# `TagSpecAnalyzer.cs`. Reference only. Do not modify.                     |
| [public/](public/)             | Static assets served at root by Vite.                                              |
| [dist/](dist/)                 | Vite build output. Gitignored except occasional snapshots.                         |
| `vite.config.ts`               | Bundler, dev proxy, Tailwind plugin.                                               |
| `vitest.config.ts`             | Test runner, coverage scope.                                                       |
| `tsconfig.app.json`            | App TS config: ES2020, strict, React JSX, no unused.                              |
| `tsconfig.node.json`           | Node-side TS (config files, scripts).                                              |
| `eslint.config.js`             | Flat config with React Hooks + Refresh + typescript-eslint.                        |
| `vercel.json`                  | Framework declaration + API rewrites.                                              |
| `.impeccable.md`               | Style guide (read this if making UI polish changes).                               |

## 6. Domain Glossary

The vocabulary below is mandatory context. Skipping it produces wrong code.

- **TagSpecDefinition** ("tag rule" / "TagSpec"). The atomic rule object. Binds a tag name (e.g. `SWIFT_TRANSFER`) to (a) matching conditions, (b) attribute extractions, (c) lifecycle metadata (status, certainty, validity). Defined in [src/types/tagSpec.ts](src/types/tagSpec.ts).
- **TagSpecLibrary**. Container that groups TagSpecDefinitions by bank/side (the **Context** entries below). Lifecycle: `INPROGRESS` (someone has it checked out) -> `RELEASED` (no one owns it) -> `CHECKED-IN` (final). Saved as a unit through [src/api/tagSpecSave.ts](src/api/tagSpecSave.ts).
- **Context** (`ContextEntry[]`). Key/value pairs scoping the tag to a specific bank/side/transaction-type combination: `BankSwiftCode`, `Side` (CR/DR/RC/RD), `TransactionTypeCode`. Locked in the wizard when the user came from a checked-out library.
- **TagRuleExpressions** (`AndGroup[]`). Top-level array is **OR-ed**. Each `AndGroup` is a list of conditions, **AND-ed**. To match a row, at least one group must match in full.
- **AndGroup / Condition**. A condition has `sourceField`, `operation` (from `MATCH_OPERATIONS`: `contains`, `equals`, `begins_with`, `greater_than`, etc.), and `value` (or `values[]` for multi-select). Compiled to regex by [src/utils/regexify.ts](src/utils/regexify.ts). Numeric/date GT/LT compile into a regex with embedded `__NUMERIC_GT:value` sentinels and ISO-date anchoring.
- **TagAttribute**. Named extraction nested inside a TagSpec. Fields: `AttributeTag` (name), `SourceField` (which transaction field to read), `AttributeRuleExpression` (regex + optional `ExpressionPrompt`), `IsMandatory`, `ValidationRuleTag`, `LOVTag`, `Transformations[]`.
- **Extraction Methods**. The set of strategies in `ExtractionMethodDef`: `extract_between`, `extract_after`, `extract_before`, `extract_matching` (with capture groups), `extract_between_and_verify`, `extract_substring`, `extract_last_n_chars`, plus `lov:<TAG>` (match against a LOV list).
- **Transformation**. Optional post-extraction step (e.g. uppercase, substring, pad). Compiled by [src/utils/transformations.ts](src/utils/transformations.ts).
- **LOV (List of Values)**. Master data: standardized lookup lists (`BANKS`, `COUNTRIES`, `SADAD_BILLERS`, `EXTRACTIONS`, etc.) Used (a) as extraction templates, (b) as validation refs (`ValidationRuleTag`), (c) for friendly labels in the UI via [src/utils/humanizeLovTag.ts](src/utils/humanizeLovTag.ts). Three internal tags (`ATTRIBUTES`, `ATTRIBUTE_TRANSFORMATION`, `EXTRACTIONS`) are hidden from the operator-facing LOV browser.
- **Checkout / Release / Check-in**. The library locking flow. Operator checks out a bank/side, edits in-place (state lives in `useLocalChanges` until they sync), then releases or checks in. Operator ID is stored in `OperatorId` on the library and on each draft definition.
- **Hidden TagSpec**. Client-side per-row hide implemented by `OpsTagSpecDefinitionId` (not by tag name; see commit `9f7251e`). State survives full tab navigation (see gotcha #1).
- **Definition Versions**. When two definitions in the same library share a tag name, the UI shows a version overlay on the tag pill (see [src/utils/definitionVersions.ts](src/utils/definitionVersions.ts)).
- **TepHeaders**. The standard header bundle (`apiKey`, `userId`, `tenantCode`, `languageCode`, `timeZone`, `requestId`) every TEP call carries. Built in `AppContent` from `.env` + `TepConfigContext`. Constructed in 9 different call sites today; refactor candidate `useTepHeaders()`.

## 7. App Bootstrap & State Architecture

Entry chain:

1. [index.html](index.html). Sets dark mode early via inline script reading `theme_preference` from `localStorage`; mounts `/src/main.tsx`.
2. [src/main.tsx](src/main.tsx). Creates the React root, wraps `<App />` in `ThemeProvider` and `AuthProvider`.
3. [src/App.tsx](src/App.tsx). Wraps in `TepConfigProvider`, then `AppContent`. `AppContent` checks auth status: renders `LoginPage` or `AppShell`.
4. `AppShell`. `TabContainer` switches between `StatsTab`, `TransactionsTab`, `IntegrationLogsTab` (devops-only when `isLiveMode`), `SettingsTab`. Renders global surfaces: `CheckoutBanner`, `OnboardingHub`, notifications bell, comment thread side panel.

Provider stack (outer -> inner):

`ThemeContext` -> `AuthContext` -> `TepConfigContext` -> `TagSpecContext` -> `TransactionDataContext` -> `LovAttributesContext` -> `CommentsContext`.

| Context                  | What it owns                                                                   | File                                                                  |
|--------------------------|--------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| `ThemeContext`           | Light/dark, persisted in `localStorage`                                        | [src/context/ThemeContext.tsx](src/context/ThemeContext.tsx)          |
| `AuthContext`            | User identity, token, refresh, role, inactivity timeout, devops/audit checks  | [src/context/AuthContext.tsx](src/context/AuthContext.tsx)            |
| `TepConfigContext`       | TEP headers and live-mode toggle                                               | [src/context/TepConfigContext.tsx](src/context/TepConfigContext.tsx)  |
| `TagSpecContext`         | TagSpec library state, checkout lock, reducer mutations                        | [src/context/TagSpecContext.tsx](src/context/TagSpecContext.tsx)      |
| `TransactionDataContext` | Live transaction list, filters, pagination, hidden TagSpecs                    | [src/context/TransactionDataContext.tsx](src/context/TransactionDataContext.tsx) |
| `LovAttributesContext`   | LOV catalog. **Reference impl for memoized provider value.**                    | [src/context/LovAttributesContext.tsx](src/context/LovAttributesContext.tsx) |
| `CommentsContext`        | Comment threads, mentions, unread counts                                       | [src/context/CommentsContext.tsx](src/context/CommentsContext.tsx)    |

**Important.** Token handling lives in `AuthContext` with three-tier inactivity timeout (30 / 25 / 5 minutes, see gotcha #7) and proactive token refresh via `setInterval`. Search marker `BACKEND-WORKAROUND(role-from-usersinfo)` in that file documents an active backend workaround (gotcha #6).

## 8. Feature Catalog by Tab

### 8.1 Backlog Tab (`StatsTab`)

Bank/side library checkout dashboard. Shows each active bank/side library with current owner, tagging progress (`TotalTransactions`, `ProcessedTransactions`), cleanup counts (Clean / Issues / Untagged), and status (INPROGRESS, READY, CHECKED-IN). Actions: **Checkout**, **Release**, **Check-in**. Drill into a library to see a `ComparisonModal` (diff against a previous version) or open the `RollbackDialog`.

| File                                                                                          | Role                                  |
|-----------------------------------------------------------------------------------------------|---------------------------------------|
| [src/components/stats/StatsTab.tsx](src/components/stats/StatsTab.tsx)                         | Tab root, layout, refresh             |
| [src/components/stats/CheckoutBanner.tsx](src/components/stats/CheckoutBanner.tsx)             | Cross-tab banner for current checkout |
| [src/components/stats/ComparisonModal.tsx](src/components/stats/ComparisonModal.tsx)           | Diff modal                            |
| [src/components/stats/TaggingStatsCell.tsx](src/components/stats/TaggingStatsCell.tsx)         | Progress cell                         |
| [src/hooks/useTagSpecs.ts](src/hooks/useTagSpecs.ts)                                           | Library fetch                         |
| [src/api/checkout.ts](src/api/checkout.ts)                                                     | Checkout/release/check-in calls       |
| [src/api/tagSpecs.ts](src/api/tagSpecs.ts)                                                     | Library list, stats                   |

### 8.2 Transactions Tab (`TransactionsTab` + `TransactionTable`)

The primary tagging surface. Operator browses transactions matching the checked-out bank/side, filters, hides irrelevant tags, opens the wizard to create or edit definitions, and inspects matching definitions on each row.

Features:

- **Dynamic filters** (`DynamicFilters`): per-field dropdowns plus numeric range sliders. Filter definitions come from the backend; new tag names are added by the post-sync refetch (gotcha #4).
- **Column picker**: visibility toggle for data + attribute + computed columns. Defaults in `DEFAULT_VISIBLE_COLUMN_KEYS`. Currently inlined in `TransactionTable` (~380 LoC; extract candidate).
- **Dual-mode pagination**: both modes are windows over ONE loaded prefix buffer driven by `useVisibleRowsEngine.ensureVisible(target)`. Incremental mode renders the whole visible buffer with "+N" / "Show all" extensions; classic mode slices visible rows at 50-row boundaries client-side (`goToPage(k)` ensures `(k+1)*50` visible rows first, page count = `ceil(totalShowing / 50)`, page index clamps when a hide shrinks the total). No per-page server fetches (gotcha #2).
- **Tag badges** with drill-down: click a tag badge -> filter table to rows matching that definition + open `TagDetailPanel`.
- **Dead-end flag**: mark rows that cannot be tagged today. Bulk-set comments via right-click context menu.
- **Hidden tags side panel** (`HiddenTagsPanel`): list of hidden TagSpecs with Unhide / Unhide All.
- **Comments**: inline `CommentDialog` per row, plus `CommentIconButton` indicators.
- **Share link**: capture a snapshot of filter + selection state into a shareable URL via [src/utils/shareLink.ts](src/utils/shareLink.ts). Banner via `SharedLinkBanner`.
- **Sample-data mode**: load fixture data from `src/data/` when no live data is available.
- **Search highlighting**: matched text segments highlighted in cells.

| File                                                                                                                      | Role                                          |
|---------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------|
| [src/components/transactions/TransactionsTab.tsx](src/components/transactions/TransactionsTab.tsx)                         | Tab root (1,473 LoC god component; debt)      |
| [src/components/transactions/TransactionTable.tsx](src/components/transactions/TransactionTable.tsx)                       | Table + ColumnPicker (1,725 LoC; debt)        |
| [src/components/transactions/DynamicFilters.tsx](src/components/transactions/DynamicFilters.tsx)                           | Filter dropdowns                              |
| [src/components/transactions/HintsInfoIcon.tsx](src/components/transactions/HintsInfoIcon.tsx)                             | Backend-provided hints                        |
| [src/components/transactions/TagBadge.tsx](src/components/transactions/TagBadge.tsx)                                       | Inline tag pill with version overlay          |
| [src/components/transactions/TagDetailPanel.tsx](src/components/transactions/TagDetailPanel.tsx)                           | Right-side definition drawer                  |
| [src/components/transactions/CommentDialog.tsx](src/components/transactions/CommentDialog.tsx)                             | Comment composer                              |
| [src/components/transactions/RowContextMenu.tsx](src/components/transactions/RowContextMenu.tsx)                           | Bulk comment + flag actions                   |
| [src/components/transactions/ViewContextModal.tsx](src/components/transactions/ViewContextModal.tsx)                       | Inspect raw context fields                    |
| [src/components/transactions/AttributeDisplay.tsx](src/components/transactions/AttributeDisplay.tsx)                       | Inline attribute value rendering              |
| [src/hooks/useTransactionData.ts](src/hooks/useTransactionData.ts)                                                         | Fetch + filter + paginate                     |
| [src/hooks/useLocalChanges.ts](src/hooks/useLocalChanges.ts)                                                               | Draft TagSpec changes pre-sync                |
| [src/hooks/useMatchingTagIds.ts](src/hooks/useMatchingTagIds.ts)                                                           | Per-row matching definitions                  |
| [src/hooks/useTagSampleTransactions.ts](src/hooks/useTagSampleTransactions.ts)                                             | Sample rows for a tag                         |
| [src/hooks/useTransactionAnalysis.ts](src/hooks/useTransactionAnalysis.ts)                                                 | Aggregate matching stats                      |
| [src/utils/analyzeRow.ts](src/utils/analyzeRow.ts)                                                                         | Match a row against all defs                  |
| [src/utils/buildRulesetFilters.ts](src/utils/buildRulesetFilters.ts)                                                       | Compile filter form -> server filter object   |
| [src/utils/translateFilters.ts](src/utils/translateFilters.ts)                                                             | Filter labelling                              |
| [src/api/transactions.ts](src/api/transactions.ts)                                                                         | Transaction fetch with filters/pagination     |

### 8.3 Integration Logs Tab (`IntegrationLogsTab`)

Visible only when `isLiveMode && isDevops`. Shows backend background tagging jobs with run details, errors, and a Rerun action (gated per-endpoint outcome, see commit `83f674f`). File: [src/components/integrationLogs/IntegrationLogsTab.tsx](src/components/integrationLogs/IntegrationLogsTab.tsx).

### 8.4 Settings Tab (`SettingsTab`)

Master-detail config UI. Four sub-tabs accessed via left sidebar:

| Sub-tab          | What it manages                                                                            | Primary file                                                                                            |
|------------------|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Tags Hierarchy   | Tree of tag names. Add/rename/move. Sync to backend on save.                                | [src/components/tagsHierarchy/TagsHierarchyTab.tsx](src/components/tagsHierarchy/TagsHierarchyTab.tsx)    |
| Attributes       | Global attribute catalog with name/value/LOV link.                                          | [src/components/attributes/AttributesPage.tsx](src/components/attributes/AttributesPage.tsx)             |
| Extractions      | EXTRACTIONS LOV management page (added in `1d316d9`).                                        | [src/components/extractions/ExtractionsPage.tsx](src/components/extractions/ExtractionsPage.tsx)         |
| LOVs             | Browser for all LOV categories; hides internal tags.                                        | [src/components/lovs/LovsPage.tsx](src/components/lovs/LovsPage.tsx)                                     |

Sync-before-leave guard: when the user has unsynced hierarchy changes and navigates away, a confirm dialog asks them to sync first (see `3177e37`).

## 9. Tag Wizard Flow

`TagWizardModal` is the 4-step rule builder. Trigger points: from Transactions tab toolbar, from a tag pill (edit existing), from the rule preview side panel (new from row).

| Step                | Component                                                                                                                              | What it does                                                                                                              |
|---------------------|----------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| 1. Basic info       | [src/components/wizard/StepBasicInfo.tsx](src/components/wizard/StepBasicInfo.tsx) + `TagTreePicker`                                    | Tag name, bank, side, transaction type (locked if from checkout), status, certainty, validity dates                       |
| 2. Rule expressions | [src/components/wizard/StepRuleExpressions.tsx](src/components/wizard/StepRuleExpressions.tsx) + `RuleGroupEditor` + `ConditionEditor` | Add AND groups (OR'd at the top level). Conditions chosen from `MATCH_OPERATIONS`. Duplicate detection gates Next.        |
| 3. Attributes       | [src/components/wizard/StepAttributes.tsx](src/components/wizard/StepAttributes.tsx) + `TransformationList`                            | Add attributes, pick extraction method, optional LOV link, mandatory marker, transformations.                            |
| 4. Review           | [src/components/wizard/StepReview.tsx](src/components/wizard/StepReview.tsx)                                                            | Final diff/summary. Calls `onSave`.                                                                                       |

**Key hook**: [src/hooks/useWizardForm.ts](src/hooks/useWizardForm.ts) owns `formState`, navigation gating, and `toTagSpecDefinition` conversion. `fromExistingDefinition` calls `cloneRulesAndAttributesFrom` on edit.

**Duplicate Rules from Tag**: [src/components/wizard/DuplicateRulesButton.tsx](src/components/wizard/DuplicateRulesButton.tsx) opens [src/components/wizard/SourceTagPickerModal.tsx](src/components/wizard/SourceTagPickerModal.tsx). Selecting a source clones its rules and attributes into the current wizard state (drops `_originalRegex`, regenerates IDs). Design: [docs/superpowers/specs/2026-05-13-duplicate-rules-from-tag-design.md](docs/superpowers/specs/2026-05-13-duplicate-rules-from-tag-design.md).

**Key utilities**: [src/utils/regexify.ts](src/utils/regexify.ts), [src/utils/cloneRulesAndAttributes.ts](src/utils/cloneRulesAndAttributes.ts), [src/utils/ruleFingerprint.ts](src/utils/ruleFingerprint.ts), [src/utils/attributeFingerprint.ts](src/utils/attributeFingerprint.ts).

## 10. Validation & Duplicate Detection

Two separate validation scopes; do not conflate them:

1. **Per-tag duplicates** (inside the rule builder). Detects duplicate conditions within a group, duplicate rule sets, and duplicate attribute names. Surfaces red banners on offending rows and disables inline Save plus top-level Create/Save. First occurrence is clean; only later duplicates are flagged. Empty `+Add` placeholder rows are excluded. Design: [docs/superpowers/specs/2026-05-14-block-duplicate-rules-attributes-design.md](docs/superpowers/specs/2026-05-14-block-duplicate-rules-attributes-design.md). Implementation in `ruleFingerprint.ts` + `attributeFingerprint.ts`.
2. **Global attribute registry** (in `AttributeFormModal`). Blocks duplicate attribute Value across the whole tenant.

Field validation: required fields gate Next on each step. `ec2cef7` introduced typed value input + Save gating on missing fields. `9ad97a8` blocks save on incomplete rule builder rows.

## 11. API Layer

All files in [src/api/](src/api/) follow the pattern: build TepHeaders, fetch, parse, throw `ApiError` on non-OK status.

| File                                                                            | Purpose                                                              |
|---------------------------------------------------------------------------------|----------------------------------------------------------------------|
| [src/api/transactions.ts](src/api/transactions.ts)                              | Transaction list with filters, sorting, pagination. Hot path.        |
| [src/api/tagSpecs.ts](src/api/tagSpecs.ts)                                      | Library list, stats, single library fetch.                            |
| [src/api/tagSpecSave.ts](src/api/tagSpecSave.ts)                                | Persist library changes. Library save must be awaited before refetch (`103add0`). |
| [src/api/checkout.ts](src/api/checkout.ts)                                      | Checkout / release / check-in / rollback.                             |
| [src/api/tagsHierarchy.ts](src/api/tagsHierarchy.ts)                            | Tag hierarchy CRUD + sync.                                            |
| [src/api/lovAttributes.ts](src/api/lovAttributes.ts)                            | LOV catalog fetch and item CRUD.                                      |
| [src/api/comments.ts](src/api/comments.ts)                                      | Comments + replies + mentions.                                        |
| [src/api/notifications.ts](src/api/notifications.ts)                            | Notifications fetch + ack.                                            |
| [src/api/extractions.ts](src/api/extractions.ts)                                | EXTRACTIONS LOV CRUD.                                                 |
| [src/api/identity.ts](src/api/identity.ts)                                      | Login, 2FA, `/userinfo`, `/usersinfo` (workaround), token refresh.    |
| [src/api/apiError.ts](src/api/apiError.ts)                                      | Error parsing. Uses `any` today; refactor to `unknown`.               |

TepHeaders are built in `AppContent` and passed down through props in 9 sites. Consolidating into a `useTepHeaders()` hook is in the code-review backlog.

## 12. Test Patterns

- **Co-located.** Tests live next to implementation as `*.test.ts` or `*.test.tsx`. Never put tests in a separate `__tests__` folder.
- **Setup.** [src/test-setup.ts](src/test-setup.ts) registers `afterEach(cleanup)` from Testing Library and imports `@testing-library/jest-dom`.
- **Coverage scope** (vitest.config.ts): `src/utils/**`, `src/types/tagSpec.ts`, `src/components/shared/**`. Components outside `shared/` are not in the coverage report by default.
- **Environment.** `happy-dom` by default; `jsdom` available for tests that need fuller DOM behavior.
- **Strong examples to mirror** when writing new tests:

  | Pattern                     | Reference test                                                                                              |
  |-----------------------------|--------------------------------------------------------------------------------------------------------------|
  | Pure utility, table-driven  | [src/utils/regexify.test.ts](src/utils/regexify.test.ts)                                                     |
  | Rule evaluation             | [src/utils/evaluateRuleSet.test.ts](src/utils/evaluateRuleSet.test.ts)                                       |
  | Cloning + ID regeneration   | [src/utils/cloneRulesAndAttributes.test.ts](src/utils/cloneRulesAndAttributes.test.ts)                       |
  | Label humanization          | [src/utils/humanizeLovTag.test.ts](src/utils/humanizeLovTag.test.ts)                                         |
  | Defensive array shape       | [src/utils/getHints.test.ts](src/utils/getHints.test.ts)                                                     |
  | Shared component (UI)       | [src/components/shared/Modal.test.tsx](src/components/shared/Modal.test.tsx)                                 |
  | Context with auth flow      | [src/context/AuthContext.test.tsx](src/context/AuthContext.test.tsx)                                         |
  | End-to-end extraction       | [src/utils/extractionEndToEnd.test.ts](src/utils/extractionEndToEnd.test.ts)                                 |

## 13. Gotchas & Non-Obvious Patterns

Read this section before touching transactions, wizard, or auth code. Every item below has bitten the project before.

1. **Hidden TagSpecs survive tab navigation** (commit `cd2e253`). When the user hides definitions in the Transactions tab and switches tabs, the hidden state must persist through the full switch-and-back cycle. Implementation: `hiddenDefIds` state + sessionStorage (`tep:hiddenDefIds`) in `TransactionsTab` (NOT in `TransactionDataContext`), restored via the useState lazy initializer. The visible-row target (`tep:targetVisible`) persists the same way inside `useVisibleRowsEngine`. Do not reset either on `TransactionsTab` remount.
2. **SUPERSEDED 2026-06-12 — hidden-tag exclusion is server-side via a DUAL QUERY, and all pagination/count numbers run in VISIBLE space.** The old convention (footer subtracts hidden, action buttons stay raw, commits `1a912a3`/`1ad11d4`) is gone. `replaceFromBeginningExcluding` in [src/context/TransactionDataContext.tsx](src/context/TransactionDataContext.tsx) fires TWO parallel queries and merges them in sort order (`mergeSortedRows`): (A) tagged-visible — active filters + TWO separate `NI` properties `{ColumnName:'OpsTagSpecDefinitionId',Operand:'NI'}` AND `{ColumnName:'OpsMultiTags.TagSpecDefinitionId',Operand:'NI'}` (pipe-joined ids; the ONLY payload that drops multi-tag-hidden rows — the single COMPOSITE column `OpsTagSpecDefinitionId|OpsMultiTags.TagSpecDefinitionId` ignored the array and leaked them, 230/250, do NOT revert); (B) untagged — active filters + `{OpsIsUntagged EQ True}`. Half B is REQUIRED because `NI` is false for NULL columns, so half A drops untagged rows (the bd1267f trap); the halves are disjoint. The two `TransactionsCount`s SUM to the EXACT visible total (`totalShowing`); "N hidden" = unfilteredTotal − visibleTotal (one background count call). [src/hooks/useVisibleRowsEngine.ts](src/hooks/useVisibleRowsEngine.ts) owns the target/refill/counts. The two `NI` filters EXCLUDE mixed-tag rows entirely (a hidden multi-tag fails NI), so `displayAnalyzedData`'s hidden-strip in [src/components/transactions/TransactionsTab.tsx](src/components/transactions/TransactionsTab.tsx) is a no-op safety net in live mode (it matters only if the server ever keeps a mixed row). The client-side `isRowHidden` row-drop pass + `hiddenLoadedCount` run in SAMPLE mode only (live mode trusts the server). `targetVisible` is the incremental DISPLAY window (`visibleData` slices to it), never shrunk by a hide; **unhide / unhide-all reset it to PAGE_SIZE (50)** and refetch. It is NOT persisted: leaving the Transactions tab (unmount) and returning resets the view to the initial 50 regardless of prior +N / Show all (a ref carries it WITHIN a tab session so filter changes keep the window; only unmount drops it). The footer "loaded" count tracks the loaded BUFFER (`transactions.length`), not `filteredData.length` — the latter is built from the chunked `analyzeRow` pass and made Show all appear to load "in increments of 500" while rows were merely being analyzed. The virtualizer must re-sync on data change (gotcha #25). Design: [docs/superpowers/specs/2026-06-12-hidden-tags-refill-design.md](docs/superpowers/specs/2026-06-12-hidden-tags-refill-design.md).
3. **Hide is by `OpsTagSpecDefinitionId`, not by tag name** (commit `9f7251e`). Two definitions with the same name can be hidden independently.
4. **Tag filter dropdown refetch after sync** (commit `0f19435`). After the user syncs new tags to the backend, immediately refetch filter definitions or new tags will not appear in the Transactions tab dropdown for 10+ seconds.
5. **Attribute Save button is visible-but-disabled** when required fields are empty (commit `b56f10a`). Do not hide the button. Mandatory markers must appear next to field labels.
6. **Backend workaround: role from `/usersinfo`**. `/api/identity/auth/userinfo` does not return the role field. Code falls back to `/usersinfo` (all-users list) to find the current user's role. Search marker: `BACKEND-WORKAROUND(role-from-usersinfo)` in [src/context/AuthContext.tsx](src/context/AuthContext.tsx). Memory entry: [`project_role_from_usersinfo_fallback.md`](C:/Users/nadim/.claude/projects/c--Users-nadim-OneDrive-Desktop-friendly-regex/memory/project_role_from_usersinfo_fallback.md). Revert when backend ships the fix; otherwise the devops badge and Integration Logs tab will break.
7. **Inactivity timeout is three-tier**: 30 min idle -> warning, 25 min remaining -> countdown, 5 min remaining -> auto-logout (commit `57fee78`). Proactive token refresh (commit `73b46c9`) keeps the warning timely for idle users. The old behavior of showing the warning only on next interaction was broken for stationary users.
8. **Context provider values not memoized** in `TransactionDataContext` and `AuthContext`. Any state change re-creates the provider value, which re-renders the whole tree (50 table rows x N columns is expensive). [src/context/LovAttributesContext.tsx](src/context/LovAttributesContext.tsx) is the existing memoized pattern to copy.
9. **ReDoS exposure**. User-supplied regex is evaluated on the main thread in [src/utils/evaluateRuleSet.ts](src/utils/evaluateRuleSet.ts) and [src/utils/extractAttributes.ts](src/utils/extractAttributes.ts). No `safe-regex` validator and no Web Worker timeout yet. Tracked in `docs/code-review.md`.
10. **Decimal thresholds + numeric/date GT/LT** (commits `b34b612`, `2a04189`, `3d176ec`, `dd86221`). Numeric and date comparisons compile into regex with embedded sentinels (`__NUMERIC_GT:value`) so they can be sent to the backend as a single `REGEX` operand. Date conditions are ISO-anchored. When adding new comparison operations, keep the round-trip discipline.
11. **Extractions round-trip via Value field** (commits `b3512b0`, `972832c`). Extraction regex is stored on the `Value` field of the attribute (no separate `Tags` array). LOV-wrapped extractions drop the trailing `$` anchor.
12. **Edit-mode attribute tooltip diff** (design spec `2026-04-23-edit-attribute-tooltip-design.md`). When editing an existing definition's attribute, the tooltip shows saved-vs-draft with character-level diff. New attributes show single-rule tooltips.
13. **Cloning a rule set that duplicates another is allowed** (commit `9441f08`). Cloning is intentionally permissive; the duplicate gate only fires when the user tries to save.
14. **Discarding a rule condition must clear stale multi-values** (commit `f1ceaf8`). Forgetting to clear leaves orphan values that re-appear on the next render.
15. **`SHOW ONLY` multi-select goes as a single `IN` filter** (commit `c9f2a6a`), matching the Transaction Type behavior. Do not send N separate filter params.
16. **Phantom backend calls were eliminated** in `435ba95`. If you reintroduce a `useEffect` that fires on transient state, double-check the network panel for repeat `GetMT940Transactions` calls and phantom client-side tag creation.
17. **Sync-before-leave guard** for tag hierarchy (commit `3177e37`). Highlight the Sync button and prompt the user when navigating away with unsynced changes.
18. **TepConfig placeholder strings** like `'dolor'` still ship to prod and need replacement with env-driven values. See `docs/code-review.md` finding.
19. **Brand is a second theme axis, NOT a third theme value** (cluster K). `theme_preference` (`light`/`dark`) and `brand_preference` (`swittle`/`bwatech`) compose on `<html>` via two independent classes — bwatech works in both light and dark. Forcing bwatech for `role=user` lives in `AppShell` as a `useEffect(() => { if (isUser) setBrand('bwatech'); }, [isUser])`; the easter egg on the login page (`type 'bwatech'` with no input focus) only flips the brand, never the theme.
20. **User-mode redaction is session-only by design.** `redactionOn` lives in `UserModeContext` and is NEVER written to localStorage. The password gate (`'123123'` in [src/data/redactionRules.ts](src/data/redactionRules.ts)) is a friction affordance, not a security control — the bypass password ships in the JS bundle. Closing the tab or logging out re-enables redaction.
21. **User-mode contributions are per-user, custom tags are device-wide** (cluster K). Contributions live at `tep:userContributions:{userId}` — user A's edits don't surface in user B's "My Contributions" on a shared browser. Custom tags live at the un-namespaced `tep:userCustomTags` — any user on the device sees and can pick them. Defaulting either the other way would have surprised the demo flow.
22. **AppShell forks BEFORE running operator hooks for `role=user`**. The fork lives in [src/App.tsx](src/App.tsx) and renders either `<OperatorAppShell>` or `<UserModeProvider><UserPortal /></UserModeProvider>`. Do not move operator-mode `useState`/`useEffect` calls back into the `AppShell` wrapper — keep them in `OperatorAppShell` so user-mode sessions don't pay the cost of `useTagSpecs` / `useLocalChanges` / share-link state / backlog-navigation state initialization.
23. **Transactions table rows are memoized via `TableRow` + `rowCtx` — keep the contract.** [src/components/transactions/TransactionTable.tsx](src/components/transactions/TransactionTable.tsx) renders rows through a module-scope `memo` component whose shared inputs travel in ONE `rowCtx` object (`useMemo`). tanstack-virtual re-renders the parent on every scroll-window shift; rows only stay cheap because `rowCtx` is referentially stable while scrolling. If a row needs a new value from the parent, add it to `RowCtx` AND the `useMemo` dep list — never read it via a fresh closure or inline prop, and never give a prop an inline default like `new Set()` (see `EMPTY_HIDDEN_COLUMNS`). Per-row helpers (attribute value/validity/tooltip, cell styles) are module-scope functions parameterized on ctx values for the same reason.
24. **Tooltip is lazily armed; `content` may be a function.** [src/components/shared/Tooltip.tsx](src/components/shared/Tooltip.tsx) mounts zero floating-ui hooks until first mouseenter/focus; the overlay mounts as a SIBLING bound to `e.currentTarget` (external reference), so arming never remounts the trigger DOM node. Pass `content={() => ...}` for expensive bodies (attribute diff tooltips run `extractAttributes`) — a function is only evaluated when the tooltip opens. Arming is gated by `getScrollingSnapshot()` read at event time (no subscription): rows sliding under a stationary cursor mid-scroll must not arm. Don't wrap the trigger back into the floating tree or convert the snapshot read into `useSyncExternalStore` — both re-introduce the scroll blankness fixed on 2026-06-12.
25. **The row virtualizer must be re-synced when the row set changes.** [src/components/transactions/TransactionTable.tsx](src/components/transactions/TransactionTable.tsx) data arrives AFTER mount (the live dual-query refill resolves async; `analyzeRow` commits in idle-callback chunks), and tanstack-virtual only re-reads the scroll element / re-measures on a scroll or resize event. Without an explicit kick the virtualizer keeps a stale scroll offset + measurement cache and paints rows at the wrong vertical offset — a large empty GAP that collapses only once the operator scrolls (symptom: "250 loaded" but a blank table with rows floating at a wrong offset; scrolling fixes it). An effect keyed on the row-set signature (`data.length` + first/last `getRowId`) calls `rowVirtualizer.measure()` and, when the FIRST row id changes (a REPLACE: filter change, hide refill, remount, classic page nav — not a `+N` append), `scrollTo({ top: 0 })`. The signature is stable while scrolling, so this never fires on the scroll hot path. Don't remove it.
26. **Selection computations must be O(1)/O(selected) per render, never O(rows²).** [src/components/transactions/TransactionTable.tsx](src/components/transactions/TransactionTable.tsx) selection logic must NOT do `data.find((d) => getRowId(d.row) === id)` inside a loop over `selectedIds` — that's O(rows²), and after Show all + Select all on tens of thousands of rows it froze the UI for seconds (the action-bar dead-end/tagged checks ran it on EVERY render; `selectedTagDefs` / `selectedRowsForDialog` ran it on the select-all click). Use the memoized `rowById` map (id → row, rebuilt only on `data` change) for O(1) lookups, and read the action bar's all-dead-end / none-dead-end / any-tagged flags from the memoized `selectionSummary` (one O(selected) pass) instead of re-deriving them inline each render. `allRowsSelected` / `visibleSelectedCount` walk `data` once (O(rows)) and are memoized on `[data, selectedIds]` — acceptable, not per-render. The selection RESET clears only on a dataset REPLACE (first row id changes or the set shrinks), NOT on growth (Show all / +N / analyzeRow chunks append rows) — keying it on raw `data.length` wiped in-progress selections every chunk; while "select all" is active and the same dataset grows, the selection extends to the new rows.
27. **`analyzeRow` attributes are LAZY — don't force them.** [src/utils/analyzeRow.ts](src/utils/analyzeRow.ts) returns `attributes` as a cached GETTER, not a precomputed object: `extractAttributes` (regex per attribute, per matched def) is the dominant per-row cost, but only RENDERED rows read attributes (cells/modals/tooltips, ~one virtual window), never the count / filter / select-all paths. Eager extraction made Show all over tens of thousands of rows crawl and select-all wait on it. The getter computes once on first access, keyed by def.Id — identical values, deferred. CONSEQUENCE: object spread `{ ...analysis }` invokes the getter (forcing extraction); build new analysis objects field-by-field instead (`displayAnalyzedData`'s hidden-strip does this, with its own lazy getter over the kept defs). Don't read `.attributes` in any all-rows pass (filters use `.tags`/`.matchedDefinitions`, which stay eager and cheap).

## 14. File Mapping Cheat Sheet

Use this as the first lookup before grepping. Feature -> primary files.

| Task                                          | Primary file(s)                                                                                                                                                                                                                                                                                                                |
|-----------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Add or change a tab                           | [src/App.tsx](src/App.tsx), [src/components/layout/TabContainer.tsx](src/components/layout/TabContainer.tsx)                                                                                                                                                                                                                   |
| Edit transactions table                       | [src/components/transactions/TransactionTable.tsx](src/components/transactions/TransactionTable.tsx), [src/components/transactions/TransactionsTab.tsx](src/components/transactions/TransactionsTab.tsx)                                                                                                                       |
| Edit filters                                  | [src/components/transactions/DynamicFilters.tsx](src/components/transactions/DynamicFilters.tsx), [src/utils/buildRulesetFilters.ts](src/utils/buildRulesetFilters.ts), [src/utils/translateFilters.ts](src/utils/translateFilters.ts)                                                                                          |
| Hidden tags / pagination / visible counts     | [src/hooks/useVisibleRowsEngine.ts](src/hooks/useVisibleRowsEngine.ts), [src/utils/visibleRows.ts](src/utils/visibleRows.ts), [src/context/TransactionDataContext.tsx](src/context/TransactionDataContext.tsx), [src/components/transactions/HiddenTagsPanel.tsx](src/components/transactions/HiddenTagsPanel.tsx), [src/hooks/useTransactionData.ts](src/hooks/useTransactionData.ts) |
| Wizard (any step)                             | [src/components/wizard/](src/components/wizard/), [src/hooks/useWizardForm.ts](src/hooks/useWizardForm.ts)                                                                                                                                                                                                                     |
| Duplicate-rules-from-tag                      | [src/components/wizard/DuplicateRulesButton.tsx](src/components/wizard/DuplicateRulesButton.tsx), [src/components/wizard/SourceTagPickerModal.tsx](src/components/wizard/SourceTagPickerModal.tsx), [src/utils/cloneRulesAndAttributes.ts](src/utils/cloneRulesAndAttributes.ts)                                                |
| Condition editor                              | [src/components/wizard/ConditionEditor.tsx](src/components/wizard/ConditionEditor.tsx), [src/utils/regexify.ts](src/utils/regexify.ts), [src/constants/operations.ts](src/constants/operations.ts)                                                                                                                              |
| Attributes (per-tag)                          | [src/components/wizard/StepAttributes.tsx](src/components/wizard/StepAttributes.tsx), [src/utils/attributeFingerprint.ts](src/utils/attributeFingerprint.ts), [src/utils/extractAttributes.ts](src/utils/extractAttributes.ts)                                                                                                  |
| Attributes (global registry)                  | [src/components/attributes/AttributeFormModal.tsx](src/components/attributes/AttributeFormModal.tsx), [src/components/attributes/AttributesPage.tsx](src/components/attributes/AttributesPage.tsx)                                                                                                                             |
| Transformations                               | [src/components/wizard/TransformationList.tsx](src/components/wizard/TransformationList.tsx), [src/components/wizard/TransformationItem.tsx](src/components/wizard/TransformationItem.tsx), [src/utils/transformations.ts](src/utils/transformations.ts)                                                                        |
| Regex generation                              | [src/utils/regexify.ts](src/utils/regexify.ts), [src/utils/engregxify.ts](src/utils/engregxify.ts), [src/utils/dateRangeRegex.ts](src/utils/dateRangeRegex.ts), [src/utils/numericRangeRegex.ts](src/utils/numericRangeRegex.ts), [src/utils/intRangeAlternation.ts](src/utils/intRangeAlternation.ts)                          |
| Rule matching                                 | [src/utils/evaluateRuleSet.ts](src/utils/evaluateRuleSet.ts), [src/utils/analyzeRow.ts](src/utils/analyzeRow.ts)                                                                                                                                                                                                               |
| Duplicate detection                           | [src/utils/ruleFingerprint.ts](src/utils/ruleFingerprint.ts), [src/utils/attributeFingerprint.ts](src/utils/attributeFingerprint.ts)                                                                                                                                                                                            |
| Auth + sessions                               | [src/context/AuthContext.tsx](src/context/AuthContext.tsx), [src/api/identity.ts](src/api/identity.ts), [src/hooks/useTimeRemaining.ts](src/hooks/useTimeRemaining.ts), [src/components/auth/LoginPage.tsx](src/components/auth/LoginPage.tsx)                                                                                  |
| LOVs                                          | [src/components/lovs/](src/components/lovs/), [src/context/LovAttributesContext.tsx](src/context/LovAttributesContext.tsx), [src/types/lov.ts](src/types/lov.ts), [src/utils/humanizeLovTag.ts](src/utils/humanizeLovTag.ts), [src/api/lovAttributes.ts](src/api/lovAttributes.ts)                                              |
| Extractions LOV                               | [src/components/extractions/](src/components/extractions/), [src/api/extractions.ts](src/api/extractions.ts)                                                                                                                                                                                                                   |
| Comments + mentions + threads                 | [src/components/comments/](src/components/comments/), [src/context/CommentsContext.tsx](src/context/CommentsContext.tsx), [src/api/comments.ts](src/api/comments.ts), [src/utils/commentTarget.ts](src/utils/commentTarget.ts), [src/utils/mentions.ts](src/utils/mentions.ts), [src/utils/replyTree.ts](src/utils/replyTree.ts) |
| Notifications bell                            | [src/components/notifications/](src/components/notifications/), [src/api/notifications.ts](src/api/notifications.ts), [src/hooks/useNotifications.ts](src/hooks/useNotifications.ts)                                                                                                                                            |
| Onboarding tours                              | [src/components/onboarding/OnboardingHub.tsx](src/components/onboarding/OnboardingHub.tsx)                                                                                                                                                                                                                                      |
| Stats / Backlog                               | [src/components/stats/](src/components/stats/), [src/api/tagSpecs.ts](src/api/tagSpecs.ts), [src/api/checkout.ts](src/api/checkout.ts)                                                                                                                                                                                          |
| Integration Logs                              | [src/components/integrationLogs/](src/components/integrationLogs/)                                                                                                                                                                                                                                                              |
| Tag hierarchy management                      | [src/components/tagsHierarchy/](src/components/tagsHierarchy/), [src/api/tagsHierarchy.ts](src/api/tagsHierarchy.ts), [src/utils/tagHierarchyDiff.ts](src/utils/tagHierarchyDiff.ts), [src/utils/tagHierarchyNode.ts](src/utils/tagHierarchyNode.ts), [src/hooks/useHasUnsyncedTags.ts](src/hooks/useHasUnsyncedTags.ts), [src/hooks/useSyncTags.ts](src/hooks/useSyncTags.ts) |
| Share link                                    | [src/components/shared/ShareLinkDialog.tsx](src/components/shared/ShareLinkDialog.tsx), [src/components/shared/SharedLinkBanner.tsx](src/components/shared/SharedLinkBanner.tsx), [src/utils/shareLink.ts](src/utils/shareLink.ts)                                                                                              |
| TagSpec types and constants                   | [src/types/tagSpec.ts](src/types/tagSpec.ts), [src/types/transaction.ts](src/types/transaction.ts), [src/constants/fields.ts](src/constants/fields.ts), [src/constants/operations.ts](src/constants/operations.ts), [src/constants/transformations.ts](src/constants/transformations.ts)                                       |
| Shared primitives (Button, Input, Modal, etc.)| [src/components/shared/](src/components/shared/)                                                                                                                                                                                                                                                                                |
| Theme / dark mode                             | [src/context/ThemeContext.tsx](src/context/ThemeContext.tsx), [index.html](index.html)                                                                                                                                                                                                                                          |
| Sample fixtures                               | [src/data/](src/data/) (sampleData.json, sampleHierarchy.json, oldStructure.json, newStructure.json)                                                                                                                                                                                                                            |
| Persistence helpers (localStorage)            | [src/utils/persistence.ts](src/utils/persistence.ts)                                                                                                                                                                                                                                                                            |
| User-mode portal (role=user)                  | [src/components/userMode/](src/components/userMode/), [src/context/UserModeContext.tsx](src/context/UserModeContext.tsx), [src/utils/userMode/](src/utils/userMode/), [src/data/redactionRules.ts](src/data/redactionRules.ts), [public/bwatech-logo.svg](public/bwatech-logo.svg), [src/components/shared/BrandLogo.tsx](src/components/shared/BrandLogo.tsx) |
| Brand theming (swittle / bwatech)             | [src/context/ThemeContext.tsx](src/context/ThemeContext.tsx), [src/index.css](src/index.css), [src/components/shared/BrandLogo.tsx](src/components/shared/BrandLogo.tsx)                                                                                                                                                            |
| SHA-256 (client-side, weak by design)         | [src/utils/sha256.ts](src/utils/sha256.ts)                                                                                                                                                                                                                                                                                      |
| UUID generation                               | [src/utils/uuid.ts](src/utils/uuid.ts)                                                                                                                                                                                                                                                                                          |
| Text diff (used in edit tooltip)              | [src/utils/textDiff.ts](src/utils/textDiff.ts)                                                                                                                                                                                                                                                                                  |
| Definition version overlays                   | [src/utils/definitionVersions.ts](src/utils/definitionVersions.ts), [src/components/transactions/TagBadge.tsx](src/components/transactions/TagBadge.tsx)                                                                                                                                                                        |
| Inline summary clamping                       | [src/components/shared/Tooltip.tsx](src/components/shared/Tooltip.tsx) (see commit `61a7e18`)                                                                                                                                                                                                                                   |

## 15. Recent Feature History (grouped thematically)

Snapshot through head `b56f10a` (2026-05-20). Update this section when shipping a cluster.

### Cluster A: Hidden TagSpecs + Pagination

Long-running quality of life work on the hidden-tag interaction. The race fix (`cd2e253`) and the overfetch logic (`1a912a3`, `1ad11d4`) together let operators hide noise and still see correct counts.

- `cd2e253` fix(transactions): preserve hidden TagSpecs across tab navigation (race fix)
- `1a912a3` feat(transactions): reflect hidden TagSpecs in totals + overfetch on +N
- `1ad11d4` fix(transactions): footer counts subtract hidden, buttons stay raw
- `0f19435` fix(tags): refetch filter definitions after sync so new tags appear in Transactions filter
- `258b7d7` feat(filters): split dropdowns into Selected / Available groups
- `9f7251e` feat: hide rows by OpsTagSpecDefinitionId instead of tag name
- `c1171dc` feat: row-instance Hide Tag with side panel for per-row unhide
- 2026-06-12 feat(transactions): visible-rows engine — hide now auto-refills the table back to the previous visible row count via `useVisibleRowsEngine.ensureVisible`. With hidden tags active, exclusion is server-side via a DUAL QUERY (`replaceFromBeginningExcluding`: NI-filtered tagged rows + `OpsIsUntagged` rows, merged client-side in sort order) — exact fetch sizes, exact visible totals (sum of the two counts). ALL counts/pagination run in visible space; `targetVisible` is the incremental display window and persists per checkout (`tep:targetVisible`); classic pager became a window over the shared prefix buffer (no per-page fetches, visible-space page count, clamp on shrink). Supersedes the gotcha #2 dual-number convention.

### Cluster B: Wizard duplicate detection + duplication from tag

Reduces operator error by blocking saves with duplicate rules/attributes and by letting them clone from existing tags. Design specs are checked into `docs/superpowers/specs/`.

- `b56f10a` fix(wizard): visible-but-disabled Save for attributes + mandatory markers
- `5004923` feat: block save when rule builder contains duplicates
- `fec846d` docs: spec for blocking duplicate rules/attributes in rule builder
- `9441f08` fix: allow cloning a rule set even when it duplicates another
- `f1ceaf8` fix: clear stale multi-values when discarding a rule condition
- Design: `2026-05-13-duplicate-rules-from-tag-design.md`, `2026-05-14-block-duplicate-rules-attributes-design.md`

### Cluster C: Auth + inactivity sessions

Security hardening + UX polish for a stationary banking user base.

- `57fee78` feat(auth): inactivity-based session timeout (30 / 25 / 5)
- `73b46c9` fix(auth): proactive token refresh so idle users see the inactivity warning
- Backend workaround marker `BACKEND-WORKAROUND(role-from-usersinfo)` in `AuthContext.tsx`.

### Cluster D: Comments / mentions / notifications

Team collaboration system: per-row and per-rule comments, @-mentions, nested replies, notification bell with click-through, cross-tab navigation.

- `433c806` feat: in-app notifications bell with click-through to comment threads; nested reply threads with mentions and >5 collapse
- `0368f79` feat: comment surfaces (right-click on transactions, audit lockdown, rule-level in Backlog) + silent session refresh + full notification titles
- `219767a` feat: TagSpec comments with @-mentions and reply threads
- `f11caff` feat: View in Backlog link in notification threads, with row highlight on arrival
- `db98bf5` fix(notifications): match reply by body text, not by mention-filter
- `e2ed01b` fix: show reply author on notification cards instead of comment author
- `0e6f2e8` feat: bulk-set transaction comments + dialog on flag/unflag dead end
- `3136192` fix: filters dropdown UX, comment overflow, Dead End badge persistence

### Cluster E: Role-aware onboarding tours

- `812f96f` feat: revamped in-app onboarding tours with role-aware engine

### Cluster F: Rule builder expressiveness

Numeric thresholds with decimals, date GT/LT, attribute round-trip via Value, typed inputs, clone-as-OR.

- `b34b612` feat: allow decimal thresholds for numeric rule conditions
- `2a04189` feat: compile date/Amount GT/LT to regex inside REGEX operand
- `3d176ec` fix: send numeric GT/LT rule conditions to the server + forward in live preview
- `dd86221` fix: send date Greater than / Less than rule conditions to the server
- `b3512b0` feat: extractions round-trip regex via Value field (no separate Tags array)
- `972832c` feat: edit existing extractions + drop trailing $ on LOV extraction wrap
- `ec2cef7` feat: typed value input in rule conditions + gate Save on missing fields
- `e8ce6f8` feat: clone rule set as new OR sibling
- `9ad97a8` fix: block save on incomplete rule builder + ISO-date-tolerant regex anchors
- `45b1970` chore: drop Amount, dates, FundsCode, and TxStatusIndicator from rule field picker
- `a27a207` fix: validate attribute values after post-extraction transformations
- `cfa95c5` fix: rule builder header layout, buttons stop wrapping, dropdowns tighter

### Cluster G: Extractions + LOVs management

- `1d316d9` feat: EXTRACTIONS LOV + management page + in-page LOV browser drawer
- `85a183e` feat: Extract last 'n' characters extraction method
- `5ea8438` feat: add COUNTRIES LOV and unify rule builder dropdown heights
- `f06110c` feat: tag-name shortcut and cross-definition attribute suggestions in rule builder

### Cluster H: TagSpec management

- `9a942b7` feat: Delete TagSpec from the rule builder when editing an existing tag
- `90177da` / `f49bae4` feat: show definition version overlay on tag pills for duplicate codes
- `3177e37` feat: highlight Sync and ask before leaving page with unsynced tag changes

### Cluster I: UX polish + layout stability

- `f7abe74` fix: stop closed drawer shadows from bleeding into the viewport
- `44bfce7` style: weighty Hide Tag Spec button in selection action bar
- `a33817d` fix: restore table rows while keeping the shrink-to-fit behavior
- `074fb6f` fix: shrink transactions table card to row count
- `ddd68e8` fix: scope checkout indicator to the Transactions tab only
- `61a7e18` fix: clamp + contain inline summaries so long values don't break layout
- `8a201c5` fix: header layout + LOV labels from API + single-page transactions count
- `4459d68` feat: subtle copyable ids + richer source-tag picker + global scrollbar
- `447d3d3` feat: pagination total in non-incremental mode + sticky Actions column polish
- 2026-06-12 fix(wizard): StepBasicInfo Transaction Type now uses the shared `TransactionTypePicker` (searchable, code + description from `filterDefinitions` via `useTransactionData()`) instead of a plain `Select` over static codes — matches the Rule Builder's picker

### Cluster J: Infra + correctness

- `103add0` fix: await TagSpecLibrarySave before refetching transactions
- `435ba95` fix: eliminate phantom GetMT940Transactions calls + phantom client-side tags
- `83f674f` fix: gate integration-logs Rerun button per endpoint outcome
- `c9f2a6a` fix: send SHOW ONLY multi-select as a single IN filter like Transaction Type
- 2026-06-12 perf(transactions): smooth scrolling on large datasets — memoized `TableRow` row component fed by a single stable `rowCtx` (scroll re-renders skip mounted rows), lazily-armed Tooltip (no floating-ui hooks until first hover, sibling overlay so arming never remounts the trigger), lazy tooltip `content` functions (attribute diff/extraction work deferred to open), row helpers hoisted to module scope, overscan 12 → 24 now that mounted rows are free. Gotchas #23 and #24.

### Cluster K: User-mode portal + bwatech brand

A demo-driven, role-gated portal that runs entirely client-side. When `/usersinfo` returns `role: 'user'`, the app forks to a bwatech-branded surface: a company picker (from the `DEMO_USER_COMPS` LOV), a stripped-down transactions table scoped to that company's IBANs, an in-row tag-change flow that saves contributions to localStorage (per-user) plus optional custom tags (device-wide), a "My Contributions" log, and a password-gated redaction toggle on the Description column. The Swittle/operator portal is untouched.

- Role detection: `isUserRole()` helper + `isUser` computed prop in [src/context/AuthContext.tsx](src/context/AuthContext.tsx).
- Brand axis: new `brand: 'swittle' | 'bwatech'` in [src/context/ThemeContext.tsx](src/context/ThemeContext.tsx), composes with light/dark via separate `<html>` classes; bwatech tokens defined in [src/index.css](src/index.css).
- Easter egg: typing `bwatech` on the login page (input-focus-aware) flips the brand early so the post-login swap doesn't flash. See [src/components/auth/LoginPage.tsx](src/components/auth/LoginPage.tsx).
- App fork: `AppShell` becomes a thin switcher; the existing tab body lives in `OperatorAppShell`. See [src/App.tsx](src/App.tsx).
- Session-scoped state + per-user + device-wide storage all in [src/context/UserModeContext.tsx](src/context/UserModeContext.tsx). Storage utils: `contributionStorage.ts`, `customTagsStorage.ts`.
- Pure utils: `redact`, `pickHighestCertaintyDef`, `getDemoCompanies`, `groupsForTag`, `randomJv` — all in [src/utils/userMode/](src/utils/userMode/) with co-located tests.
- Tag-change flow: row click → `TagPickerModal` (tree + "Create new tag") → `ContributionDialog` (`Save for Myself` | `Submit for Review`).
- Redaction rule shape (`{ kind: 'between' | 'regex', ... }`) lives in [src/data/redactionRules.ts](src/data/redactionRules.ts). BETWEEN replaces the entire delimited span; later rules see already-redacted text.

## 16. Design Specs Index

Design specs live in [docs/superpowers/specs/](docs/superpowers/specs/). They document UX/validation decisions before implementation.

| File                                                                                                                                          | Date       | Topic                                                                       |
|-----------------------------------------------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------|
| [2026-04-23-edit-attribute-tooltip-design.md](docs/superpowers/specs/2026-04-23-edit-attribute-tooltip-design.md)                              | 2026-04-23 | Before/after diff tooltip when editing extraction rule                      |
| [2026-05-13-duplicate-rules-from-tag-design.md](docs/superpowers/specs/2026-05-13-duplicate-rules-from-tag-design.md)                          | 2026-05-13 | Clone rules + attributes from existing tag as template                      |
| [2026-05-14-block-duplicate-rules-attributes-design.md](docs/superpowers/specs/2026-05-14-block-duplicate-rules-attributes-design.md)          | 2026-05-14 | Duplicate detection + save blocking in rule builder                         |
| [2026-06-12-hidden-tags-refill-design.md](docs/superpowers/specs/2026-06-12-hidden-tags-refill-design.md)                                      | 2026-06-12 | Hidden-tag refill engine + visible-space counts + dual-mode pagination      |

Also: [docs/FEATURES.md](docs/FEATURES.md) is the comprehensive operator-facing feature inventory. [docs/code-review.md](docs/code-review.md) is the prioritized 31-finding code review with a Phase 0-3 action plan.

## 17. Memory References

The auto-memory directory for this project is at `C:\Users\nadim\.claude\projects\c--Users-nadim-OneDrive-Desktop-friendly-regex\memory\`. Future sessions should read `MEMORY.md` there at the start of every session.

Current entries:

- [`project_role_from_usersinfo_fallback.md`](C:/Users/nadim/.claude/projects/c--Users-nadim-OneDrive-Desktop-friendly-regex/memory/project_role_from_usersinfo_fallback.md): role-from-/usersinfo backend workaround (see gotcha #6).

When ingesting new memories, follow the type system in the system instructions (user / feedback / project / reference) and update `MEMORY.md` as an index, not a content store.

## 18. Known Architectural Debt (do not re-propose)

These findings are already triaged in [docs/code-review.md](docs/code-review.md). Do not raise them as new during a session unless the user explicitly asks for a security/perf review. Prioritized 31 findings + Phase 0-3 plan live there.

| Finding                                                              | Priority |
|----------------------------------------------------------------------|----------|
| JWT in localStorage; no CSP                                          | Critical |
| Client-side SHA-256 "hashing"                                        | Critical |
| Single 9.1 MB chunk; no lazy loading                                 | Critical |
| Context provider values not memoized                                 | Critical |
| TepConfig placeholder strings shipped to prod                        | Critical |
| `tempToken!` non-null assertions in 2FA flow                         | Critical |
| ReDoS exposure on user-supplied regex                                | Critical |
| TepHeaders constructed in 9 sites                                    | Medium   |
| `TransactionsTab.tsx` god component (1,473 LoC, 41 hooks)            | Medium   |
| `TransactionTable.tsx` monolith (1,725 LoC, ColumnPicker inlined)    | Medium   |
| `TransactionRow` type lies (arrays typed as scalars)                 | Medium   |
| `formStateToTempDefinition` and `toTagSpecDefinition` diverge        | Medium   |
| 3x suppressed `react-hooks/exhaustive-deps`                          | Medium   |
| Tooltip used 61x per row                                             | Medium   |
| RegExp re-compiled per render                                        | Medium   |
| `any` in `apiError.ts` parsers                                       | Low      |
| Stable row IDs not used as `key` (uses array index)                  | Low      |
| External logo hot-linked                                             | Low      |

## 19. Org Formatting Conventions

User org policy for any document this project produces (apply when generating Word/PDF docs, READMEs, or design specs):

- No em-dashes anywhere. Use commas, parentheses, or a period instead.
- Minimum line spacing. No space before or after paragraphs inside bulleted lists in a paragraph.
- Extended margins (vertical and horizontal) to use more of the page.
- A4 page format.
- English (USA) syntax and spelling.
- MS-Word is the preferred final format for documents.
- Always use numbered headings, applied as actual Word heading styles.
- Consultant-style polish: dense, scannable, executive-summary friendly.

Generators live in [scripts/generate-docx.cjs](scripts/generate-docx.cjs) and [scripts/generate-pdf.cjs](scripts/generate-pdf.cjs).

## 20. Quick Verification Recipe (End-to-End)

When making any change to rule builder, transactions table, attributes, or auth, run this sequence before declaring done:

1. `npm run lint`
2. `npm run test` (use `npm run test:coverage` if changes are in `src/utils/**`, `src/types/tagSpec.ts`, or `src/components/shared/**`)
3. `npm run dev`, open the app, and walk the golden path for Transactions:
   1. Log in -> Backlog tab -> Checkout a bank/side.
   2. Open Transactions tab -> apply a filter.
   3. Hide a tag in a row -> confirm the table auto-refills back to the previous visible row count (network panel: two parallel GetMT940Transactions — NI-tagged + untagged — plus one background count call; no loop), header shows total showing + "N hidden", footer total matches the header and stays stable (no counting down).
   4. Click `+50` pagination -> confirm exactly 50 VISIBLE rows are added (dual query sized to the target, no overfetch).
   5. Switch to Backlog tab and back -> confirm hidden tags persist.
   6. Open the wizard -> add an attribute without an Attribute Name -> confirm Save is visible but disabled and mandatory markers appear.
   7. Save the definition -> sync -> confirm the new tag appears in the Transactions filter dropdown immediately.
4. If touching auth or session timeout: manually verify the 30 / 25 / 5 banners by setting the timeout constants low and idling.
5. If touching auth role logic: confirm devops badge and Integration Logs tab still appear for the devops user (the `/usersinfo` workaround is active).
6. If touching wizard rule duplication: cover both detection (red banner on second instance) and the permissive cloning path (commit `9441f08`).
7. If shipping a new feature, append a row to section 14 and a bullet to the relevant cluster in section 15. Update this file on the same PR.

---

End of context file. If anything here is out of date, fix this file in the same PR as the code change rather than leaving stale guidance.
