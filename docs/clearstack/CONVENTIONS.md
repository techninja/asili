# Conventions

## Naming Rules & Anti-Patterns

> Quick reference for naming and what to avoid.
> See [FRONTEND_IMPLEMENTATION_RULES.md](./FRONTEND_IMPLEMENTATION_RULES.md) for
> the full specification index.

---

## Naming Conventions

### Component Tags

All custom element tags use **kebab-case** with an `app-` prefix:

| Thing                | Name          | Tag             |
| -------------------- | ------------- | --------------- |
| Button atom          | `app-button`  | `<app-button>`  |
| Header organism      | `app-header`  | `<app-header>`  |
| Page layout template | `page-layout` | `<page-layout>` |
| Home page view       | `home-view`   | `<home-view>`   |

The `app-` prefix prevents collisions with native elements and third-party
components. Page views and templates may drop the prefix when unambiguous.

### Files & Directories

| Type             | Convention        | Example                   |
| ---------------- | ----------------- | ------------------------- |
| Component file   | Match tag name    | `app-button.js`           |
| Component CSS    | Match tag name    | `app-button.css`          |
| Component dir    | Match tag name    | `app-button/`             |
| Re-export        | Always `index.js` | `index.js`                |
| Store model      | PascalCase        | `UserModel.js`            |
| Utility function | camelCase         | `formatDate.js`           |
| Shared CSS       | Descriptive kebab | `tokens.css`, `reset.css` |

### JavaScript

| Type              | Convention        | Example                       |
| ----------------- | ----------------- | ----------------------------- |
| Event handlers    | `handle` + action | `handleClick`, `handleSubmit` |
| Store models      | PascalCase noun   | `UserModel`, `AppState`       |
| Utility functions | camelCase verb    | `formatDate`, `parseQuery`    |
| Constants         | UPPER_SNAKE       | `MAX_RETRIES`, `API_BASE`     |
| JSDoc typedefs    | PascalCase        | `@typedef {Object} User`      |

---

## Anti-Patterns

### ❌ Never Do This

**DOM queries inside components:**

```javascript
// BAD — breaks encapsulation, ignores shadow DOM
const el = document.querySelector('.my-thing');
```

**Manual event listeners:**

```javascript
// BAD — leaks memory, bypasses hybrids lifecycle
connectedCallback() {
  this.addEventListener('click', this.onClick);
}
```

**Global mutable state:**

```javascript
// BAD — invisible dependencies, untraceable bugs
window.appState = { user: null };
```

**Imperative DOM manipulation:**

```javascript
// BAD — fights the reactive render cycle
host.shadowRoot.querySelector('span').textContent = 'updated';
```

**Business logic in render:**

```javascript
// BAD — render should be pure projection of state
render: ({ items }) => html`
  <ul>${items.filter(i => i.active).sort((a,b) => a.name.localeCompare(b.name)).map(...)}</ul>
`,
```

**Files over 150 lines:**

```
// BAD — extract to utils/ or split into sub-components
```

**Deep nesting (>3 component levels):**

```
// BAD — flatten by composing at the page level
<app-layout>
  <app-sidebar>
    <nav-section>
      <nav-group>        ← too deep
```

---

## Import Map Aliases

All cross-directory imports in browser-facing code use `#prefix/` aliases
defined in the import map (`src/index.html`). This eliminates fragile
relative paths like `../../../utils/foo.js`.

### Available Prefixes

| Prefix        | Resolves to              |
| ------------- | ------------------------ |
| `#store/`     | `/store/`                |
| `#utils/`     | `/utils/`                |
| `#atoms/`     | `/components/atoms/`     |
| `#molecules/` | `/components/molecules/` |
| `#organisms/` | `/components/organisms/` |
| `#templates/` | `/components/templates/` |
| `#pages/`     | `/pages/`                |

### Rules

- **No `../` imports.** The spec check (`npm run spec`) flags any `../`
  in browser-facing JS. Use a `#prefix/` alias instead.
- **Same-directory `./` is fine.** `index.js` re-exports and co-located
  files use `./` naturally.
- **Server/API files are exempt.** `src/api/` and `src/server.js` run in
  Node, not the browser — they use `./` relative imports.
- **Test files are exempt.** `*.test.js` files may use relative paths.
- **jsconfig.json mirrors the import map.** The `paths` entries in
  `.configs/jsconfig.json` let `tsc --checkJs` resolve `#prefix/` imports.

### Examples

```javascript
// ✅ Good — clear, refactor-safe
import AppState from '#store/AppState.js';
import { formatDate } from '#utils/formatDate.js';
import '#atoms/app-badge/app-badge.js';

// ❌ Bad — fragile, hard to read
import AppState from '../../../store/AppState.js';
```

