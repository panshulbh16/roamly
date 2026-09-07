# Roamly

An early-access travel planning app. This release is private and does not collect payments. Do not describe it as a fully launched commercial service.

## Architecture
- `app/`: thin server pages and API routes.
- `components/trips/`: product UI, shared shell and interactive planning surface.
- `lib/trips/`: validated domain contracts and explicitly labeled sample content.
- `lib/server/`: server-only identity, persistence boundary and interchangeable AI provider.
- `db/schema.ts` + `drizzle/`: versioned database schema and migrations.

The host supplies trusted identity headers; never expose this Worker outside its trusted dispatcher without replacing identity verification. All saved-record queries scope to the authenticated owner. Mutation routes enforce same-origin requests and parameterize queries. No secrets belong in browser bundles.

## AI activation
Configure hosted secrets `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and a positive integer `AI_MONTHLY_REQUEST_LIMIT`. Use a provider-supported model identifier. AI is fail-closed without all three. Each attempt atomically reserves a daily user request (5/day) and monthly global request. Attempts are charged against quota even when generation fails, intentionally avoiding retry spend loops. Provider requests have a 55-second timeout and 6,500 output-token ceiling, with validated input/output and exact day-count checks. No automatic provider retries.

The request ceiling is NOT a monetary budget guarantee. Configure an Anthropic account spending cap and calculate the request ceiling against selected model rates and bounded payload/output. Add cost-ledger reconciliation, operational alerts and stronger abuse protections before opening to the public.

## Development
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

Every valid authenticated generation submission creates a separate D1 record before the AI request. Both completed and unsuccessful requests stay visible. History can reopen full inputs and completed results, paginate older records, and delete one entry. No automatic history retention deletion is performed. This cannot recover searches made before history tracking was introduced.

Run `node --test tests/auth-history.test.mjs` for real route-handler tests against an isolated SQLite database with injected platform headers. These cover Auckland followed by Austria, reopening results, account isolation, pagination, invalid inputs, and fail-closed authentication. Additional tests exercise the official Supabase SDK against a simulated provider for email codes, Google PKCE exchange, session verification, and sign-out. Real provider credentials are absent: these tests do not verify live Google login or email delivery. Run `python tests/storage_test.py` for saved-trip and quota checks.
