# Comprehensive Code Review — TEP

**Project:** friendly-regex (Transaction Enrichment Program / TEP)
**Stack:** React 19 · TypeScript 5.8 · Vite · Tailwind 4
**Scope:** 145 TS/TSX files · ~24,440 LoC
**Reviewed:** 2026-04-29
**Constraint:** Non-functional improvements only — preserve all existing behavior.

Reviewed across four dimensions in parallel by specialized reviewers:
1. Architecture & Maintainability
2. Security
3. Performance
4. TypeScript & React Patterns

---

## Executive Summary

### What's solid

- `src/utils/` has co-located tests for nearly every pure utility — exemplary discipline
- Shared component primitives (`Button`, `Input`, `Modal`, `Tooltip`, `Badge`) are well-isolated and tested
- React 19 idioms already adopted (no `forwardRef`, no `React.FC`, ref as prop)
- TypeScript `strict` is on; `tsc -b --noEmit` runs clean
- Restricted-token 2FA discipline: `tempToken` correctly never persisted
- No `dangerouslySetInnerHTML` anywhere; no hardcoded secrets in source
- Reducer-driven state for tag spec mutations is auditable
- Vite proxy enforces TLS certificate verification (`secure: true`)
- Session expiry is enforced client-side (timer-based logout at server-issued expiry)

### Where it hurts most (cross-cutting hotspots)

1. **Auth flow** — JWT + refresh token in `localStorage`, client-side SHA-256 "hashing", several unsafe casts and `!` assertions on the 2FA setup branch, `tempToken` discriminated union not tight enough
2. **TepConfig** — placeholder `'dolor'` strings shipped to production; default value silently masks missing provider
3. **Bundle** — single 9.1 MB / 1.14 MB gz chunk, zero lazy loading; tsparticles/intro.js/motion ship to every user
4. **TransactionsTab + TransactionTable** — 1,473- and 1,725-line god components; context value not memoized so the entire table re-renders on any state churn
5. **TepHeaders** — same object literal constructed 9 times across 4 files
6. **No CSP** + tokens in `localStorage` = compounding XSS exposure

---

## Top Findings (Cross-Reviewer, Deduped, Prioritized)

### Critical / High Impact

| # | Finding | Files | Effort | Dimension |
|---|---|---|---|---|
| 1 | JWT + refresh token in `localStorage` (no CSP makes this worse) | `AuthContext.tsx:182,236,279`, `index.html` | M | Security |
| 2 | Client-side SHA-256 password "hashing" — digest *is* the credential | `utils/sha256.ts`, `AuthContext.tsx:129` | M (server coord) | Security |
| 3 | No code splitting — single 9.1 MB chunk; particles/intro.js/motion eager | `main.tsx`, `App.tsx`, `vite.config.ts` | M | Performance |
| 4 | Context provider values not memoized → full subtree re-renders on any state change | `TransactionDataContext.tsx:307`, `AuthContext.tsx:313` | S | Performance |
| 5 | `TepConfig` ships `'dolor'` placeholders + uses unsafe default-value pattern | `TepConfigContext.tsx:11-17` | S | Architecture + Types |
| 6 | `tempToken!` non-null assertions on a union that allows `undefined` | `LoginPage.tsx:216,221` | S | Type Safety |
| 7 | ReDoS — user-supplied regex compiled on main thread, runs against every row | `evaluateRuleSet.ts:28`, `extractAttributes.ts:32`, `TransactionTable.tsx` (multiple) | L | Security + Performance |
| 8 | `TepHeaders` object built 9× across 4 files | `TransactionDataContext.tsx`, `TransactionsTab.tsx:800,1452`, `TagsHierarchyTab.tsx:249`, `App.tsx:221` | S | Architecture |
| 9 | Unsafe `as { accessToken; refreshToken; expiresIn }` casts after runtime check | `AuthContext.tsx:144,199` | S | Type Safety |
| 10 | No CSP — any future XSS extracts everything from localStorage | `index.html` | M | Security |
| 11 | External `swittle.com` logo on login page (CSP / supply chain / CLS) | `LoginPage.tsx:330` | S | Security + Performance |
| 12 | `TransactionsTab.tsx` is a 1,473-line god component (41 hooks) | full file | L | Architecture |
| 13 | `TransactionTable.tsx` is a 1,725-line monolith; `ColumnPicker` (~380 lines) inlined; no row memoization; `key={i}` | full file | M–L | Architecture + Performance |

