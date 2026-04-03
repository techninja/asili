# Backend API Specification

## REST Endpoints, JSON Schema Discovery & Realtime Sync

> Defines the server-side data contract. The frontend consumes this API via
> `[store.connect]` storage connectors.
> See [STATE_AND_ROUTING.md](./STATE_AND_ROUTING.md) for how the frontend
> binds to these endpoints.

---

## Design Principles

- **Standard REST** — resources as nouns, HTTP verbs for actions.
- **JSON Schema via OPTIONS** — every entity endpoint exposes its schema and
  allowed methods on `OPTIONS` requests, enabling automated form generation.
- **Field-level validation errors** — server returns `422` with per-field
  error messages that map directly to form fields.
- **SSE for realtime** — a single `/api/events` stream pushes entity change
  notifications to connected clients.
- **Stateless requests** — no server-side sessions. Auth via tokens if needed.

---

## URL Structure

```
/api/:entity            OPTIONS (schema + methods), GET (list), POST (create)
/api/:entity/:id        OPTIONS (schema + methods), GET (read), PUT (update), DELETE (remove)
/api/events             GET (SSE stream)
```

All request/response bodies are `application/json`.

---

## OPTIONS — Schema & Capability Discovery

An `OPTIONS` request to any entity endpoint returns the JSON Schema and
allowed HTTP methods. This is the primary mechanism for schema-driven forms.

### Example: `OPTIONS /api/projects`

```json
{
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Project",
    "type": "object",
    "required": ["name"],
    "properties": { ... }
  },
  "methods": ["OPTIONS", "GET", "POST"]
}
```

### Example: `OPTIONS /api/projects/p1`

```json
{
  "schema": { ... },
  "methods": ["OPTIONS", "GET", "PUT", "DELETE"]
}
```

The `Allow` header is also set for HTTP compliance.
`GET /api/:entity?schema=true` is still supported as a convenience.

### Schema-Driven Forms

The frontend can fetch the schema at runtime and generate form fields
automatically. The schema provides:

| JSON Schema keyword       | Form behavior                                  |
| ------------------------- | ---------------------------------------------- |
| `type: "string"`          | `<input type="text">`                          |
| `format: "email"`         | `<input type="email">`                         |
| `format: "date-time"`     | `<input type="datetime-local">`                |
| `enum: [...]`             | `<select>` with options                        |
| `minLength` / `maxLength` | Validation constraints                         |
| `readOnly: true`          | Field displayed but not editable               |
| `required: [...]`         | Native `required` attribute + visual indicator |

JSON Schema constraints map directly to HTML validation attributes:

| JSON Schema | HTML attribute |
| ----------- | -------------- |
| `minLength` | `minlength`    |
| `maxLength` | `maxlength`    |
| `minimum`   | `min`          |
| `maximum`   | `max`          |
| `pattern`   | `pattern`      |

The browser's native constraint validation API enforces these — no custom
JS validation needed for client-side checks.

---

## Server-Side Validation & Error Responses

Some validation can only happen server-side (uniqueness, business rules).
When validation fails, the server returns `422` with field-level errors:

```json
{
  "error": "Validation failed",
  "fields": {
    "name": "name is required",
    "status": "Must be one of: active, archived"
  }
}
```

The `schema-form` component maps `fields` entries to the corresponding
`form-field` components, which display the error below the input.

### Error Response Contract

| Status | Body                | Meaning                                             |
| ------ | ------------------- | --------------------------------------------------- |
| `422`  | `{ error, fields }` | Validation failed — `fields` maps names to messages |
| `404`  | `{ error }`         | Entity or collection not found                      |
| `201`  | Entity JSON         | Created successfully                                |
| `200`  | Entity JSON         | Updated successfully                                |
| `204`  | Empty               | Deleted successfully                                |

This allows a single generic `schema-form` component to render any entity's
create/edit form without entity-specific template code.

---

## CRUD Operations

### List — `GET /api/:entity`

Query params for filtering, sorting, pagination:

| Param    | Example            | Purpose                         |
| -------- | ------------------ | ------------------------------- |
| `limit`  | `?limit=20`        | Page size (default: 20)         |
| `offset` | `?offset=40`       | Skip N records                  |
| `sort`   | `?sort=-createdAt` | Sort field, `-` prefix for desc |
| `filter` | `?role=admin`      | Field equality filter           |

Response:

```json
{
  "data": [ { "id": "1", "firstName": "Jane", ... } ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### Read — `GET /api/:entity/:id`

Returns a single entity object:

```json
{ "id": "1", "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com" }
```

Returns `404` if not found.

### Create — `POST /api/:entity`

Request body: entity fields (without `id` or `readOnly` fields).
Response: the created entity with `id` and server-generated fields.
Status: `201 Created`.

### Update — `PUT /api/:entity/:id`

Request body: full or partial entity fields.
Response: the updated entity.
Status: `200 OK`.

### Delete — `DELETE /api/:entity/:id`

Response: `204 No Content`.

---

## Realtime Sync — SSE

### Endpoint: `GET /api/events`

Returns a `text/event-stream` connection. The server pushes events when
entities are created, updated, or deleted.

### Event Format

```
event: update
data: {"type":"user","id":"1","action":"updated"}

event: update
data: {"type":"user","id":"3","action":"created"}

event: update
data: {"type":"user","id":"2","action":"deleted"}
```

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| `type`   | Entity name (lowercase, singular): `user`, `post` |
| `id`     | Entity ID that changed                            |
| `action` | `created`, `updated`, or `deleted`                |

### Frontend Integration

See [STATE_AND_ROUTING.md](./STATE_AND_ROUTING.md) — the `connectRealtime()`
utility listens to this stream and calls `store.clear()` on the relevant
model, triggering automatic re-fetch for any component displaying that data.

---

## Dummy Data

The server ships with in-memory dummy data for development. No database
required.

### Data Structure (server-side)

```javascript
/** @type {Map<string, Map<string, object>>} */
const db = new Map();

// Seed with dummy users
db.set(
  'users',
  new Map([
    [
      '1',
      {
        id: '1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        role: 'admin',
        createdAt: '2024-01-15T09:00:00Z',
      },
    ],
    [
      '2',
      {
        id: '2',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
        role: 'editor',
        createdAt: '2024-02-20T14:30:00Z',
      },
    ],
    [
      '3',
      {
        id: '3',
        firstName: 'Alex',
        lastName: 'Chen',
        email: 'alex@example.com',
        role: 'viewer',
        createdAt: '2024-03-10T11:15:00Z',
      },
    ],
  ]),
);
```

### Schema Registry (server-side)

Schemas are defined once and served via OPTIONS:

```javascript
const schemas = new Map();
schemas.set('users', {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'User',
  type: 'object',
  required: ['firstName', 'lastName', 'email'],
  properties: {
    /* ... as above ... */
  },
});
```

### Adding a New Entity

1. Define the JSON Schema in the schema registry.
2. Seed dummy data in the `db` Map.
3. The generic CRUD router handles all operations automatically.
4. Create a corresponding frontend store model in `src/store/`.

No entity-specific route handlers needed — the server uses a single generic
router that works for any entity registered in the schema map.

---

## Frontend ↔ Backend Contract

| Frontend (Hybrids Store)          | Backend (Express)          |
| --------------------------------- | -------------------------- |
| `[store.connect].get(id)`         | `GET /api/:entity/:id`     |
| `[store.connect].set(id, values)` | `PUT /api/:entity/:id`     |
| `[store.connect].list(params)`    | `GET /api/:entity?...`     |
| `store.set(model, null)` (delete) | `DELETE /api/:entity/:id`  |
| Schema fetch for forms            | `OPTIONS /api/:entity`     |
| Schema fetch for item             | `OPTIONS /api/:entity/:id` |
| Realtime invalidation             | `GET /api/events` (SSE)    |

This contract means adding a new entity type requires:

- One JSON Schema definition (server)
- One store model file (frontend)
- Dummy seed data (server, for dev)

Everything else — CRUD routes, form generation, cache invalidation — is
handled by the generic infrastructure.
