# Testing Philosophy

The original author of this project used Claude to author almost all of the automated tests. These are the principles that Steve used for guiding Claude to the current system.

## Tests as documentation

Tests should tell stories. Each test case describes what a human user is trying to accomplish, not what function is being called. Compare:

```
// Bad: tests a function
TestMarkTopicRead_removes_from_unread_ids

// Good: tells a story
// Story: I have one unread message. I press 'n' to find it,
// read it, then press 'n' again to mark it as read.
```

When a new developer reads the test file, they should understand what the feature does and why it matters — without reading the implementation.

## Mock at the right level

Choosing what to mock is the most important decision in test design. Mock too low and you're testing implementation details that change constantly. Mock too high and you're not testing anything useful.

Our rule of thumb: **mock at the boundary where logic meets rendering.** For example, when testing the Starred Messages plugin, we don't mock individual DOM methods. Instead, we extracted the logic into `starred_model.ts` (pure data) and test that directly. The DOM rendering in `starred.ts` is a thin layer that reads from the model.

Similarly, when testing message predicates (code search, image search, mentions), we populate the detection Sets directly (`db.code_message_ids.add(2)`) rather than running HTML through `parse_content`. The parse function has its own focused test in `parse_test.ts`.

If writing a test requires complex mocking, that's a signal that the real code might benefit from a cleaner interface. We've refactored production code several times based on test feedback:

- Extracted `starred_model.ts` from `starred.ts` (separated logic from DOM)
- Moved `can_navigate` from `reading_list.ts` to `address.ts` (it's about Address completeness, not the reading list)
- Renamed `get_rows` to `get_unsorted_rows` (a test caught the misleading name)

## The navigator pattern: Context interfaces

The keyboard handlers (`arrow_keys.ts`, `enter_key.ts`, `esc_key.ts`, `n_key.ts`) are designed for testability. Each one takes a Context interface that describes what the navigator can do (select a channel, focus messages, mark read, etc.). In tests, we build a mock context with simple arrays of channels and topics:

```typescript
const nav = make_navigator([
    { id: 1, name: "General", topics: [
        { id: 10, name: "hello", unread: true },
    ]},
]);

handle_n_key(nav.ctx);
assert.equal(nav.selected_topic_id, 10);
```

This tests the real decision logic without any DOM, without the real navigator, and without a server connection.

## Browser shims

The tests run under Node via `vite-node`. Browser globals (`document`, `localStorage`, `DOMParser`, `requestAnimationFrame`) are shimmed in `shims.ts`. The shims are intentionally minimal:

- **localStorage** — backed by a Map
- **document.createElement** — returns MockElement objects that track children, attributes, event listeners, and text content
- **MockElement.style** — a Proxy that silently accepts any property (we don't test CSS)
- **MockElement._fire(type)** — triggers event listeners with mock events that include `preventDefault`/`stopPropagation`
- **MockElement.focus()** — tracks the last-focused element for assertions
- **requestAnimationFrame** — runs synchronously so focus behavior is testable
- **DOMParser** — only used by `parse_test.ts`; searches HTML strings for class names

We deliberately avoid `jsdom` or `happy-dom`. Hand-rolled shims give us control over what's real and what's stubbed. When a shim needs a new property, we add it — that friction is a feature, not a bug. It tells us when we're reaching too deep into the DOM.

## Shared helpers

All test files share helpers from `test_helpers.ts`:

- `make_db()` — creates a fresh in-memory Database with two users and two channels
- `make_message({id, ...overrides})` — builds a Message with sensible defaults; only specify the fields your test cares about
- `fresh_db()` — creates a DB and installs it as the global singleton
- `add_to_db(db, msg)` — adds a message to message_map and message_index

These eliminate the copy-paste that naturally accumulates when each test file builds its own test data.

## What we skip

- **DOM rendering tests** — we don't assert on CSS, layout, or pixel output
- **Network tests** — we don't mock `fetch`; API calls are tested through the server's own test suite (Angry Gopher has 74 Go tests)
- **Timing-dependent tests** — we avoid `setTimeout` assertions; `debounce.ts` is untested because fake timers add complexity for low value
- **Full integration tests** — we don't spin up a browser; the test suite runs in under 2 seconds via `vite-node`

## Test file organization

| File | What it tests |
|------|---------------|
| `address_test` | URL path parsing, `can_navigate` |
| `topic_map_test` | Topic creation, dedup, lookup |
| `message_index_test` | Message index add/retrieve |
| `reactions_test` | Reaction grouping, add/remove events |
| `parse_test` | HTML content detection (code, images, mentions) |
| `database_test` | Event handling (message, unread, starred, content, stream) |
| `starred_test` | StarredMessageState machine, StarredPluginModel |
| `plugins_test` | Plugin predicates, ReadingList, grouped topics |
| `backend_test` | Filters, MessageList, ChannelRow, sorting, action_log |
| `navigator_test` | Keyboard navigation stories (arrows, enter, esc, n key) |
| `page_test` | Plugin tab lifecycle (add, activate, close, reorder) |
| `popup_test` | Popup focus behavior, auto_focus option |
| `n_key_unread_test` | Unread count after mark-read, tab label updates |

## Running tests

```
npm run test
```

This runs both the main test suite and the Lyn Rummy tests. The full suite completes in about 2 seconds.
