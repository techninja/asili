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

// In component
import { filterActive } from '../../utils/filterActive.js';
render: ({ items }) => html`<ul>${filterActive(items).map(...)}</ul>`,
```

**JSDoc on all exports:**

```javascript
/** @param {User} user */
export const fullName = (user) => `${user.firstName} ${user.lastName}`;
```

---

## File Size: Soft Warnings Before Hard Limits

The 150-line limit is a hard gate in CI, but treat **~120 lines as a yellow
light.** When a file passes 120 lines:

1. Add a `// SPLIT CANDIDATE:` comment noting where a logical split could happen
2. Continue working — don't split mid-feature
3. Split when the file hits 150 or when the feature is complete

This prevents premature extraction while keeping the eventual split obvious.

```javascript
// SPLIT CANDIDATE: moveObj/resizeObj could extract to canvasTransform.js
function moveObj(o, dx, dy) { ... }
```

---

## npm Scripts: One Entry Point Per Domain

Every `package.json` script should be a single, discoverable entry point.
Avoid the `name:variant` colon pattern that fragments a domain across
multiple keys.

### Rules

- **One script per domain.** `test`, `spec`, `lint` — not `test:node`,
  `test:browser`, `lint:fix`, `spec:code`, `spec:docs`.
- **Arguments over aliases.** `pnpm spec check code` instead of
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

---

## Session Retrospective

At the end of each implementation session, ask:

1. **What patterns did we discover?** Document in the relevant spec doc.
2. **What broke that we didn't expect?** Add to BUILD_LOG discoveries.
3. **What tests would catch the bugs we found?** Write them before committing.
4. **Did any files grow past the yellow light?** Split or add split markers.
5. **Did the spec need correction?** Update it — the spec improves through use.

This practice is what keeps the spec alive and accurate.