### Medium

| # | Finding | Files | Effort | Dimension |
|---|---|---|---|---|
| 14 | `TransactionRow` typed as scalar-only, then escaped via `as unknown as` everywhere it's read | `types/transaction.ts`, `AttributeEditor.tsx:233,302`, `TransactionTable.tsx:1063` | M | Type Safety |
| 15 | `formStateToTempDefinition` (TransactionsTab) silently diverges from `toTagSpecDefinition` (useWizardForm) | `TransactionsTab.tsx:56–140`, `useWizardForm.ts:276–356` | S | Architecture |
| 16 | `useWizardForm` factories defined inside hook body; one `useCallback` has missing dep | `useWizardForm.ts:91–138` | S | Architecture |
| 17 | 5× inline `try/catch` localStorage `useState` initializers in `TransactionsTab` | `TransactionsTab.tsx:265–295` | S | Architecture |
| 18 | 3× suppressed `react-hooks/exhaustive-deps` hide real state-flow issues | `TransactionsTab.tsx:252,464,928` | M | Architecture |
| 19 | `Tooltip` (@floating-ui) used 61× per page (every cell) — hundreds of hook subscriptions | `TransactionTable.tsx:1655,1696` | M | Performance |
| 20 | RegExp re-compiled per render in attribute validation loop | `TransactionTable.tsx:595–640` | M | Performance |
| 21 | `: any` in API error parsers | `apiError.ts:18`, `lovAttributes.ts:11` | S | Type Safety |
| 22 | Operation unions admit `'' as Op` casts for unset state | `useWizardForm.ts:95,114` | S | Type Safety |
| 23 | `sharedKey` (TOTP seed) not cleared from React state on wizard exit | `LoginPage.tsx:564–568` | S | Security |
| 24 | `decimalMaxValues` fan-out: 10–15 parallel requests on tab open, no caching | `TransactionDataContext.tsx:151–191` | M | Performance |
| 25 | `share.note` length only enforced via `maxLength` HTML attr — URL-craftable | `utils/shareLink.ts:50,66` | S | Security |
| 26 | `TagSpecContext.tsx` (523 lines) mixes two concerns; module-level side effect on import | `TagSpecContext.tsx` | M | Architecture |
| 27 | `VITE_TEP_API_KEY` baked into client bundle | `App.tsx:224`, `api/*.ts` | M (BFF) | Security |
| 28 | Hardcoded `'ARNBSARI'` swift code as wizard default | `useWizardForm.ts:127` | S | Architecture |

### Low / Stylistic

| # | Finding | Files | Effort |
|---|---|---|---|
| 29 | `getElementById` + `as HTMLInputElement` in TotpInput (use refs array) | `LoginPage.tsx:124,131,138` | S |
| 30 | `intro.js` `_steps` private field accessed via `as unknown as { _steps }` 3× | `OnboardingHub.tsx:113,172,414` | S |
| 31 | `loadSlim` registers ~50 unused tsparticles plugins | `LoginPage.tsx:21` | S |
| 32 | `console.error` everywhere with no central reporter | many | S |
| 33 | Fast-refresh warnings on every context file (component + hook in same module) | `src/context/*` | S each |

---

## Detailed Findings by Dimension

### 1. Architecture & Maintainability

#### `TransactionsTab.tsx` — 1,473-line god component
Owns 41 hooks (19 `useState`, multiple `useMemo`/`useCallback`/`useEffect`), the inline rule builder, tag-click drill-down state machine, share-link ingestion, localStorage persistence, column layout logic, and API save logic.

**Recommended split:**
- `useTagClickDrillDown` hook for the `tagClickState` machine and its two `useEffect` trackers
- `useTablePreferences` hook for the five localStorage-backed states (`showAttributes`, `relaxedMode`, `incrementalPagination`, `hiddenColumns`, `columnOrder`)
- `useBuilderPanel` hook for `builder`, `builderOpen`, `builderHeight`, `builderRef`, the `ResizeObserver` effect, and `tempDefinition`

#### `TransactionTable.tsx` — 1,725-line monolith
Contains the table component, `ColumnPicker` component (~380 lines), several module-level utility functions, and the full per-cell rendering switch.

#### `TepHeaders` constructed 9 times across 4 files
Every construction inlines `import.meta.env.VITE_TEP_API_KEY ?? ''` plus four fields from `tepConfig`. A single `useTepHeaders(): TepHeaders | null` hook would centralize this.

