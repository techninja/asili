# Testing

## Philosophy, Tools & Patterns

> How we test in a no-build web component project.
> See [FRONTEND_IMPLEMENTATION_RULES.md](./FRONTEND_IMPLEMENTATION_RULES.md) for
> the full specification index.

---

## Philosophy

### Test What Matters, When It Matters

Tests are written **alongside implementation, not after**. Each phase of
development produces tests before moving to the next phase. This catches
bugs at the boundary where they're introduced, not 5 layers up.

### Core Principles

| Principle                         | Rule                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| Test at the right level           | Pure logic → unit. Components → browser. API → integration. |
| No mocking the framework          | Don't mock `html`, `store`, or `define`. Test through them. |
| Real browser for components       | Web components need a real DOM. No jsdom, no happy-dom.     |
| Zero build for tests              | Test files are ES modules, same as app code.                |
| Small test files                  | Same 150-line rule applies to test files.                   |
| Test behavior, not implementation | Assert what the user sees, not internal state shape.        |
| Co-locate tests                   | Tests live next to the code they test.                      |

---

## Tools

### Two Test Runners, Clear Boundaries

| Tool                   | Tests                                  | Runs in       |
| ---------------------- | -------------------------------------- | ------------- |
| `node:test` (built-in) | Server, utils, store model shapes      | Node.js       |
| `@web/test-runner`     | Components, pages, browser integration | Real Chromium |

No other test frameworks. No Jest, no Mocha, no Jasmine.

### Why Two Runners

- **`node:test`** is zero-dependency and fast. Perfect for pure functions
  and server-side code that doesn't touch the DOM.
- **`@web/test-runner`** launches a real browser, serves ES modules natively,
  and respects import maps. Components mount into a real DOM with shadow roots,
  events, and rendering — exactly like production.

---

## File Conventions

### Test File Location

Tests live **next to the code they test**, with a `.test.js` suffix:

```
src/utils/
├── formatDate.js
└── formatDate.test.js          ← node:test

src/components/atoms/app-button/
├── app-button.js
├── app-button.css
├── app-button.test.js          ← @web/test-runner
└── index.js

src/store/
├── UserModel.js
└── UserModel.test.js           ← node:test

src/server.js
server.test.js                  ← node:test
```

### Test File Naming

| Code file       | Test file            |
| --------------- | -------------------- |
| `app-button.js` | `app-button.test.js` |
| `formatDate.js` | `formatDate.test.js` |
| `UserModel.js`  | `UserModel.test.js`  |
| `src/server.js` | `server.test.js`     |

### What Gets Tested

| Layer            | What to assert                                                            |
| ---------------- | ------------------------------------------------------------------------- |
| **Utils**        | Input → output. Edge cases.                                               |
| **Store models** | Shape is correct. Computed fields work. Storage connector URLs are right. |
| **Atoms**        | Renders correct HTML. Props reflect to attributes. Events fire.           |
| **Molecules**    | Child atoms are present. Composed behavior works.                         |
| **Organisms**    | Store integration. Data flows to children.                                |
| **Server API**   | CRUD responses. Schema endpoint. Status codes.                            |
| **Pages**        | Don't unit-test pages. Test via manual or E2E if needed.                  |

---

## Patterns

### Node Tests (utils, store, server)

Using the built-in `node:test` and `node:assert`:

```javascript
// src/utils/formatDate.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate } from './formatDate.js';

describe('formatDate', () => {
  it('formats ISO string to readable date', () => {
    assert.equal(formatDate('2024-01-15T09:00:00Z'), 'Jan 15, 2024');
  });

  it('returns empty string for null', () => {
    assert.equal(formatDate(null), '');
  });
});
```

Run with:

```bash
node --test src/utils/*.test.js
```

### Server Tests

Test the API endpoints using fetch against a running server:

```javascript
// server.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

let server;
const BASE = 'http://localhost:3001';

before(async () => {
  // Import and start server on test port
  const app = await import('./src/server.js');
  server = app.start(3001);
});

after(() => server?.close());

describe('GET /api/users', () => {
  it('returns a list with data array', async () => {
    const res = await fetch(`${BASE}/api/users`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(body.data));
  });
});

describe('GET /api/users?schema=true', () => {
  it('returns JSON Schema with properties', async () => {
    const res = await fetch(`${BASE}/api/users?schema=true`);
    const schema = await res.json();
    assert.equal(schema.title, 'User');
    assert.ok(schema.properties.firstName);
  });
});
```

### Component Tests (browser)

Using `@web/test-runner` with `@open-wc/testing`:

```javascript
// src/components/atoms/app-button/app-button.test.js
import { fixture, html, expect } from '@open-wc/testing';
import './app-button.js';

describe('app-button', () => {
  it('renders with label', async () => {
    const el = await fixture(html`<app-button label="Click me"></app-button>`);
    const button = el.shadowRoot.querySelector('button');
    expect(button.textContent).to.contain('Click me');
  });

  it('reflects disabled attribute', async () => {
    const el = await fixture(html`<app-button disabled></app-button>`);
    const button = el.shadowRoot.querySelector('button');
    expect(button.hasAttribute('disabled')).to.be.true;
  });

  it('dispatches click event', async () => {
    const el = await fixture(html`<app-button label="Go"></app-button>`);
    let clicked = false;
    el.addEventListener('click', () => {
      clicked = true;
    });
    el.shadowRoot.querySelector('button').click();
    expect(clicked).to.be.true;
  });
});
```

### Store Integration Tests (browser)

For components that bind to the store, test the full cycle:

```javascript
// src/components/organisms/task-list/task-list.test.js
import { fixture, html, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import './task-list.js';

describe('task-list', () => {
  it('renders tasks from store', async () => {
    const el = await fixture(html`<task-list project-id="1"></task-list>`);
    await waitUntil(() => el.shadowRoot.querySelectorAll('task-card').length > 0);
    const cards = el.shadowRoot.querySelectorAll('task-card');
    expect(cards.length).to.be.greaterThan(0);
  });
});
```

---

## Configuration

### web-test-runner.config.js

```javascript
import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
  files: 'src/components/**/*.test.js',
  nodeResolve: true,
  browsers: [playwrightLauncher({ product: 'chromium' })],
};
```

### package.json Scripts

```json
{
  "scripts": {
    "test": "npm run test:node && npm run test:browser",
    "test:node": "node --test 'src/**/*.test.js' 'server.test.js'",
    "test:browser": "web-test-runner",
    "test:watch": "web-test-runner --watch"
  }
}
```

---

## Build-Phase Test Checkpoints

Each implementation phase must pass its tests before proceeding:

| Phase             | Implement                         | Then test                                           |
| ----------------- | --------------------------------- | --------------------------------------------------- |
| 1. Infrastructure | server, vendor script, index.html | Server starts, routes respond, vendor files exist   |
| 2. Store + Utils  | models, formatDate, realtimeSync  | Model shapes, util outputs, localStorage round-trip |
| 3. Atoms          | app-button, app-badge, app-icon   | Render, props, events                               |
| 4. Molecules      | task-card, project-card           | Composition, slot content                           |
| 5. Organisms      | task-list, project-header         | Store binding, data rendering                       |
| 6. Pages + Router | views, app-router                 | Navigation, full page render                        |

**Rule: never skip a checkpoint.** If phase 3 tests fail, fix before
starting phase 4. Bugs compound; catch them at the boundary.
