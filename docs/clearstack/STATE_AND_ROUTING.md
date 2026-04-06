# State & Routing

## Store, Routing, Unified App State & Realtime Sync

> How data flows through the application.
> See [FRONTEND_IMPLEMENTATION_RULES.md](./FRONTEND_IMPLEMENTATION_RULES.md) for
> project structure and [BACKEND_API_SPEC.md](./BACKEND_API_SPEC.md) for the
> server-side data contract.

---

## State Management

### Component-Local State

For state that belongs to a single component instance, use plain properties:

```javascript
export default define({
  tag: 'app-toggle',
  open: false,
  render: ({ open }) => html`
    <button
      onclick="${(host) => {
        host.open = !host.open;
      }}"
    >
      ${open ? 'Close' : 'Open'}
    </button>
  `,
});
```

Local state resets when the component disconnects from the DOM.

#### Property Defaults: Never Use `undefined` or `null`

Hybrids infers a property's type from its initial value. The router's cache
observer calls `.toString()` on property values during state transitions.
If a property is defined as `undefined` or later set to `null`, this crashes:

```javascript
// ❌ BAD — undefined has no type info, null crashes .toString()
export default define({
  tag: 'my-view',
  _data: undefined, // no type info for hybrids to work with
  // ...
});

// Later in a handler:
host._data = null; // TypeError: Cannot read properties of null (reading 'toString')
```

Always provide a typed default value, and reset to the same type:

```javascript
// ✅ GOOD — array default, connect no-op prevents hybrids from observing it
export default define({
  tag: 'my-view',
  _data: { value: [], connect: () => {} },
  // ...
});

// Later in a handler:
host._data = []; // safe — same type as default
```

The `connect: () => {}` no-op prevents hybrids from doing anything special
with the property — it's just internal state storage. This pattern is useful
for "private" properties that hold transient data (parsed results, file
contents, etc.) that shouldn't participate in the reactive render cycle.

### Shared State via Store

For state shared across components or persisted beyond a component's lifetime,
use `store()` with a model definition.

#### Singleton Model (App-Wide State)

One instance, no `id`. Lives in `src/store/AppState.js`:

```javascript
/** @typedef {{ theme: 'light'|'dark', sidebarOpen: boolean }} AppState */

/** @type {import('hybrids').Model<AppState>} */
const AppState = {
  theme: 'light',
  sidebarOpen: false,
};

export default AppState;
```

#### localStorage Connector: Return `{}`, Never `undefined`

When a localStorage-backed singleton has no stored value yet (first visit),
the `get` connector **must return `{}`**, not `undefined` or `null`.

Hybrids treats `undefined` from `get` as a failed fetch and puts the model
into an error state. Returning `{}` lets hybrids merge with the model's
default values, so the model initializes cleanly:

```javascript
[store.connect]: {
  // ✅ GOOD — returns empty object, hybrids merges with defaults
  get: () => {
    const raw = localStorage.getItem('appState');
    return raw ? JSON.parse(raw) : {};
  },
  // ❌ BAD — undefined triggers error state
  // get: () => {
  //   const raw = localStorage.getItem('appState');
  //   return raw ? JSON.parse(raw) : undefined;
  // },
}
```

This applies to all localStorage-backed singletons (`AppState`, `UserPrefs`).

Consume in any component:

```javascript
import { store, html, define } from 'hybrids';
import AppState from '../../store/AppState.js';

export default define({
  tag: 'theme-toggle',
  state: store(AppState),
  render: ({ state }) => html`
    <button
      onclick="${(host) => {
        store.set(host.state, { theme: host.state.theme === 'light' ? 'dark' : 'light' });
      }}"
    >
      Theme: ${state.theme}
    </button>
  `,
});
```

#### Enumerable Model (Entity Records)

Has `id: true`. Lives in `src/store/UserModel.js`:

```javascript
/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 */

/** @type {import('hybrids').Model<User>} */
const UserModel = {
  id: true,
  firstName: '',
  lastName: '',
  email: '',
  [store.connect]: {
    get: (id) => fetch(`/api/users/${id}`).then((r) => r.json()),
    set: (id, values) =>
      fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }).then((r) => r.json()),
    list: (id) => fetch(`/api/users?${new URLSearchParams(id)}`).then((r) => r.json()),
  },
};

export default UserModel;
```

#### Store API Quick Reference