#### Placeholder data baked into `TepConfigContext`
`ttpTenantCode`, `timeZone`, and `ttpRequestId` are hardcoded to `'dolor'`. Every outgoing API request silently carries these placeholder strings.

#### `formStateToTempDefinition` duplicates `toTagSpecDefinition`
Near-identical logic with subtle filter differences will silently produce different results and drift further over time.

#### `useWizardForm` factories recreated each render
`createEmptyCondition`, `createEmptyGroup`, `createEmptyAttribute` are plain functions recreated on every render. `addRuleGroup`'s `useCallback` dep array is empty but it calls `createEmptyGroup()` which closes over the fresh instance.

#### Three suppressed `react-hooks/exhaustive-deps` warnings hide legitimate issues
- Line 252: `fetchDecimalMaxValues` omitted — stale version risk
- Line 464: `baseFilters` effect intentionally omits its own dep to prevent a loop — design smell
- Line 928: `handleTagClick` omitted — one-shot `pendingDefinitionId` handling is fighting the normal data-flow

#### `TagSpecContext.tsx` — 523 lines, mixed concerns
Two reducers, a one-time cache migration executed at module evaluation, a localStorage merge helper, two exported pure functions, the context type, and the provider. The hierarchy concern is wholly separable.

---

### 2. Security

#### JWT + refresh token in `localStorage`
The full `StoredAuth` object — including `accessToken` and `refreshToken` — is written to `localStorage` under `auth_session`. Any XSS vector can read it and exfiltrate both tokens in plaintext.

**Fix:** Store access token in memory only; refresh token in `HttpOnly; Secure; SameSite=Strict` cookie.

#### Client-side SHA-256 password hashing
`sha256(pass)` is called in the browser and the hex digest is transmitted as the `Password` field. SHA-256 is a fast, unsalted digest — not a password hash:
- Deterministic: same digest for every user with the same password → rainbow-table-crackable
- The digest itself becomes the credential. Anyone who intercepts it can authenticate without knowing the original password
- Held in React component state during the 2FA wizard

**Fix:** Send plaintext password over HTTPS; let the server hash with bcrypt/argon2 with a per-user salt.

#### ReDoS — user-supplied regex on main thread
Every `new RegExp(userSuppliedString)` running against transaction data (potentially thousands of rows) is vulnerable. An authenticated bank operator who saves a catastrophic-backtracking pattern such as `(a+)+$` will freeze the browser tab for all users loading that rule library.

**Fix:**
1. Validate regex patterns server-side on save using a ReDoS detector (`vuln-regex-detector`, `recheck`)
2. Client-side: run regex matching inside a Web Worker with a ~100 ms timeout
3. Reject patterns with known catastrophic structures using `safe-regex`

#### No Content Security Policy
The HTML document has no CSP. Combined with tokens-in-localStorage, the absence of a CSP significantly raises the practical exploitability of any XSS.

**Suggested policy:**
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
```

#### External image from `swittle.com` on login page
`<img src="https://swittle.com/swittle%20logo.png" />` creates a third-party origin dependency on the login page. Risk of supply chain compromise + CLS.

**Fix:** Self-host as inline SVG.

#### `tempToken` and `sharedKey` not zeroed on wizard exit
When the user clicks "Back to login" after reaching the QR step, the old `totp_setup` state object — containing `sharedKey` (the TOTP seed) and `tempToken` — remains in memory until React garbage-collects it.

#### `share.note` length not validated server-side
`maxLength={500}` on the textarea is the only length check. URL-crafted shares can supply arbitrary lengths.

#### `VITE_TEP_API_KEY` in client bundle — RESOLVED 2026-06-17
Was baked into the JS bundle and sent as `x-apikey` on every TEP API call. Removed entirely: the key
was meant for integration services, not the Portal, which authenticates via the per-user JWT
(`Authorization: Bearer`) + `TTPUserId`/`TTPTenantCode` header bundle. The `apiKey` field, the
`x-apikey` header, and the `VITE_TEP_API_KEY` env var are all gone.

#### Defense-in-depth (server/proxy level)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`
- Rate limiting on login + TOTP endpoints
- Pin `tsparticles` and `intro.js` to exact versions
- Session-end purge of all `tep:*` localStorage keys (kiosk scenario)

---

### 3. Performance