---

## Error Handling

Errors are handled **at the boundary where they are actionable.** Each layer
has a single responsibility — catch only what you can meaningfully respond to,
let everything else propagate.

### Boundary Rules

| Layer                | Responsibility                                                                 | Example                                                               |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Utils**            | Never catch. Return error values or throw. Caller decides.                     | `formatDate(null)` returns `''`                                       |
| **Store connectors** | Let fetch failures propagate. Hybrids' `store.error()` catches them.           | Don't wrap fetch in try/catch                                         |
| **Components**       | Display `store.pending()` / `store.error()` states. Never try/catch in render. | `${store.error(model) && html`<div class="error-message">...</div>`}` |
| **Event handlers**   | Guard with `store.ready()` before accessing store properties.                  | `if (!store.ready(host.state)) return;`                               |
| **Server routes**    | Return HTTP status + JSON error body. Never crash the process.                 | `res.status(404).json({ error: 'Not found' })`                        |
| **Server infra**     | Handle process-level errors with clear messages and exit codes.                | Port conflict → log message → `process.exit(1)`                       |

### Why This Matters

If a store connector catches its own fetch error, `store.error()` never fires
and the component can't show an error state. If a utility swallows an
exception, the caller can't decide how to handle it. Each layer trusts the
next layer up to handle what it can't.

### ❌ Don't

```javascript
// BAD — swallows the error, store.error() never fires
[store.connect]: {
  get: async (id) => {
    try { return await fetch(`/api/items/${id}`).then(r => r.json()); }
    catch { return null; }  // silent failure
  },
}
```

```javascript
// BAD — accesses store properties without ready guard
function toggle(host) {
  const next = host.state.theme === 'light' ? 'dark' : 'light';
  store.set(host.state, { theme: next }); // crashes if model is in error state
}
```

```javascript
// BAD — silent catch hides the failure completely
try {
  store.clear([Model]);
} catch {
  /* list may not exist */
}
```

**Never use empty `catch` blocks.** If you catch to prevent crashing,
you must `console.warn` or `console.error` so the failure is visible.
Silent catches turn bugs into ghosts — things "just don't work" with
zero console output to trace.

### ✅ Do

```javascript
// GOOD — let it throw, component handles via store.error()
[store.connect]: {
  get: (id) => fetch(`/api/items/${id}`).then(r => r.json()),
}
```

```javascript
// GOOD — guard before accessing properties
function toggle(host) {
  if (!store.ready(host.state)) return;
  const next = host.state.theme === 'light' ? 'dark' : 'light';
  store.set(host.state, { theme: next });
}
```

```javascript
// GOOD — catch to prevent crash, but log so failures are visible
try {
  store.clear([Model]);
} catch (e) {
  console.warn('[store] clear failed:', e.message);
}
```

---

### ✅ Always Do This

**Declarative event binding:**

```javascript
html`<button onclick="${handleClick}">Go</button>`;
```

**Store for shared state:**

```javascript
state: store(AppState),
```

**Pure functions for logic:**

```javascript
// In src/utils/filterActive.js
export const filterActive = (items) => items.filter(i => i.active);

// In component — use import map alias, never ../
import { filterActive } from '#utils/filterActive.js';
render: ({ items }) => html`<ul>${filterActive(items).map(...)}</ul>`,
```

**JSDoc on all exports:**

```javascript
/** @param {User} user */
export const fullName = (user) => `${user.firstName} ${user.lastName}`;
```

---

## File Size: Why 150 Lines

The 150-line limit isn't about the number — it's about **context cost**.
A 400-line file isn't hard to scroll through, but it's expensive to
_hold in mind_. Humans can only reason about a limited scope at once.
LLMs face the same constraint differently: every token spent reading a
bloated file is a token not spent on the actual task. Small files mean
context is spent on _building_, not on _understanding what you're
looking at_.

When every file is small enough to comprehend in one pass, both humans
and LLMs can generate, review, and modify code without re-reading
unrelated sections. Refactors become safe because the blast radius of
any change is one small file. The limit forces decomposition into
concept-sized units — not arbitrary chunks, but files where each one
answers a single question.

Treat **~120 lines as a yellow light.** When a file passes 120 lines:

1. Add a `// SPLIT CANDIDATE:` comment noting where a logical split could happen
2. Continue working — don't split mid-feature
3. Split when the file hits 150 or when the feature is complete

This prevents premature extraction while keeping the eventual split obvious.

```javascript
// SPLIT CANDIDATE: moveObj/resizeObj could extract to canvasTransform.js
function moveObj(o, dx, dy) { ... }
```

### When a File Exceeds 150 Lines