| Method                      | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `store(Model)`              | Descriptor — binds model to a component property     |
| `store.get(Model, id)`      | Get a cached instance (triggers fetch if needed)     |
| `store.set(model, values)`  | Update (async, returns Promise)                      |
| `store.sync(model, values)` | Update (sync, immediate)                             |
| `store.pending(model)`      | `false` or `Promise` while loading                   |
| `store.ready(model)`        | `true` when loaded and valid                         |
| `store.error(model)`        | `false` or `Error`                                   |
| `store.clear(Model)`        | Invalidate singular model cache                      |
| `store.clear([Model])`      | Invalidate list cache — **required for list stores** |
| `store.submit(draft)`       | Submit draft mode changes                            |
| `store.resolve(Model, id)`  | Returns Promise that resolves when ready             |

#### Decision Tree: Local vs Shared State

```
Is this state used by more than one component?
  YES → store()
  NO  → Does it need to survive component disconnect?
          YES → store()
          NO  → plain property
```

#### Guarding List Item Access

`store.ready(list)` checks if the list itself has loaded, but individual
items within the list can still be in a pending state (e.g. after a cache
clear triggers re-fetch). Always guard property access on list items:

```javascript
// ❌ BAD — task may be pending, accessing .title throws
tasks.map((task) => html`<span>${task.title}</span>`);

// ✅ GOOD — guard each item, show fallback for pending items
tasks.map((task) =>
  store.ready(task) ? html`<span>${task.title}</span>` : html`<span class="spinner"></span>`,
);
```

This is especially important after batch operations (e.g. drag reorder)
where multiple items are invalidated simultaneously.

#### Async `connect` on Array Properties

When a plain array property uses `connect` to load data asynchronously,
the render function fires **before** the async load completes. Even though
the default `value` is `[]`, hybrids may resolve the property as a
non-array during the pending phase.

Always guard with `Array.isArray()` before calling array methods:

```javascript
export default define({
  tag: 'my-view',
  items: {
    value: [],
    connect: (host, _key, invalidate) => {
      fetchItems().then((list) => {
        host.items = list;
        invalidate();
      });
    },
  },
  render: ({ items }) => html`
    // ❌ BAD — items may not be an array yet when render fires
    ${items.filter((i) => i.active).map((i) => html`<span>${i.name}</span>`)} // ✅ GOOD — guard
    before calling array methods
    ${Array.isArray(items) && items.length > 0
      ? items.filter((i) => i.active).map((i) => html`<span>${i.name}</span>`)
      : html``}
  `,
});
```

This applies to any property with `value: []` and an async `connect`.
The `connect` callback sets the value and calls `invalidate()`, but the
first render happens before that resolves.

---

## Routing

### Router Shell

The app has one router shell component that manages the view stack.
Lives in `src/router/index.js`:

```javascript
import { define, html, router } from 'hybrids';
import HomeView from '../pages/home/index.js';

export default define({
  tag: 'app-router',
  stack: router(HomeView, { url: '/' }),
  render: ({ stack }) => html` <template layout="column height::100vh"> ${stack} </template> `,
});
```

### View Configuration

Each page declares its routing config via `[router.connect]`:

```javascript
import { define, html, router } from 'hybrids';
import AboutView from '../about/index.js';

export default define({
  tag: 'home-view',
  [router.connect]: {
    url: '/',
    stack: [AboutView],
  },
  render: () => html`
    <template layout="column gap:2 padding:2">
      <h1>Home</h1>
      <a href="${router.url(AboutView)}">About</a>
    </template>
  `,
});
```

### Routing Patterns

| Pattern              | Code                                     |
| -------------------- | ---------------------------------------- |
| Navigate to view     | `<a href="${router.url(View)}">`         |
| Navigate with params | `router.url(View, { id: '42' })`         |
| Back button          | `<a href="${router.backUrl()}">Back</a>` |
| Check active view    | `router.active(View)`                    |
| Guarded route        | `guard: () => isAuthenticated()`         |
| Dialog overlay       | `dialog: true` on the view config        |

#### Router Property Cache: Same-Value Writes Are No-Ops

The router caches component property values across navigations and page
reloads. When a view reconnects, its properties are restored from cache
**before** `connect` callbacks run.

This means if a `connect` callback loads data asynchronously and then sets
a property to the same value the cache already holds, hybrids sees no
change and skips the re-render:

```javascript
// ❌ BAD — if router cache already has resultCount=22,
// setting it to 22 again is a no-op. No re-render happens.
connect: (host, _key, invalidate) => {
  loadFromDB(host.userId).then((data) => {
    populateMemoryCache(data);     // side effect: fills an external object
    host.resultCount = data.length; // may equal cached value → no re-render
    invalidate();
  });
},

// ✅ GOOD — reset to a sentinel value first, then set the real value.
// Hybrids sees 0 → 22, triggers re-render after data is loaded.
connect: (host, _key, invalidate) => {
  loadFromDB(host.userId).then((data) => {
    populateMemoryCache(data);
    host.resultCount = 0;           // force a change
    host.resultCount = data.length; // now hybrids sees a real change
    invalidate();
  });
},
```