#### Bundle composition (estimated)

Single chunk: **~9.16 MB raw / ~1.14 MB gzip**, no code splitting.

| Package | Raw | Est. gz contribution | Used by |
|---|---|---|---|
| `@tsparticles/slim` + `/react` | 1.4 MB | ~110–140 kB | LoginPage only |
| `intro.js` (+ CSS) | 1.2 MB | ~50–70 kB | OnboardingHub only |
| `@dnd-kit/*` | 2.3 MB | ~40–55 kB | Wizard + ColumnPicker |
| `motion` | 708 kB | ~35–55 kB | OnboardingHub only |
| `@floating-ui/react` | 1.5 MB | ~25–35 kB | Tooltip (61 usages) |
| `qrcode.react` | 136 kB | ~8–10 kB | LoginPage 2FA setup only |
| React 19 + ReactDOM | — | ~45 kB | core |
| App code | — | ~700–800 kB | core |

**Where to split:** route-level (`LoginPage`, `OnboardingHub`, three tabs) plus heavy-deps splits for particles, intro.js, and motion. Estimated **~280–350 kB gz** can move off initial bundle (≈25–30% cut).

#### Context provider value re-creates each render
Every state change (e.g., a single `loading` toggle) creates a new context value, which re-renders **every** consumer — including `TransactionTable` with up to 50 rows × N columns of memo work.

`LovAttributesContext.tsx:221-245` already does this correctly — pattern exists, just not applied consistently.

#### No virtualization on TransactionTable
50 rows × ~15+ visible columns × tooltips/badges = 750+ DOM cells per render. Re-renders fully on context churn and on hover (`highlightSource` state at `:1646` sets state on `mouseenter` after 500 ms timer).

**Fix (cheap):** Memoize row body — extract `<TableRow>` + `React.memo` with stable comparison. Move `highlightSource` to ref/CSS variable.
**Bigger:** Virtualize via `@tanstack/react-virtual` (~7 kB gz).

#### `Tooltip` used 61× per row
Every attribute cell and tag wraps in `<Tooltip>`. With 50 rows × ~6 attribute cols, the page mounts hundreds of floating-ui hooks.

**Fix:** Single delegated tooltip listener at the table level reading `data-tooltip` attributes.

#### RegExp re-compiled per render
`attrValidationMap` rebuilds RegExps for every render where deps change (`TransactionTable.tsx:595–640`). Each `new RegExp(op)` and `new RegExp(predefined.regex)` is non-trivial.

**Fix:** Module-level WeakMap cache keyed by source string. Move per-row validation results into `analyzedData` (compute once when built in `TransactionsTab.tsx:621`).

#### `decimalMaxValues` probe fan-out
For each DECIMAL filter, all sort-column candidates probed in parallel — 10–15 simultaneous queries on tab entry. No caching, no abort signal.

**Fix:** `sessionStorage` cache with TTL; serialize per filter; honor `AbortSignal`.

#### External hot-link image in critical path
`https://swittle.com/swittle%20logo.png` blocks login render path on a third-party origin (no `loading="lazy"`, no `fetchpriority`, no width/height → CLS).

#### `key={i}` on table rows
Index keys defeat reconciliation when rows shift. Combined with no row memoization, this forces churn on every data update.

---

### 4. Type Safety & React Patterns