The **only correct response** is to split the file into two or more files.
The concepts have outgrown the container — find the seam between them
and give each its own file. Never do any of the following to reduce
line count:

- Remove or shorten JSDoc comments
- Collapse multi-line expressions onto one line
- Remove blank lines between logical sections
- Combine unrelated functions into one
- Delete code that is still needed

These make the code harder to read, which defeats the purpose of the limit.
The limit exists to force decomposition, not compression.

The spec checker runs formatters (Prettier, ESLint `--fix`) **before**
counting lines, so the line count always reflects the formatted result.
Write code in its natural readable form, run `npm run spec all`, and if
a file is over the limit, split it.

---

## npm Scripts: One Entry Point Per Domain

Every `package.json` script should be a single, discoverable entry point.
Avoid the `name:variant` colon pattern that fragments a domain across
multiple keys.

### Rules

- **One script per domain.** `test`, `spec`, `lint` — not `test:node`,
  `test:browser`, `lint:fix`, `spec:code`, `spec:docs`.
- **Arguments over aliases.** `pnpm spec code` instead of
  `pnpm spec:code`. The CLI handles routing.
- **Interactive by default.** Running `pnpm spec` with no arguments shows
  a menu of available actions. Users discover commands by using the tool.
- **Direct invocation for power users.** Once you know the subcommand,
  skip the menu: `pnpm spec check`, `pnpm spec update`.
- **Self-documenting.** Each script's CLI should print usage when given
  `help` or an unknown argument.

### Why

- Fewer script entries = less package.json bloat
- Discoverability through interactive menus beats memorizing key names
- Scripts grow via subcommands, not new `package.json` entries
- Consistent with how real CLIs work (`git`, `docker`, `npm` itself)

### Example

```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch --env-file=.env src/server.js",
    "test": "node --test tests/*.test.js",
    "spec": "clearstack"
  }
}
```

`pnpm spec` → interactive menu. `pnpm spec check` → run checks.
`pnpm spec update` → sync docs. One entry, full access.

---

## Spec vs Test: Two Different Questions

`spec` and `test` answer different questions and run at different times.

|            | `npm run spec`                             | `npm test`                       |
| ---------- | ------------------------------------------ | -------------------------------- |
| Asks       | Is my code clean?                          | Does my code work?               |
| Checks     | Line counts, lint, format, types, markdown | Unit, integration, browser tests |
| Speed      | Fast (~10s)                                | Slower (varies)                  |
| When       | Every save, every change                   | Before commit, in CI             |
| Auto-fixes | Yes (lint, format, markdown)               | No                               |

Spec is the inner dev loop — run it constantly. Tests are the commit gate —
run them before pushing. CI runs both, in parallel.

### Spec Output Contract

The spec checker is designed for **minimal, complete output**. Every check
prints exactly one line: ✅ on pass, ❌ on fail with the violating file and
reason. The final summary is 2 lines (`N/N checks passed`).

Total output for a passing run is ~12 lines. A failing run adds one line
per violation with the exact file path and what to fix.

**Do not pipe, grep, tail, or filter spec output.** It is already the
minimal actionable result. Filtering it discards the violation details
that tell you which file to fix, forcing redundant re-runs.

To narrow scope, run a targeted check instead of filtering `all`:

```bash
# Run everything
npm run spec all

# Run one check by key
npm run spec code          # line counts (code files ≤150)
npm run spec docs          # line counts (doc files ≤500)
npm run spec imports       # import map aliases (no ../)
npm run spec types         # all jsconfigs (auto-discovered)
npm run spec types frontend # just .configs/jsconfig.json
npm run spec audit         # security audit

# Parent keys run all children
npm run spec lint           # ESLint + Stylelint + Markdown lint
npm run spec format         # Prettier (all formatters)

# Child keys run one
npm run spec lint es        # ESLint only
npm run spec lint css       # Stylelint only
npm run spec lint md        # Markdown lint only
npm run spec format prettier
```

```bash
# ❌ Wrong — discards violation file paths
npm run spec all 2>&1 | tail -3
npm run spec all 2>&1 | grep -E "pass|fail"
```

This matters especially for LLM-assisted development: the spec output is
structured so an LLM can read it in one pass, identify the failing file,
and fix it without re-running the check. Filtering breaks that loop.

---

## Session Retrospective

At the end of each implementation session, ask:

1. **What patterns did we discover?** Document in the relevant spec doc.
2. **What broke that we didn't expect?** Add to BUILD_LOG discoveries.
3. **What tests would catch the bugs we found?** Write them before committing.
4. **Did any files grow past the yellow light?** Split or add split markers.
5. **Did the spec need correction?** Update it — the spec improves through use.

This practice is what keeps the spec alive and accurate.
