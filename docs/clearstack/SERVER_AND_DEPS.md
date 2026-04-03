# Server & Dependencies

## Express Server, Import Maps & Vendor Loading

> How the backend serves the frontend and how dependencies are resolved
> without a build step.
> See [BACKEND_API_SPEC.md](./BACKEND_API_SPEC.md) for the REST API contract.

---

## Express Server

`src/server.js` is a minimal Express app that serves static files and the API.

### Responsibilities

| Route         | Serves                                |
| ------------- | ------------------------------------- |
| `/`           | `src/index.html` (app shell)          |
| `/vendor/*`   | `src/vendor/` (vendored ES modules)   |
| `/src/*`      | `src/` (application source, as-is)    |
| `/api/*`      | REST endpoints (see BACKEND_API_SPEC) |
| `/api/events` | SSE stream for realtime sync          |

### Key Rules

- **No middleware transforms.** Files are served byte-for-byte.
- **Correct MIME types.** `.js` files must be served as `application/javascript`.
- **No templating engine.** The HTML shell is a static file.
- **CORS not needed** — frontend and API share the same origin.

### src/server.js Structure

```javascript
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// Static: vendored deps and app shell
app.use(express.static('src'));

// Static: application source (ES modules served directly)
app.use('/src', express.static('src'));

// API routes
// (see BACKEND_API_SPEC.md for full contract)
app.use(express.json());

// ... mount API routes here ...

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
```

---

## Vendor Dependency Loading

Third-party ES module packages are copied from `node_modules/` into
`src/vendor/` at install time. This makes them servable as static files.

### scripts/vendor-deps.js

```javascript
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const VENDOR_DIR = resolve('src/vendor');
const DEPS = [{ name: 'hybrids', src: 'node_modules/hybrids/src' }];

mkdirSync(VENDOR_DIR, { recursive: true });

for (const dep of DEPS) {
  const dest = resolve(VENDOR_DIR, dep.name);
  cpSync(dep.src, dest, { recursive: true });
  console.log(`Vendored: ${dep.name} → ${dest}`);
}
```

### Wiring

In `package.json`:

```json
{
  "scripts": {
    "postinstall": "node scripts/vendor-deps.js"
  }
}
```

Running `npm install` automatically vendors dependencies. The `src/vendor/`
directory should be in `.gitignore`.

### Adding a New Dependency

1. `npm install <package>`
2. Add an entry to the `DEPS` array in `scripts/vendor-deps.js`
3. Add a mapping in the import map (see below)
4. Run `npm run postinstall` (or re-run `npm install`)

---

## Import Map

The browser resolves bare specifiers like `'hybrids'` via an import map
declared in `src/index.html`.

### src/index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <link rel="stylesheet" href="/src/styles/reset.css" />
    <link rel="stylesheet" href="/src/styles/tokens.css" />

    <script type="importmap">
      {
        "imports": {
          "hybrids": "/vendor/hybrids/index.js"
        }
      }
    </script>
  </head>
  <body>
    <app-router></app-router>
    <script type="module" src="/src/router/index.js"></script>
  </body>
</html>
```

### How It Works

1. Browser encounters `import { html } from 'hybrids'` in any ES module.
2. Import map resolves `'hybrids'` → `/vendor/hybrids/index.js`.
3. Server serves the file from `src/vendor/hybrids/index.js`.
4. Hybrids' internal imports use relative paths — they resolve naturally.

### Rules

- **One import map per page.** It must be declared before any `<script type="module">`.
- **No dynamic import map generation.** The map is static HTML.
- **Version pinning** is handled by `package-lock.json` + the vendor copy.
  The vendored files always match the installed version.

### Cache Busting

For production, append a version query param to the import map entries:

```json
{
  "imports": {
    "hybrids": "/vendor/hybrids/index.js?v=9.1.22"
  }
}
```

Or use versioned directory names: `/vendor/hybrids@9.1.22/index.js`.
