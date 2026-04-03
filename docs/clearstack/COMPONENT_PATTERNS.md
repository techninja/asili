# Component Patterns

## Authoring, Styling, Templates & JSDoc Typing

> How to write, style, and type components in this framework.
> See [FRONTEND_IMPLEMENTATION_RULES.md](./FRONTEND_IMPLEMENTATION_RULES.md) for
> project structure and atomic design hierarchy.

---

## Component Authoring

Every component is a plain object passed to `define()`. No classes.

### Minimal Component

```javascript
import { html, define } from 'hybrids';

export default define({
  tag: 'app-button',
  label: '',
  render: {
    value: ({ label }) => html`<button>${label}</button>`,
    shadow: false,
  },
});
```

Note: `shadow: false` is required on every component in this framework.
See the Light DOM section below for why.

### Property Types

Properties are declared as default values. Hybrids infers the type:

| Declaration         | Type         | Reflected to attribute |
| ------------------- | ------------ | ---------------------- |
| `count: 0`          | Number       | Yes                    |
| `label: ''`         | String       | Yes                    |
| `active: false`     | Boolean      | Yes                    |
| `items: []`         | Array/Object | No                     |
| `onClick: () => {}` | Function     | No                     |

### Property Descriptors

For advanced behavior, use the descriptor form:

```javascript
export default define({
  tag: 'app-timer',
  elapsed: {
    value: 0,
    connect(host, key, invalidate) {
      const id = setInterval(() => {
        host.elapsed++;
      }, 1000);
      return () => clearInterval(id); // cleanup on disconnect
    },
    observe(host, value) {
      if (value >= 60) dispatch(host, 'timeout');
    },
  },
  render: ({ elapsed }) => html`<span>${elapsed}s</span>`,
});
```

| Descriptor field                  | Purpose                                           |
| --------------------------------- | ------------------------------------------------- |
| `value`                           | Default value or factory function                 |
| `connect(host, key, invalidate)`  | Runs on DOM connect. Return cleanup fn.           |
| `observe(host, value, lastValue)` | Runs when value changes                           |
| `reflect`                         | `true` or `(value) => string` — sync to attribute |

### Event Handling

Always bind events in templates. Never use `addEventListener`.

```javascript
function handleClick(host, event) {
  host.count++;
}

export default define({
  tag: 'app-counter',
  count: 0,
  render: ({ count }) => html` <button onclick="${handleClick}">Count: ${count}</button> `,
});
```

For input binding, use `html.set()`:

```javascript
render: ({ query }) => html`
  <input value="${query}" oninput="${html.set('query')}" />
`,
```

### Event Handler Host Context

In hybrids, the `host` parameter in an event handler resolves to the
**nearest hybrids component ancestor** in the DOM, not necessarily the
component that defined the handler.

This matters when passing templates as properties to other components
(e.g. `page-layout`'s `content` property). Inline arrow functions will
receive the **wrong host** — the template component, not your page.

```javascript
// ❌ BAD — host is page-layout, not my-page
render: {
  value: ({ showForm }) => html`
    <page-layout content="${html`
      <app-button onpress="${(host) => { host.showForm = true; }}"></app-button>
    `}"></page-layout>
  `,
},

// ✅ GOOD — named function, hybrids resolves host to the defining component
function toggleForm(host) {
  host.showForm = !host.showForm;
}
// ... in render:
<app-button onpress="${toggleForm}"></app-button>
```

**Rule: always use named functions for event handlers.** This ensures
hybrids resolves `host` to the component that owns the property, not
the nearest ancestor in the DOM tree. Inline arrows in nested templates
are the #1 source of "nothing happens when I click" bugs.

### Custom Events Must Bubble

In light DOM, custom events dispatched from child components must set
`bubbles: true` to reach parent listeners — especially when content is
passed as a template property through intermediate components.

```javascript
// ❌ BAD — event won't reach listeners above the dispatching component
dispatch(host, 'press');

