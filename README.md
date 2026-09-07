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
