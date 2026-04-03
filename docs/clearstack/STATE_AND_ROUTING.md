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
event. Without debouncing, each event clears the store and triggers a
re-render while the previous render is still pending — causing cascading
errors.

The `connectRealtime()` utility debounces by entity type: multiple SSE
events within 300ms trigger only one `store.clear()`. This means a reorder
of 5 tasks sends 5 PUTs → 5 SSE events → 1 store clear after 300ms.

```javascript
// Inside connectRealtime — debounce per entity type
const timers = {};
source.addEventListener('update', (event) => {
  const { type } = JSON.parse(event.data);
  clearTimeout(timers[type]);
  timers[type] = setTimeout(() => {
    store.clear([Model]); // one clear after the batch settles
  }, 300);
});
```

For the local user, the UI should not call `store.clear()` explicitly
after batch operations — let the debounced SSE handler do it once.