// ✅ GOOD — event bubbles through the DOM tree
dispatch(host, 'press', { bubbles: true });
```

### When to Use `app-button` vs Plain `<button>`

Custom events from atoms can be unreliable when templates are passed as
properties through intermediate components (e.g. `page-layout`'s `content`).
The host context and event bubbling path may not resolve as expected.

| Context                              | Use                          | Why                                              |
| ------------------------------------ | ---------------------------- | ------------------------------------------------ |
| Inside a component's own template    | `app-button`                 | Host context is correct, events bubble normally  |
| Inside a `content` template property | Plain `<button class="btn">` | Direct `onclick` handler, no custom event needed |
| Reusable molecule/organism           | `app-button`                 | Encapsulated, predictable host                   |
| Page-level actions                   | Plain `<button class="btn">` | Simplest, most reliable                          |

The `.btn` classes are global (defined in `buttons.css`), so plain buttons
look identical to `app-button`. Use the atom when you need its component
API; use a plain button when you need reliable click handling in nested
templates.

### SVG Content via innerHTML

Hybrids' `html` template doesn't support dynamic SVG content well. For
canvas/whiteboard components that build SVG from data, use `innerHTML`
on a wrapper div:

```javascript
render: {
  value: (host) => html`
    <div class="canvas" innerHTML="${buildSvgString(host.objects)}"></div>
  `,
}
```

Event listeners must be re-attached in `observe` since `innerHTML`
replaces the DOM. Use a flag to avoid duplicate binding, and attach
persistent listeners (like `keydown`) to the host element instead.

### Coordinate Transforms for Rotated Objects

When objects have rotation via an outer `<g transform="rotate(...)">`:

- **Move:** Shift both the inner translate AND the rotation center by the
  same screen-space delta. No trigonometry needed.
- **Resize:** Unrotate the drag delta to align with the object's local axes.
- **Rotation center:** Store `rotationCx`/`rotationCy` on the object data
  so it persists across renders and reloads.

### Light DOM (Default)

All components in this framework use **light DOM** (`shadow: false`). This
means global stylesheets, shared CSS classes, and design tokens all apply
automatically — no style injection boilerplate.

```javascript
export default define({
  tag: 'app-button',
  label: '',
  render: {
    value: ({ label }) => html`<button>${label}</button>`,
    shadow: false,
  },
});
```

With light DOM, the component's rendered HTML lives in the main document
tree. CSS scoping is achieved through **native CSS nesting** on the tag name
(see Styling section below), not through shadow boundary.

### When to Use Shadow DOM

Shadow DOM is the exception, not the rule. Enable it only when:

| Situation                           | Why shadow DOM                      |
| ----------------------------------- | ----------------------------------- |
| Wrapping a third-party widget       | Prevent its styles from leaking out |
| Distributing a standalone component | Consumer's styles must not break it |
| Embedding untrusted content         | Hard style boundary needed          |

For an internal application where you control all the CSS, shadow DOM
creates more problems than it solves — you end up fighting it to inject
shared styles into every component.

### Inline Styles for Small Additions

When a component needs a few custom styles that don't warrant a `.css` file,
use `.css()` directly on the template:

```javascript
render: {
  value: ({ active }) => html`
    <span class="${active ? 'active' : ''}">${label}</span>
  `.css`
    :host { display: inline-block; }
    .active { font-weight: bold; color: var(--color-primary); }
  `,
  shadow: false,
},
```

This keeps small style additions co-located with the template. When inline
styles grow past ~10 rules, move them to the component's `.css` file.

### Content Composition (No Slots)

**`<slot>` is a shadow DOM feature.** It does not work with `shadow: false`.
Hybrids will throw if it finds a `<slot>` in a light DOM template.

**Template components break host context.** If you pass content as a property
to another component (e.g. `<page-layout content="${html`...`}">`), event
handlers inside that content will resolve `host` to the template component,
not the page that defined the handler. This makes buttons and forms silently
fail.

The solution: **use template functions, not template components**, for
page-level layout:

```javascript
// Template as a function — no component boundary, host context preserved
export function pageLayout(title, content) {
  return html`
    <div class="page-layout">
      <header>${title}</header>
      <main>${content}</main>
    </div>
  `;
}

// Page calls the function directly in its render
render: {
  value: ({ items }) => pageLayout('Home', html`
    <button onclick="${handleClick}">Works!</button>
    <ul>${items.map(...)}</ul>
  `),
  shadow: false,
},
```

Because `pageLayout` is a plain function (not a `define()`'d component),
there is no intermediate hybrids element in the DOM tree. The `onclick`
handler resolves `host` to the page component as expected.

---

## Styling

### Style Inheritance Model

Because components use light DOM, styles flow naturally:

```
src/index.html
  ├── <link> src/styles/reset.css      ← base reset
  ├── <link> src/styles/tokens.css     ← :root custom properties
  ├── <link> src/styles/shared.css     ← error states, icons, utilities
  └── <link> src/styles/components.css ← all component styles (loaded once)
