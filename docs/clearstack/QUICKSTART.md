# Quickstart

Get a spec-compliant project running, develop against it, and keep it in sync as the spec evolves.

## Prerequisites

- Node.js ≥ 22
- npm, pnpm, or yarn

## 1. Install Clearstack

Clearstack is a dev dependency — it lives in your project and manages spec docs, configs, and compliance checks.

```bash
npm install --save-dev @techninja/clearstack
# or
pnpm add -D @techninja/clearstack
```

## 2. Scaffold Your Project

From your project root:

```bash
npx clearstack init        # interactive
npx clearstack init -y     # non-interactive (defaults)
```

The interactive prompt asks for:

| Prompt       | Default                | Notes                                                                             |
| ------------ | ---------------------- | --------------------------------------------------------------------------------- |
| Project name | current directory name | Used in package.json and templates                                                |
| Description  | `A Clearstack project` | Goes into package.json                                                            |
| Mode         | —                      | **Fullstack**: Express + WebSocket + JSON DB + SSE. **Static**: localStorage only |
| Port         | `3000`                 | Fullstack only. Set in `.env`                                                     |

If a `package.json` already exists, Clearstack merges into it — your existing fields (`author`, `license`, `engines`, `keywords`, etc.) are preserved.

## 3. What Gets Created

```
your-project/
├── .configs/              # ⟳ Managed — synced on update
├── .github/               # CI workflow, PR + issue templates
├── docs/
│   ├── clearstack/        # ⟳ Managed — spec docs, synced on update
│   └── app-spec/          # ✏️ Yours — project-specific specs
├── scripts/               # ✏️ Yours — setup, test, vendor-deps, build-icons
├── src/                   # ✏️ Yours — the app, served directly
│   ├── index.html         # App shell with import map
│   ├── vendor/            # Vendored ES modules (generated, gitignored)
│   ├── icons.json         # Icon sprite (generated, gitignored)
│   ├── components/        # atoms/, molecules/, organisms/
│   ├── pages/             # Route-level views
│   ├── store/             # Hybrids store models
│   ├── styles/            # Global CSS
│   ├── router/            # Client-side routing
│   ├── utils/             # Shared helpers
│   ├── api/               # Server routes (fullstack only)
│   └── server.js          # Express entry point
├── data/                  # JSON DB seed (fullstack only)
├── .env                   # Defaults (committed)
├── .env.local             # Overrides (gitignored)
└── package.json
```

`src/` is the entire app. `node src/server.js` serves it. For static deploy, point your CDN at `src/`. No build step.

## 4. Install and Run

```bash
npm install
```

`postinstall` runs `vendor-deps.js` (copies hybrids to `src/vendor/`) and `build-icons.js` (extracts Lucide SVGs to `src/icons.json`).

### Fullstack

```bash
npm run dev
```

## 5. Development Rules

- **≤150 lines per `.js` / `.css` file.** Add `// SPLIT CANDIDATE:` at ~120 lines.
- **Light DOM by default.** No `shadowRoot`. Shared styles in `src/styles/` apply everywhere.
- **JSDoc for types.** `@typedef`, `@param`, `@returns` — validated by `tsc --checkJs`.
- **No build step.** Every file runs as-is in the browser via ES modules and import maps.

## 6. Project-Specific Specs

`docs/app-spec/` is yours. Upstream updates never touch it. Use it for:

- Entity schemas and relationships
- Project-specific component patterns
- API documentation beyond the base spec
- Architecture decisions (ADRs)
- Deviations from the base spec (with rationale)

See [docs/app-spec/README.md](./app-spec/README.md) for examples.

## 7. Updating

When Clearstack releases a new version:

```bash
npm update @techninja/clearstack    # bump the package
npm run spec:update                 # sync docs + configs
git diff docs/ .configs/            # review what changed
```

This updates:

- `docs/clearstack/*.md` — spec documentation
- `.configs/*` — linter, formatter, type checker, test runner configs

This never touches:

- `docs/app-spec/` — your project specs
- `src/` — your code
- `scripts/` — your build scripts
- `.env` — your thresholds and settings

## 8. Spec Compliance

```bash
npm run spec           # full check via clearstack binary
npm run spec:code      # code files ≤150 lines
npm run spec:docs      # doc files ≤500 lines
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier auto-format
npm run typecheck      # JSDoc type validation
npm test               # Node + browser tests
```

### Configuring thresholds

Override defaults in `.env`:

```bash
SPEC_CODE_MAX_LINES=150
SPEC_DOCS_MAX_LINES=500
SPEC_CODE_EXTENSIONS=.js,.css
SPEC_DOCS_EXTENSIONS=.md
SPEC_IGNORE_DIRS=node_modules,src/vendor,.git,.configs
```

## 9. CI Pipeline

The scaffolded `.github/workflows/spec.yml` runs all checks on every PR:

```
spec:code → spec:docs → lint → format → typecheck → test
```

## Summary

| Task                  | Command                                |
| --------------------- | -------------------------------------- |
| Install Clearstack    | `npm install -D @techninja/clearstack` |
| Scaffold a project    | `npx clearstack init`                  |
| Install dependencies  | `npm install`                          |
| Start dev server      | `npm run dev`                          |
| Lint + format         | `npm run lint:fix && npm run format`   |
| Type check            | `npm run typecheck`                    |
| Run tests             | `npm test`                             |
| Full spec check       | `npm run spec`                         |
| Update spec + configs | `npm run spec:update`                  |
| Review spec changes   | `git diff docs/ .configs/`             |
