# 🧭 Roamly

**An AI travel planner that turns a rough idea into a structured, day-by-day itinerary.** Give it a destination, dates, pace and interests — Claude drafts a validated, streamed itinerary, and every trip is saved privately to its owner.

> **Status:** early access · private deployment · no payments collected. Existing itineraries are unverified AI suggestions, not booked plans.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![D1](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Claude](https://img.shields.io/badge/AI-Claude-D97757)

---

## Highlights

- **Runs on the edge** — a single Cloudflare Worker with a native D1 (SQLite) database, close to the user.
- **Structured, streamed AI** — Claude returns a strict itinerary JSON that is streamed to the UI as it generates and validated with Zod on the way in *and* out.
- **Quota-guarded, fail-closed** — an atomic per-user daily and global monthly request budget, charged on attempt to defeat retry-spend loops; AI is disabled unless fully configured.
- **Owner-scoped by construction** — every saved-record query filters to the authenticated owner, so no trip is reachable by ID alone.
- **Security-first** — untrusted user input is treated as data, never instructions; same-origin mutations; HttpOnly sessions with server-side verification.

## Architecture
- `app/`: thin server pages and API routes.
- `components/trips/`: product UI, shared shell and interactive planning surface.
- `lib/trips/`: validated domain contracts and explicitly labeled sample content.
- `lib/server/`: server-only identity, persistence boundary and interchangeable AI provider.
- `db/schema.ts` + `drizzle/`: versioned database schema and migrations.

The host supplies trusted identity headers; never expose this Worker outside its trusted dispatcher without replacing identity verification. All saved-record queries scope to the authenticated owner. Mutation routes enforce same-origin requests and parameterize queries. No secrets belong in browser bundles.

## AI activation
For an API key that is not workspace-scoped, also set `ANTHROPIC_WORKSPACE_ID`. Roamly sends it as the `anthropic-workspace-id` header; omit it for keys that already select their workspace.

Configure hosted secrets `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and a positive integer `AI_MONTHLY_REQUEST_LIMIT`. Use a provider-supported model identifier. AI is fail-closed without all three. Each attempt atomically reserves a daily user request (5/day) and monthly global request. Attempts are charged against quota even when generation fails, intentionally avoiding retry spend loops. Provider requests have a 55-second timeout and 4,500 output-token ceiling, with validated input/output and exact day-count checks. No automatic provider retries.

The request ceiling is NOT a monetary budget guarantee. Configure an Anthropic account spending cap and calculate the request ceiling against selected model rates and bounded payload/output. Add cost-ledger reconciliation, operational alerts and stronger abuse protections before opening to the public.

## Development
Start the local app with `npm run dev`. If `.env` does not already exist, copy `.env.example` to `.env` and enter provider values there; never commit secrets or overwrite an existing configuration. With `SUPABASE_AUTH_ENABLED=false`, local visitors are signed out: ChatGPT identity is supplied by the hosted Sites dispatcher and is not available automatically on localhost. The sample itinerary remains available without provider configuration.

Local Google/email sign-in requires Supabase configuration and the exact redirect allowlist entry `http://localhost:5173/auth/callback`. Google Cloud's OAuth callback is the Supabase project's `/auth/v1/callback`, not the local app URL. Email code login requires an email template containing `{{ .Token }}` and working email delivery. The current Supabase dashboard requires custom SMTP or an eligible plan to customize its default link-only template. Configure these before enabling local authentication. AI generation separately requires an Anthropic API key, supported model, and a positive monthly request limit in `.env`.

The local Cloudflare runtime has a separate database; it does not copy hosted trips or users. Apply the checked-in migrations to that local database before testing signed-in searches. Route tests apply migrations to an isolated in-memory SQLite database; passing them does not establish that the development database is initialized or that live providers work.

Use the checked-in npm lockfile. `npm run db:generate` generates migrations; inspect SQL before deployment. Never edit applied migrations. `npm run build` validates the production Worker build. `npx tsc --noEmit` validates TypeScript. Domain/security migration tests are in `tests/roamly.test.mjs`.

## Commercial launch gates
1. Configure and live-test provider credentials, latency, failure behavior and spend caps.
2. Add a payment provider, verified webhook handling, idempotent purchase records, entitlement enforcement, refunds and tax handling. The Plus waitlist currently validates interest only; no checkout or fabricated purchase success is included.
3. Confirm public sign-in and audience settings; this deployment is owner-only.
4. Set business identity, support address, retention/export/deletion flow, privacy policy and terms for the actual operator.
5. Integrate verified travel/booking data if claiming current prices, availability or affiliate revenue. Existing itineraries are unverified suggestions.
6. Run real-browser/mobile/accessibility checks, load tests, live API integration tests, account-isolation tests, backups/restore, alerts, and operational review before paid launch.

No architecture eliminates future issues. Prefer small feature boundaries, additive schema migrations, explicit contracts and reviewable changes. Split the interactive workspace by flow when its complexity warrants it.

## Assets
Bundled Unsplash photography: Raul Taciu (Dolomites), Bruce Tang (Kyoto), Radoslav Bali (Bali). Attribution links are available in the app footer.

## Google and email authentication

Provider integration: Supabase Auth, using the official SSR client with PKCE for Google OAuth, email verification codes, HttpOnly session cookies and server-side `getUser()` verification. `proxy.ts` rotates expired sessions and forwards refreshed cookies into the request and response. No browser-only identity is trusted.

Setup required before activation:
- Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the project's URL and publishable key. Never use a service-role key here.
- In Supabase, enable Google and configure its Google OAuth client. Register Supabase's callback URI in Google Cloud. Allow the exact Roamly `/auth/callback` URL in Supabase's redirect allowlist.
- Enable email authentication and configure production SMTP. Set the Magic Link email template to display `{{ .Token }}`; this app uses email OTP, not passwords. Codes of 6–8 digits are accepted.
- Test Google consent/cancellation, expired and invalid email codes, session refresh, logout and a fresh browser login against that configured project. Only then set `SUPABASE_AUTH_ENABLED=true` for public use.

The current private host still has its outer ChatGPT access policy. An independent Google/email login does not grant access through that policy. Public launch requires explicitly changing the Site audience or using external hosting. Do not silently broaden access.

Existing ChatGPT-owned trips/history retain their original owner IDs. Supabase users are namespaced `supabase:<uuid>`. Accounts are deliberately not merged just because emails match; safe migration requires proving control of both identities. Signing out suppresses automatic fallback to the platform identity.

## Search history

Optional paid integration check: `ROAMLY_LIVE_TEST=1 node --test tests/live-planner.test.mjs` uses the local `.env` to generate one-day Auckland and Austria itineraries, then reopens an isolated SQLite database and verifies both stored results. It simulates identity and does not test browser login or the development database. The test is skipped in normal test runs; its temporary database path is printed for inspection.

Every valid authenticated generation submission creates a separate D1 record before the AI request. Both completed and unsuccessful requests stay visible. History can reopen full inputs and completed results, paginate older records, and delete one entry. No automatic history retention deletion is performed. This cannot recover searches made before history tracking was introduced.

Run `node --test tests/auth-history.test.mjs` for real route-handler tests against an isolated SQLite database with injected platform headers. These cover Auckland followed by Austria, reopening results, account isolation, pagination, invalid inputs, and fail-closed authentication. Additional tests exercise the official Supabase SDK against a simulated provider for email codes, Google PKCE exchange, session verification, and sign-out. Real provider credentials are absent: these tests do not verify live Google login or email delivery. Run `python tests/storage_test.py` for saved-trip and quota checks.

## Automated checks

GitHub Actions runs TypeScript, lint, the production build, all Node tests, and SQLite storage tests on Linux and macOS for pushes and pull requests. No provider secrets are needed; paid live tests remain opt-in. Locally, run `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run lint`, and `python3 tests/storage_test.py`.

The build timeout uses Node and works on macOS without GNU coreutils. It defaults to three minutes; override with `SITES_BUILD_TIMEOUT=5m npm run build`. A timed-out build exits with status 124.

## Airbnb stay finder

Typing any trip destination immediately offers an Airbnb results link. The itinerary view, including reopened saved trips, uses that trip’s destination. No AI generation or Airbnb credentials are needed. Actual properties are displayed on Airbnb, where the traveler selects dates and guests; Roamly does not embed, scrape, rank, or claim availability of individual listings.

Plan and Explore also have an independent worldwide search plus 240 destination shortcuts in 24 country columns. The directory supports country filtering and case/accent-insensitive search. Places outside the directory still work through the free-text Airbnb search. The country filter affects the directory only. Country-qualified shortcuts reduce ambiguous location matches, but Airbnb ultimately resolves the query.

The public `/s/homes?query=` link behavior was checked in Airbnb’s browser interface on 2026-09-10, including a Japanese-language destination. It is a redirect integration, not an API contract. If Airbnb changes its search URLs, update `airbnbSearchUrl` and the search form action together. `tests/stays.test.mjs` covers directory entries, filtering and query encoding; component tests cover contextual links and the search form.

## Trip DNA and packing cues

The planner shows a trip signature based on interests, duration, pace and budget; itinerary views derive it from the saved intake. Packing cues reflect interests and prioritize accessibility notes when requested. These are simple planning suggestions, not destination-specific packing or accessibility verification. Tests cover all interest combinations, supported durations and practical needs.
