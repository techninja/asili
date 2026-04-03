# Application-Specific Specifications

> This directory is yours. The upstream spec will never touch it.

## What Goes Here

Files in `docs/clearstack/` are managed by the upstream package.
Running `npx clearstack update` may overwrite them with newer versions.
**This `docs/app-spec/` directory is excluded from upstream updates** —
it's where your project's own conventions, domain-specific patterns,
and architectural decisions live.

## What to Document

| Document        | Example content                                                      |
| --------------- | -------------------------------------------------------------------- |
| `ENTITIES.md`   | Your domain entities, their relationships, field descriptions        |
| `PATTERNS.md`   | Project-specific component patterns, naming overrides                |
| `API.md`        | Custom API endpoints beyond the generic CRUD                         |
| `DEPLOYMENT.md` | How this project is built, deployed, and monitored                   |
| `DECISIONS.md`  | Architecture Decision Records — why you chose X over Y               |
| `OVERRIDES.md`  | Where your project intentionally deviates from the base spec and why |

## Rules

- **One topic per file.** Same as the base spec — split when it grows.
- **Link to the base spec** when extending it, not duplicating it.
- **Document deviations explicitly.** If you override a base spec convention,
  say which one and why. Future you (or your LLM) will thank you.
- **Keep it current.** If a pattern changes, update the doc in the same PR.

## How Updates Work

When you run `npx clearstack update`:

1. Files in `docs/clearstack/` are compared against the upstream package
2. Changed files are overwritten — review with `git diff docs/`
3. Files in `.configs/` are also synced to latest standards
4. **`docs/app-spec/` is never touched** — your files are safe
5. The `docs/clearstack/.specversion` file tracks which upstream version you synced from