```

Every component automatically inherits all shared styles. No injection needed.

### Three Layers of CSS

| Layer          | File(s)                                 | What goes here                                                            |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| **Tokens**     | `tokens.css`                            | `:root` custom properties — colors, spacing, type, radii, shadows         |
| **Shared**     | `shared.css`                            | Error states, loading states, icon base, screen-reader utils, transitions |
| **Components** | `components.css` + per-component `.css` | Styles scoped to tag names via native CSS nesting                         |

### Per-Component CSS with Native Nesting

Each component has a `.css` file that scopes styles using the tag name
as the top-level selector, with native CSS nesting inside:

```css
/* app-button/app-button.css */
app-button {
  display: inline-block;

  & button {
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: white;
    font: inherit;

    &:hover {
      background: var(--color-primary-hover);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &[variant='secondary'] button {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  &[variant='ghost'] button {
    background: transparent;
    color: var(--color-primary);
  }
}
```

This gives you **scoping by convention** — styles only apply inside the
component's tag. No shadow DOM needed, no style collisions.

### Loading Component Styles

Component `.css` files are imported into a single `src/styles/components.css`
that aggregates them:

```css
/* src/styles/components.css */
@import '../components/atoms/app-button/app-button.css';
@import '../components/atoms/app-badge/app-badge.css';
/* ... add as components are created ... */
```

This file is loaded once in `index.html`. Adding a new component means
adding one `@import` line.

### Design Tokens

Shared tokens live in `src/styles/tokens.css` as custom properties on `:root`.
These pierce all boundaries (even shadow DOM if ever used):

```css
:root {
  --color-primary: #2563eb;
  --space-md: 1rem;
  --radius-md: 0.375rem;
}
```

Components reference tokens, never hardcode values.

### Rules

- No CSS-in-JS libraries. No preprocessors. Native CSS only.
- One `.css` file per component, scoped via tag-name nesting.
- Shared patterns (error, loading, icons) go in `shared.css`.
- Use custom properties for all colors, spacing, and typography.
- Small inline styles via `.css()` are fine — move to file at ~10 rules.

---

## Templates & Layout Engine

### Tagged Template Literals

All templates use `html` from hybrids:

```javascript
html`<div>${expression}</div>`;
```

Expressions can be: strings, numbers, booleans, other templates, arrays of
templates, Promises (via `html.resolve()`), or event handlers.

### Layout Attributes

Hybrids' layout engine lets you declare CSS layout inline:

```javascript
render: () => html`
  <template layout="column gap:2">
    <header layout="row center gap">...</header>
    <main layout="grow">...</main>
    <footer layout@768px="hidden">...</footer>
  </template>
`,
```

| Attribute               | Effect                         |
| ----------------------- | ------------------------------ |
| `layout="row"`          | Flexbox row                    |
| `layout="column"`       | Flexbox column                 |
| `layout="grid:1\|max"`  | CSS grid with defined tracks   |
| `layout="grow"`         | `flex-grow: 1`                 |
| `layout="center"`       | Center content                 |
| `layout="gap:2"`        | Gap using spacing scale        |
| `layout@768px="hidden"` | Responsive — applies at ≥768px |

### Keyed Lists

For efficient list rendering, use `.key()`:

```javascript
render: ({ items }) => html`
  <ul>
    ${items.map(item => html`
      <li>${item.name}</li>
    `.key(item.id))}
  </ul>
`,
```

### Async Content

```javascript
render: ({ dataPromise }) => html`
  <div>
    ${html.resolve(dataPromise, html`<span>Loading...</span>`)}
  </div>
`,
```

---

## File Size & Decomposition

**Hard limit: 150 lines per file.** This applies to `.js` and `.css` alike.

### When a file grows too large

| Situation                         | Action                                   |
| --------------------------------- | ---------------------------------------- |
| Component logic exceeds 150 lines | Extract helpers to `src/utils/`          |
| Template is too complex           | Split into child sub-components          |
| CSS exceeds 150 lines             | Extract shared patterns to `src/styles/` |
| Store model has many relations    | Split related models into own files      |

### What counts toward the limit

- All lines including imports, blank lines, and comments.
- JSDoc blocks count. Keep them concise.

### What does NOT split

- The 3-file component structure (`component.js`, `component.css`, `index.js`)
  stays together in one directory. Don't add more files to a component dir.

---

## JSDoc Typing Strategy

See [JSDOC_TYPING.md](./JSDOC_TYPING.md) for the full JSDoc typing
specification, including component properties, store models, event handlers,
and validation rules.