This is especially important when render depends on external mutable state
(e.g. an in-memory cache object) that the property change is meant to
signal. Without the reset, the component renders with stale external state.

#### `router.backUrl()` Serializes All Parent Properties

`router.backUrl()` encodes the parent view's property values into query
params so hybrids can restore them when navigating back. If the parent has
properties holding complex objects (arrays of records, parsed data, etc.),
the URL becomes enormous — potentially megabytes — and the browser locks
up just rendering the `<a>` element.

The `connect: () => {}` no-op prevents hybrids from _observing_ a property,
but the router still serializes it. The only way to fully exclude a
property from URL serialization is to not define it on the routed view at
all (use a module-level variable or a separate store).

For child views that don't need to restore specific parent state, use a
direct href instead of `router.backUrl()`:

```javascript
// ❌ BAD — serializes ALL parent properties into the href
// If parent has a 700K-item array, the URL is megabytes
html`<a href="${router.backUrl()}">← Back</a>`;

// ✅ GOOD — direct link, no serialization
html`<a href="/dashboard">← Back</a>`;
```

Use `router.backUrl()` only when the parent view has simple scalar
properties (strings, numbers, booleans) that are cheap to serialize.

---

## Unified App State

The frontend maintains a single `AppState` singleton that acts as the
**source of truth for UI state**. Entity data lives in enumerable store
models that sync with the backend.

### Architecture

```
Backend REST API
      ↕ fetch / SSE
Store Models (UserModel, etc.)  ←→  [store.connect] storage
      ↕ store()
Component Properties
      ↕ render()
DOM
```

### AppState vs Entity Models

| Concern                   | Where                                 |
| ------------------------- | ------------------------------------- |
| Theme, sidebar, UI flags  | `AppState` (singleton)                |
| User records, posts, etc. | `UserModel`, `PostModel` (enumerable) |
| Form draft state          | `store(Model, { draft: true })`       |
| Route state               | `router()` — managed by hybrids       |

---

## Realtime Sync

For live data updates, the backend pushes events via **Server-Sent Events
(SSE)**. The frontend listens and invalidates the relevant store cache.

### Frontend: SSE Listener

Lives in `src/utils/realtimeSync.js`:

```javascript
import { store } from 'hybrids';

export function connectRealtime(url, modelMap) {
  const source = new EventSource(url);

  source.addEventListener('update', (event) => {
    const { type } = JSON.parse(event.data);
    const Model = modelMap[type];
    if (Model) store.clear(Model); // full clear triggers re-fetch
  });

  source.addEventListener('error', () => {
    source.close();
    setTimeout(() => connectRealtime(url, modelMap), 5000);
  });

  return () => source.close();
}
```

`store.clear(Model)` fully invalidates the cache for that model type.
Any component bound to the model via `store()` will automatically re-fetch
from the API. This is the mechanism that makes multi-user realtime work —
when user A creates a task, user B's task list updates automatically.

For the local user, form submit handlers also call `store.clear(Model)`
immediately after a successful save. The SSE event that follows is
redundant for the local user but ensures other connected clients update.

### Backend: SSE Endpoint

See [BACKEND_API_SPEC.md](./BACKEND_API_SPEC.md) for the `/api/events` SSE
contract.

### Wiring It Up

In the router shell's `connect` descriptor:

```javascript
import { connectRealtime } from '../utils/realtimeSync.js';
import UserModel from '../store/UserModel.js';

export default define({
  tag: 'app-router',
  stack: router(HomeView, { url: '/' }),
  connection: {
    value: undefined,
    connect(host) {
      const disconnect = connectRealtime('/api/events', {
        user: UserModel,
      });
      return disconnect;
    },
  },
  render: ({ stack }) => html` <template layout="column height::100vh">${stack}</template> `,
});
```

When the backend sends `{ type: "user", id: "42" }` over SSE, the store
cache for `UserModel` is cleared, and any component displaying that user
re-fetches automatically.

### Debouncing Batch Operations

Operations like drag-to-reorder send multiple PUTs, each triggering an SSE
event. Without debouncing, each event clears the store mid-render.

The `connectRealtime()` utility debounces by entity type: multiple SSE
events within 300ms trigger only one `store.clear()`. A reorder of 5 tasks
sends 5 PUTs → 5 SSE events → 1 store clear after the batch settles.

For the local user, don't call `store.clear()` explicitly after batch
operations — let the debounced SSE handler do it once.
