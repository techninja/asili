# Frontend Implementation Rules

## Hybrids.js "No-Build" Web Component Specification

> A concise, LLM-and-human-friendly specification for building web applications
> with Hybrids v9 using ES modules, no bundler, and atomic design principles.

---

## Table of Contents

**This file:** Foundation — philosophy, framework, structure, atomic design.

1. [Philosophy & Constraints](#1-philosophy--constraints)
2. [Framework Choice: Hybrids.js](#2-framework-choice-hybridsjs)
3. [Project Structure](#3-project-structure)
4. [Atomic Design Hierarchy](#4-atomic-design-hierarchy)

**Sub-specifications:**

| Document                                         | Covers                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [COMPONENT_PATTERNS.md](./COMPONENT_PATTERNS.md) | Authoring, light DOM, styling, layout engine, file size rules           |
| [JSDOC_TYPING.md](./JSDOC_TYPING.md)             | JSDoc typing strategy, tsc validation, component/model/handler patterns |
| [STATE_AND_ROUTING.md](./STATE_AND_ROUTING.md)   | Store, routing, unified app state, realtime sync                        |
| [CONVENTIONS.md](./CONVENTIONS.md)               | Naming conventions, anti-patterns                                       |
| [SERVER_AND_DEPS.md](./SERVER_AND_DEPS.md)       | Express server, import maps, vendor dependency loading                  |
| [BACKEND_API_SPEC.md](./BACKEND_API_SPEC.md)     | REST endpoints, JSON Schema via HEAD, entity CRUD, realtime sync        |
| [TESTING.md](./TESTING.md)                       | Testing philosophy, tools, patterns, build-phase checkpoints            |

---

## 1. Philosophy & Constraints

This specification defines a **zero-build** frontend architecture. No bundler,
no transpiler, no compile step. Code runs exactly as written.

### Core Principles

| Principle                    | Rule                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- |
| No build tools               | No Webpack, Vite, Rollup, esbuild, or Babel                                 |
| ES modules only              | All `.js` files are native ES modules served to the browser                 |
| Import maps                  | Bare specifiers (e.g. `"hybrids"`) resolved via `<script type="importmap">` |
| Small files                  | Every file ≤ **150 lines** before extracting shared logic                   |
| Explicit over implicit       | Name things clearly; avoid magic strings and hidden conventions             |
| Readable over clever         | Optimize for comprehension by humans and LLMs alike                         |
| Declarative over imperative  | Use framework patterns, not raw DOM manipulation                            |
| Composition over inheritance | Build complex UIs by composing small components                             |

### What This Means in Practice

- You can open any `.js` file in the browser devtools and see the source as-is.
- Adding a new component means creating files and importing them — no config.
- Third-party dependencies are vendored as ES modules at install time.
- The server is a thin static file host with no middleware transforms.

### Constraints

- **No TypeScript** — plain JavaScript with JSDoc comments where types help.
- **No CSS preprocessors** — plain CSS with custom properties for tokens.
- **No framework CLI** — manual file creation following this spec's conventions.
- **No dynamic `import()` for core components** — static imports for the
  dependency graph to remain visible and traceable.
- **Node.js ≥ 18** — required for the Express server and `--watch` flag.

---

## 2. Framework Choice: Hybrids.js

We use **[Hybrids v9](https://hybrids.js.org)** — a functional, declarative
web component framework built on plain objects and pure functions.

### Why Hybrids

| Need         | Hybrids Provides                                                |
| ------------ | --------------------------------------------------------------- |
| Components   | `define()` — plain object definitions, no classes               |
| Templating   | `html``` — tagged template literals with reactive bindings      |
| State        | `store()` — global state with async storage, caching, relations |
| Routing      | `router()` — view-graph-based routing with guards and dialogs   |
| Layout       | `layout=""` attribute — CSS layout engine in templates          |
| Localization | `localize()` — automatic template translation                   |
| ES modules   | Ships as raw ES modules in `src/` — no build needed             |

### API Surface (v9.1)

These are the only imports you need:

```javascript
import {
  define, // Register a component
  html, // Template tagged literal
  store, // State management
  router, // Routing
  mount, // Mount component on existing element
  parent, // Access parent component
  children, // Access child components
  dispatch, // Dispatch custom events
  msg, // Localization messages
  localize, // Register translations
} from 'hybrids';
```

### Why Not Alternatives

| Alternative          | Reason to pass                                                     |
| -------------------- | ------------------------------------------------------------------ |
| **Lit**              | Class-based, heavier API surface, decorators encourage build tools |
| **Stencil**          | Requires a compiler — violates no-build constraint                 |
| **Vanilla**          | No state management, no templating — too much boilerplate          |
| **React/Vue/Svelte** | Require build steps, not native web components                     |

---

## 3. Project Structure

```
project-root/
├── src/                             # The app — served directly, no build
│   ├── index.html                   # App shell with import map
│   ├── vendor/                      # Vendored ES modules (generated, gitignored)
│   │   └── hybrids/                 # Copied from node_modules at install
│   ├── icons.json                   # Icon sprite (generated, gitignored)
│   │
│   ├── components/                  # UI components (atomic design)
│   │   ├── atoms/                   # Smallest UI primitives
│   │   │   └── app-button/
│   │   │       ├── app-button.js    # Component definition
│   │   │       ├── app-button.css   # Scoped styles
│   │   │       └── index.js         # Re-export
│   │   ├── molecules/               # Compositions of atoms
│   │   ├── organisms/               # Complex UI sections
│   │   └── templates/               # Page-level layout shells
│   │
│   ├── pages/                       # Route-bound view components
│   │   └── home/
│   │       └── home-view.js
│   │
│   ├── store/                       # Hybrids store model definitions
│   │   ├── AppState.js              # Singleton: global app state
│   │   └── UserPrefs.js             # Singleton: user preferences
│   │
│   ├── router/                      # Router shell component
│   │   └── index.js
│   │
│   ├── styles/                      # Shared CSS
│   │   ├── tokens.css               # Design tokens (colors, spacing)
│   │   ├── reset.css                # Minimal CSS reset
│   │   └── components.css           # Aggregates component CSS imports
│   │
│   ├── utils/                       # Pure helper functions
│   │   └── formatDate.js
│   │
│   ├── api/                         # Server routes (fullstack only)
│   │   ├── entities.js              # Generic CRUD router
│   │   └── schemas.js               # JSON Schema registry
│   │
│   └── server.js                    # Express entry point
│
├── scripts/                         # Install/setup scripts
│   ├── vendor-deps.js               # Copies deps to src/vendor/
│   └── build-icons.js               # Extracts Lucide SVGs to src/icons.json
│
├── .configs/                        # Linter/formatter/type configs
├── docs/
│   ├── clearstack/                  # Spec docs (synced on update)
│   └── app-spec/                    # Project-specific specs (yours)
│
├── data/                            # JSON DB seed (fullstack only)
├── .env                             # Defaults (committed)
├── .env.local                       # Overrides (gitignored)
└── package.json
```

### Key Conventions

- **One component per directory.** Each gets its own folder with `.js`, `.css`,
  and `index.js` (re-export).
- **`src/` is served as-is** — the browser loads these files directly.
- **`src/vendor/`** is gitignored and regenerated on `npm install` via the
  `postinstall` script.
- **No barrel files** beyond the per-component `index.js`. Import from the
  component directory, not from a giant `components/index.js`.
- **Pages are not components.** They live in `src/pages/`, not in
  `src/components/`. They compose components but are themselves route targets.

---

## 4. Atomic Design Hierarchy

Components are organized into four tiers. Each tier has a clear scope and
import direction: **higher tiers import from lower tiers, never the reverse.**

### Tiers

| Tier         | Location                | Scope                                                              | Examples                                |
| ------------ | ----------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| **Atom**     | `components/atoms/`     | Single-purpose UI primitive. One element, one job.                 | `app-button`, `app-icon`, `app-input`   |
| **Molecule** | `components/molecules/` | Small composition of 2–4 atoms that form a reusable unit.          | `nav-link`, `search-bar`, `form-field`  |
| **Organism** | `components/organisms/` | Complex UI section. May contain molecules, atoms, and local state. | `app-header`, `app-footer`, `user-card` |
| **Template** | `components/templates/` | Page-level layout shell. Defines slot regions, no business logic.  | `page-layout`, `dashboard-layout`       |

**Pages** (`src/pages/`) sit outside the component hierarchy. They are
route-bound views that compose templates and organisms.

### Import Direction

```
Pages → Templates → Organisms → Molecules → Atoms
                                                ↑
                                          Store / Utils
```

- Atoms import **nothing** from other component tiers.
- Molecules import only from **atoms**.
- Organisms import from **molecules** and **atoms**.
- Templates import from **organisms**, **molecules**, and **atoms**.
- Pages import from **any component tier** and from **store/router**.
- **Store models and utils** are shared — any tier may import them.

### When to Promote a Component

Use this checklist to decide if a component belongs at a higher tier:

| Signal                                         | Action                  |
| ---------------------------------------------- | ----------------------- |
| It renders a single HTML element with props    | Keep as **atom**        |
| It composes 2–4 atoms into a reusable group    | Make it a **molecule**  |
| It has its own local state or fetches data     | Promote to **organism** |
| It defines layout regions via slots, no logic  | Make it a **template**  |
| It's bound to a route and composes a full page | Put it in **pages/**    |

### File Anatomy (All Tiers)

Every component directory contains exactly three files:

```
app-button/
├── app-button.js    # Component definition (define + html + logic)
├── app-button.css   # Scoped styles for this component
└── index.js         # export { default } from './app-button.js';
```

If a component needs helpers that push it past 150 lines, extract them to
`src/utils/` — not into sibling files within the component directory.