#### `tsconfig` health
`tsconfig.app.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, and `verbatimModuleSyntax` — solid baseline.

**Missing:**
- `noUncheckedIndexedAccess` (high-value: `TransactionRow` is `[key: string]: ...` and the codebase reads `row[field]` everywhere)
- `exactOptionalPropertyTypes` (`WizardFormState` and `AttributeFormValue` have many `?:` properties; explicit `undefined` assigned in places like `_originalRegex: undefined`)

`tsc -b --noEmit` runs clean.

#### `tempToken` non-null assertions on a discriminated-union variant
```ts
const setupData = await get2faSetup(result.tempToken!);
... tempToken: result.tempToken!,
```
The `'2fa_required'` variant types `tempToken?: string`. If the backend ever returns this branch without a token, `!` lies and `get2faSetup(undefined)` ships.

**Fix:** Split the variant:
```ts
| { status: '2fa_required'; isSetupRequired: true; tempToken: string; ... }
| { status: '2fa_required'; isSetupRequired: false; ... }
```
Then `if (result.isSetupRequired)` narrows automatically.

#### Unsafe casts on TEP API responses
```ts
const tokenData = data as { accessToken: string; refreshToken: string; expiresIn: number };
```
The cast would survive even if the API response shape changed.

**Fix:** Type `loginApi` to return a discriminated union. Let `'requiresTwoFactor' in data` narrow naturally.

#### `: any` in API error parsers
`apiError.ts:18`, `lovAttributes.ts:11` — explicit `any` (with eslint-disable) at runtime boundaries parsing JSON.

**Fix:** `: unknown` with narrowing.

#### `TransactionRow` interface lies
```ts
export interface TransactionRow { [key: string]: string | number | boolean | null }
// later:
const r = row as unknown as Record<string, unknown>;
```
Real data has `OpsAttributes`/`OpsMultiTags` arrays — every consumer double-casts to escape the lie.

**Fix:**
```ts
interface TransactionRow {
  OpsAttributes?: Array<{ Key: string; Value: unknown }>;
  OpsMultiTags?: Array<{ Attributes?: ... }>;
  [key: string]: unknown;
}
```

#### `'' as Op` casts for unset state
`useWizardForm.ts:95,114` — `operation: '' as ConditionFormValue['operation']`.

**Fix:** Make the union admit unset state explicitly: `MatchOperation | ''` or `MatchOperation | null`.

#### `useWizardForm` returns inferred shape with no exported type
Refactoring any single callback signature ripples silently. `goNext`/`goBack` use `Math.min(s + 1, 4) as WizardStep`.

**Fix:** Export `interface UseWizardFormReturn`; replace `as WizardStep` with explicit conditionals.

#### React 19 modernization opportunities
1. **`useActionState` / `useFormStatus`** — `LoginPage`'s three handlers manage `loading`/`error`/form-state by hand with three separate `useState`s
2. **`useTransition`** — `AttributeEditor` live regex preview recompute could mark non-urgent updates
3. **`use(Promise)`** — three async contexts (Lov, TagSpec, TransactionData) currently fetch in `useEffect` with loading flags

---

## Patterns Worth Preserving

1. **Util test coverage** — every utility has a co-located test file
2. **Reducer-based state for tag spec mutations** — auditable, testable
3. **Shared component library** — clean prop interfaces, genuine reusability
4. **`useWizardForm` separation of concerns** — form state vs. API
5. **`tempToken` discipline** — only in React in-memory state, never persisted
6. **No `dangerouslySetInnerHTML`** — eliminates a major XSS class
7. **No hardcoded secrets** — all sensitive config from `import.meta.env`

---

## Unified Action Plan (Phased, Non-Functional)

### Phase 0 — Day 1 quick wins (S, no risk)

1. Memoize `TransactionDataContext` and `AuthContext` provider values (#4) — biggest perf win for least work
2. Self-host the Swittle logo as inlined SVG (#11) — closes external dep, fixes CLS, prepares CSP
3. Tighten `LoginResult` discriminated union so `tempToken` is required when `isSetupRequired: true` (#6, #9 partially) — kills the `!` assertion
4. Switch `TepConfigContext` to `null` + throw-in-hook pattern; read values from `import.meta.env`; add `.env.example` (#5)
5. Switch table row keys from index to stable IDs (`getRowId(item.row)`) — unblocks #13 row memoization
6. Add length/type validation in `parseShareParams` (#25)
7. Clear `sharedKey` from state on any 2FA wizard exit path (#23)
8. Move `useWizardForm` factory functions to module scope; fix the empty-deps `useCallback` (#16)
9. Remove hardcoded `'ARNBSARI'` default (#28)

### Phase 1 — Week 1 (S–M, isolated changes)

10. Create `useTepHeaders()` hook → eliminate the 9 inline header constructions (#8)
11. Create `useLocalStorageState<T>(key, default)` → replace 5 inline `try/catch` initializers in TransactionsTab (#17)
12. Type `loginApi` response as a discriminated union → remove the two `as` casts (#9)
13. Switch `apiError.ts`/`lovAttributes.ts` parsers from `: any` to `: unknown` + narrowing (#21)
14. Lazy-load `LoginPage`, `OnboardingHub`, `UndoChangesDialog`, `SharedLinkBanner` (#3 partial)
15. Move `intro.js` + `motion` imports inside `launchTour` callback (#3 partial)
16. Add Vite `manualChunks` for `react-vendor`, `dnd-kit`, `floating-ui`, `tsparticles`, `intro.js`, `motion` (#3 finish) — expected ~280–350 kB gz off initial bundle
17. Replace `getElementById` in TOTP input with refs array (#29)

### Phase 2 — Week 2 (M, requires testing)

18. Extract `ColumnPicker` from `TransactionTable.tsx` into its own file (#13 first cut)
19. Extract `useTagClickDrillDown`, `useTablePreferences`, `useBuilderPanel` hooks from `TransactionsTab.tsx` (#12) — also resolves the 3 ESLint suppressions (#18)
20. Memoize `TableRow`; move `highlightSource` to ref/CSS variable to stop full-table re-renders on hover (#13 perf cut)
21. Cache compiled `RegExp` instances in module-level WeakMap; precompute per-row validation in `analyzedData` (#20)
22. Re-type `TransactionRow` with structured `OpsAttributes`/`OpsMultiTags`; remove 4 `as unknown as` casts (#14)
23. Unify `formStateToTempDefinition` and `toTagSpecDefinition` via shared `toPreviewDefinition()` (#15)
24. Split `TagHierarchyContext` out of `TagSpecContext`; move module-level cache purge into provider mount effect (#26)
25. Cache `decimalMaxValues` in `sessionStorage`; thread `AbortSignal` (#24)
26. Add CSP in report-only mode; iterate to enforce (#10)
27. Enable `noUncheckedIndexedAccess` in `tsconfig.app.json`; fix the resulting errors

### Phase 3 — Multi-week / coordination needed

28. **Auth hardening (server coordination required):**
    - Remove access + refresh tokens from `localStorage` → access in memory, refresh in `HttpOnly; Secure; SameSite=Strict` cookie (#1)
    - Remove client-side SHA-256, send plaintext over TLS, server-side bcrypt/argon2 (#2)
    - Confirm whether `VITE_TEP_API_KEY` is a secret or tenant discriminator; if secret, move to BFF (#27)
29. **ReDoS protection:** integrate `safe-regex` / `recheck` server-side; client-side regex execution in a Web Worker with ~100 ms timeout (#7)
30. Virtualize `TransactionTable` with `@tanstack/react-virtual` (~7 kB gz) — prerequisites done in Phase 2 (#13 final cut)
31. Replace per-cell `Tooltip` with delegated single-listener pattern at table level (#19)

---

## Estimated Cumulative Outcome

- **Initial JS:** ~30–35% smaller (≈350–400 kB gz off the wire)
- **TransactionsTab paint cost:** ~40–60% reduction under realistic ops loads
- **Login TTI:** several hundred ms saved on cold loads
- **Type safety:** ~10 unsafe casts removed; auth flow correctly narrowed
- **Security posture:** XSS-resistant token handling, CSP enforced, ReDoS-bounded, no third-party login origin
- **Maintainability:** TransactionsTab from 1,473 → ~400 lines; TepHeaders constructed once; placeholder values gone

The Phase 0 changes alone (~1 day of work) would resolve the highest-leverage type-safety, security, and performance items without any functional risk.

---

## File Index (most-impacted)

- `src/context/AuthContext.tsx` — auth flow, token handling, password hashing
- `src/context/TepConfigContext.tsx` — placeholder values, default-value pattern
- `src/context/TransactionDataContext.tsx` — provider value memoization, header construction
- `src/context/TagSpecContext.tsx` — split candidate
- `src/components/auth/LoginPage.tsx` — `!` assertions, external image, TOTP input refs
- `src/components/transactions/TransactionsTab.tsx` — god component, 5× localStorage init pattern
- `src/components/transactions/TransactionTable.tsx` — monolith, ColumnPicker extraction, regex caching, virtualization, row memoization
- `src/components/onboarding/OnboardingHub.tsx` — lazy-load target, `intro.js` private field access
- `src/hooks/useWizardForm.ts` — factory placement, return type, hardcoded swift code
- `src/types/transaction.ts` — `TransactionRow` shape
- `src/api/identity.ts` — discriminated union return type
- `src/api/apiError.ts`, `src/api/lovAttributes.ts` — `unknown` over `any` in parsers
- `src/utils/sha256.ts` — eligible for removal once server side coordinated
- `src/utils/shareLink.ts` — `note` length validation
- `index.html` — CSP
- `vite.config.ts` — `manualChunks`
- `tsconfig.app.json` — `noUncheckedIndexedAccess`
