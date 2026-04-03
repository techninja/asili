# Build Log

## How This Project Was Built

> This entire repository — specification, implementation, tests, and this
> document — was authored in a single continuous conversation between a human
> and an LLM (Amazon Q). No code was written outside this collaboration.

---

## Timeline

The project was built over ~1.5 days in a single LLM context window.
Each phase was implemented, tested, and verified before proceeding.

### Phase 1: Specification

- Wrote the initial spec as one file, hit ~500 lines
- Split into 7 topic-specific documents (the spec eating its own dogfood)
- Chose Hybrids.js after reading its source and type definitions from node_modules

### Phase 2: Infrastructure

- Express server, vendor-deps script, import maps, HTML shell
- JSON Schema registry with seed data
- Generic CRUD router — one router handles all entity types
- 15 server tests passing before writing any frontend code

### Phase 3: Store Models & Utils

- Singleton models (AppState, UserPrefs) with localStorage connectors
- Enumerable models (ProjectModel, TaskModel) with API connectors
- Utility functions (formatDate, timeAgo, statusColors)
- 35 tests passing

### Phase 4: Components (Atoms → Molecules → Organisms)

- Built bottom-up: app-button, app-badge, app-icon → task-card, project-card → task-list, project-header
- Browser tests via @web/test-runner + Playwright
- 63 tests passing

### Phase 5: Pages, Router & Integration

- page-layout template, home-view, project-view, app-router
- SSE realtime sync wired at the router level
- SPA fallback for direct URL navigation

### Phase 6: Schema-Driven Forms

- OPTIONS endpoint returns JSON Schema + form layout
- schema-form organism auto-generates fields from schema
- Native HTML validation from schema constraints
- Server-side validation returns 422 with per-field errors
- Form layout system with column grouping and action alignment

### Phase 7: Polish & Tooling

- Dark mode via CSS custom property overrides
- Spec checker CLI with interactive menu
- ESLint + Prettier + tsc --checkJs for JSDoc type validation
- GitHub Actions CI pipeline
- File reorganization (docs/, .configs/, tests/)

### Phase 8: Drag Reorder & Whiteboard

- Drag-to-reorder with visual gap indicator and backend persistence
- WebSocket server for real-time canvas collaboration
- SVG whiteboard with drawing tools (in progress)

---

## Discoveries & Corrections

The spec was written first, then corrected as implementation revealed gaps.
These are the significant corrections:

### Light DOM breaks slots

- **Expected:** `<slot>` for content composition
- **Actual:** Hybrids throws on `<slot>` in light DOM
- **Fix:** Template functions instead of template components
- **Documented in:** COMPONENT_PATTERNS.md → Content Composition

### Template components break host context

- **Expected:** Event handlers in content templates resolve to the page
- **Actual:** `host` resolves to the nearest hybrids component (the template)
- **Fix:** Use plain functions that return `html`, not `define()`'d components
- **Documented in:** COMPONENT_PATTERNS.md → Event Handler Host Context

### Custom events don't bubble by default

- **Expected:** `dispatch(host, 'press')` reaches parent listeners
- **Actual:** Without `bubbles: true`, events stop at the dispatching element
- **Fix:** Always `dispatch(host, 'event', { bubbles: true })`
- **Documented in:** COMPONENT_PATTERNS.md → Custom Events Must Bubble

### store.clear(Model) vs store.clear([Model])

- **Expected:** `store.clear(TaskModel)` refreshes task lists
- **Actual:** Only clears singular cache, not list cache
- **Fix:** Use `store.clear([TaskModel])` for list stores
- **Documented in:** STATE_AND_ROUTING.md → Store API Quick Reference

### store.ready(list) doesn't guarantee item readiness

- **Expected:** If the list is ready, items are ready
- **Actual:** Individual items can be pending after cache clear
- **Fix:** Guard each item with `store.ready(task)` in map()
- **Documented in:** STATE_AND_ROUTING.md → Guarding List Item Access

### localStorage connector must return {}, not undefined

- **Expected:** Returning undefined uses model defaults
- **Actual:** Hybrids treats undefined as a failed get → error state
- **Fix:** Return `{}` so hybrids merges with defaults
- **Documented in:** STATE_AND_ROUTING.md → localStorage Connector

