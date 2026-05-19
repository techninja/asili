# JSDoc Typing Strategy

## Type Safety Without TypeScript

> JSDoc annotations provide editor intellisense, LLM comprehension, and
> compile-time type checking — all without a build step.
> See [COMPONENT_PATTERNS.md](./COMPONENT_PATTERNS.md) for component authoring.

---

## How It Works

TypeScript's `tsc` compiler validates JSDoc annotations via `--checkJs`,
giving us compile-time type checking without a build step.

A `jsconfig.json` at `.configs/jsconfig.json` enables `checkJs: true` for
frontend code. Running `npm run spec types` invokes `tsc` against it.

1. Reads all `.js` files in `src/` and `scripts/`
2. Parses JSDoc annotations as type information
3. Reports type errors exactly like TypeScript would
4. Emits nothing — `noEmit: true`

This means `@typedef`, `@type`, `@param`, and `@returns` are not just
documentation — they are **enforced types**.

### Multiple Type Configs

The spec checker auto-discovers `jsconfig.json` files in subdirectories.
If your project has a separate backend (e.g. `api/`) with its own
dependencies and module resolution, add `api/jsconfig.json`:

```
your-project/
├── .configs/jsconfig.json    ← frontend (src/, scripts/)
└── api/jsconfig.json         ← backend (api/, auto-discovered)
```

```bash
npm run spec types            # runs all discovered jsconfigs
npm run spec types frontend   # just .configs/jsconfig.json
npm run spec types api        # just api/jsconfig.json
```

The child key matches the directory name. Both must pass for
`npm run spec all` to succeed.

---

## Component Properties

```javascript
/**
 * @typedef {Object} AppButtonHost
 * @property {string} label - Button display text
 * @property {'primary'|'secondary'|'ghost'} variant - Visual style
 * @property {boolean} disabled - Disabled state
 */

/** @type {import('hybrids').Component<AppButtonHost>} */
export default define({
  tag: 'app-button',
  label: '',
  variant: 'primary',
  disabled: false,
  render: ({ label, variant, disabled }) => html`
    <button class="${variant}" disabled="${disabled}">${label}</button>
  `,
});
```

## Store Models

```javascript
/**
 * @typedef {Object} User
 * @property {string} id - Unique identifier
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 */

/** @type {import('hybrids').Model<User>} */
const UserModel = { id: true, firstName: '', lastName: '', email: '' };
```

## Event Handlers

```javascript
/**
 * Increment the counter on the host element.
 * @param {AppCounterHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleClick(host, event) {
  host.count++;
}
```

## Enumerable Models Need `@type {any}`

Hybrids' TypeScript definitions don't support `id: true` on `Model<T>` —
`tsc` rejects it because `id` isn't in the typedef. The fix is to type
the entire model as `any` with a comment explaining why:

```javascript
/** @type {any} — hybrids Model with id:true; cast to bypass tsc limitations */
const Product = {
  id: true,
  name: '',
  // ...
  [store.connect]: { get: ..., list: ... },
};
```

Do **not** add `id` to the `@typedef` — it's a hybrids directive, not a
data field. The `@typedef` should describe the shape of the data.

## List Store Properties Need Casts

`store([Model])` returns a descriptor that `tsc` can't reconcile with
array-typed host properties. Both the descriptor and `store.ready()` calls
need `any` casts:

```javascript
/**
 * @typedef {Object} MyGridHost
 * @property {any} items — list store, cast for tsc
 */

/** @type {import('hybrids').Component<MyGridHost>} */
export default define({
  tag: 'my-grid',
  items: /** @type {any} */ (store([Product], { id: () => ({}) })),
  render: {
    value: ({ items }) => html`
      ${
        /** @type {any} */ (store).ready(items)
          ? /** @type {any[]} */ (items).map((i) => html`<span>${i.name}</span>`)
          : html`<p>Loading…</p>`
      }
    `,
    shadow: false,
  },
});
```

Three casts are needed:

1. `/** @type {any} */` on the `store([Model])` descriptor assignment
2. `/** @type {any} */ (store).ready(items)` — `store.ready()` overloads
   reject array-typed arguments
3. `/** @type {any[]} */ (items)` before calling `.map()` / `.filter()`

## `list` Connector Params Are `ModelIdentifier`

The `list` connector receives a `ModelIdentifier`, not a plain object.
Accessing custom filter properties (like `.category`) requires a cast:

```javascript
list: async (params) => {
  const category = /** @type {any} */ (params)?.category;
  // ...
},
```

## Rules

- Every exported component gets a `@typedef` for its host interface.
- Every store model gets a `@typedef` for its shape.
- Event handlers document `host` and `event` param types.
- Keep JSDoc blocks to 3–5 lines. No novels.
- Use `/** @type {any} */ (expr)` for framework type limitations (e.g.
  `store.pending()` on array results) — document why with a comment.
- Run `npm run spec types` before committing. Zero errors required.
