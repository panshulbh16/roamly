# Roamly test inventory

Run `npm run test:unit` for isolated application logic and server-rendered component tests. Run `npm test` for the build and complete JavaScript regression suite, including API/database integration tests. Run `python3 tests/storage_test.py` for the existing SQLite capacity and ownership checks.

Tests mock external services; the live planner suite is skipped unless explicitly enabled with `ROAMLY_LIVE_TEST=1`. Enabling it makes three paid provider requests.

| Application module | Test files and scope |
| --- | --- |
| Trip schema and sample | `roamly`, `ui-components`, `auth-history`: validation, bounds, sample compatibility and persistence |
| Cost and currency API | `cost`: totals, currencies, dates, provider failures, 57,600 filter combinations |
| Destination stays | `stays`, `ui-components`: arbitrary destinations, encoding, directory filters and links |
| Trip insights | `insights`: signatures and packing recommendations |
| Streaming | `stream`, `auth-history`: chunk boundaries, Unicode, cancellation, incomplete output and final validation |
| AI planner | `module-unit`, `auth-history`: readiness, quotas, provider errors, all supported day counts |
| Authentication configuration and requests | `module-unit`: configuration validation, email normalization, request limits and client readiness |
| Authentication server, redirect policy and all auth routes | `auth-history`: mocked SDK/session flows, cookie protection, callback errors, redirects, sign-out and origin checks |
| Request context | `module-unit`: authentication, origin, bounded body parsing and error redaction |
| History repository and API | `auth-history`: pagination, ownership, completed/failed searches, invalid requests and persistence |
| Saved trips API | `auth-history`, `storage_test.py`: CRUD, ownership and capacity |
| Waitlist API | `auth-history`: authentication, origin and idempotent registration |
| Shared class utility | `module-unit`: conditional classes and conflict resolution |
| Mobile hook | `mobile`: breakpoint boundaries, media-query callback and cleanup using an isolated hook fixture |
| Workspace, history, sign-in and app shell | `screens`, `navigation`: initial states, navigation, required controls and rendered escaping |
| Cost, advice, carousel and stay components | `cost`, `ui-components`: rendered controls, links, legacy data and accessibility attributes |
| Build and emitted assets | `build-command`, `rendered-html`, `ui-components`: build tooling and output contracts |

Names in the table refer to `.test.mjs` files unless an extension is given. This is a module inventory, not a claim of 100% statement or branch coverage. Type-only modules have no runtime behavior. Bundled third-party UI primitives are exercised through the application; their complete upstream suites are not duplicated here.

Server rendering does not execute effects or simulate browser interaction. Full click flows, mobile media-query behavior, real OAuth, production proxy buffering and live AI factual quality still require browser/integration testing. These unit tests do not establish five-second production latency.