### Batch operations cause SSE storms

- **Expected:** Reordering N tasks sends N updates, UI handles it
- **Actual:** N SSE events → N store.clear() calls → cascading errors
- **Fix:** Debounce SSE handler per entity type (300ms)
- **Documented in:** STATE_AND_ROUTING.md → Debouncing Batch Operations

### Server sort used string comparison for numbers

- **Expected:** sortOrder field sorts numerically
- **Actual:** `localeCompare` on numbers gives wrong order
- **Fix:** Detect numeric values and use `a - b` comparison

### SVG transforms: two-group rotation approach

- **Expected:** Embed rotation in shapeTransform string
- **Actual:** Rotation center in local coords doesn't match screen position
- **Fix:** Outer `<g>` for rotation (screen-space center), inner `<g>` for translate+scale
- **Documented in:** COMPONENT_PATTERNS.md → Coordinate Transforms

### Move after rotation: unrotate is wrong for translate

- **Expected:** Unrotate screen delta for the inner translate
- **Actual:** Causes magnified/skewed movement
- **Fix:** Move both rotation center AND inner translate by raw screen delta
- **Key insight:** `rotate(deg, cx, cy)` = `translate(cx,cy) rotate(deg) translate(-cx,-cy)`. Shifting cx,cy and translate by the same delta cancels out.

### Resize after rotation: unrotate IS needed

- **Expected:** Same approach as move
- **Actual:** Handles are visually rotated, so screen drag doesn't align with object axes
- **Fix:** Unrotate resize deltas only, not move deltas

### SVG innerHTML destroys event listeners

- **Expected:** Event listeners persist across renders
- **Actual:** `innerHTML` replaces the DOM, losing all listeners
- **Fix:** Re-bind mouse listeners in `observe`, attach keyboard to host element
- **Documented in:** COMPONENT_PATTERNS.md → SVG Content via innerHTML

### Path d-string manipulation breaks arc commands

- **Expected:** Regex replace on coordinate pairs works for all paths
- **Actual:** Arc commands have flags (0/1) that get mangled
- **Fix:** Use `shapeTransform` for complex shapes, only rewrite d for M/L paths

### Canvas pan offset not applied to drawing coordinates

- **Expected:** Drawing at the visual position works after panning
- **Actual:** Coordinates calculated from SVG rect, not accounting for pan
- **Fix:** Shared `canvasPos()` utility subtracts pan offset from all tools

---

## Metrics

| Metric                       | Value                                            |
| ---------------------------- | ------------------------------------------------ |
| Total source files           | 108                                              |
| Utility modules              | 25                                               |
| Component files              | 13                                               |
| Style sheets                 | 6                                                |
| API modules                  | 6                                                |
| Page views                   | 2                                                |
| Test files                   | 14                                               |
| Node tests                   | 65                                               |
| Browser tests                | 41                                               |
| Spec documents               | 10                                               |
| Max lines per file           | 150 (enforced)                                   |
| Max lines per doc            | 500 (enforced)                                   |
| Automated checks             | 7 (line counts, lint, format, types, tests)      |
| Build phases                 | 8 + whiteboard                                   |
| Bugs found & fixed           | ~25 significant                                  |
| Bugs requiring >4 iterations | 3 (drag reorder, event bubbling, SVG transforms) |
| External dependencies        | 4 runtime (hybrids, express, ws, lucide-static)  |
| Build tools                  | 0                                                |

---

## What This Proves

1. **Small files work for LLMs.** Every file fits in a single read. No scrolling,
   no "show me lines 200-300", no losing context.

2. **The spec catches drift.** When implementation diverged from the spec
   (e.g. using slots in light DOM), the spec checker or manual review caught
   it, and both the code and spec were corrected.

3. **Test-at-the-boundary works.** Each phase was tested before the next began.
   The two hardest bugs (drag reorder, event bubbling) were in the last phases
   where components composed deeply — exactly where integration tests matter.

4. **No-build is viable.** The app loads in 0.17s LCP, handles real-time sync
   across browsers, and every file is debuggable as-written in devtools.

5. **The spec improves through implementation.** 9 significant corrections were
   made to the spec based on what we learned building the proof. The spec is
   now more accurate than if it had been written in isolation.
