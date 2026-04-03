# JSDoc Typing Strategy

## Type Safety Without TypeScript

> JSDoc annotations provide editor intellisense, LLM comprehension, and
> compile-time type checking — all without a build step.
> See [COMPONENT_PATTERNS.md](./COMPONENT_PATTERNS.md) for component authoring.

---

## How It Works

TypeScript's `tsc` compiler validates JSDoc annotations via `--checkJs`,
giving us compile-time type checking without a build step.

A `jsconfig.json` at the project root enables `checkJs: true`. Running
`npm run typecheck` invokes `tsc --project jsconfig.json` which:

1. Reads all `.js` files in `src/` and `scripts/`
2. Parses JSDoc annotations as type information
3. Reports type errors exactly like TypeScript would
4. Emits nothing — `noEmit: true`

This means `@typedef`, `@type`, `@param`, and `@returns` are not just
documentation — they are **enforced types**.

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

## Rules

- Every exported component gets a `@typedef` for its host interface.
- Every store model gets a `@typedef` for its shape.
- Event handlers document `host` and `event` param types.
- Keep JSDoc blocks to 3–5 lines. No novels.
- Use `/** @type {any} */ (expr)` for framework type limitations (e.g.
  `store.pending()` on array results) — document why with a comment.
- Run `npm run typecheck` before committing. Zero errors required.
