# Roamly trip notifications - proposed design

Status: in-app first release approved by the user. Email and live billing activation remain outside this implementation.

## Goal
Keep hosts and travellers informed about requests and decisions without requiring them to inspect every trip. Preserve the existing Plus-only hosting/free joining model. Payments remain a separate activation task.

## Options
1. Recommended first release: durable in-app inbox. No new external account, recurring sender cost or email delivery dependency.
2. In-app plus email: same durable events, plus a delivery worker, verified sender domain, provider credentials, retries and delivery tracking. Requires sender setup before email can work.
3. Browser push: requires explicit notification permission and subscription management; defer until demand is established.

## Recommended first release
Notify the host about a new request or traveller withdrawal. Notify the affected traveller about approval, decline or removal. Notify approved travellers when private meeting details change. Notify pending and approved travellers when the host cancels. Closing new requests does not cancel existing participation.

Add a notifications table with an opaque ID, recipient account ID, outing ID, event type, timestamp and nullable read timestamp. Notification content uses generic event wording; never copy introductions, contact information or meeting notes into inbox content. Link to the trip, where current authorization determines which details are available.

Record an event only for an actual state change, atomically with the existing mutation. Prefer SQLite triggers on the relevant state transitions, with schema migrations owning the triggers, so retries and zero-row updates create no duplicate alerts and a notification write failure rolls back its triggering mutation. Updates to private notes emit only when the text changes. A cancellation fans out only to eligible request statuses. No notification rows for failed authorization or rejected approvals.

Inbox GET is authenticated, recipient-scoped, private/no-store and cursor-paginated with stable timestamp/ID ordering. Return an unread count. A same-origin POST marks only the caller's selected notification read; repeated marking is harmless. Show the inbox from the shared application shell with an accessible unread badge. Fetch on opening and refresh while visible; avoid adding a blocking inbox request to every page navigation. No claim of immediate push delivery.

Existing trips do not generate historical notifications during migration. Notification records are retained in this release; do not present read as delete. Add retention policy later with explicit product requirements.

## Validation
Run real migrations in the SQLite fixture. Verify every event type, intended recipients, no events on duplicate joins or no-op transitions, last-place approval behavior, cancellation fan-out, unchanged-note suppression, rollback on notification failure, recipient isolation and read idempotency. UI checks cover empty/loading/error states, unread count, safe trip navigation and refresh. Run existing regression/type checks and browser review before deployment.

## Payment activation dependency
Existing code validates the Rs.499 INR monthly plan and signed webhooks. Production still needs Razorpay keys, plan ID and webhook secret. Configure those through secure runtime settings, never chat or Git. Keep billing disabled until a test-mode checkout, webhook, renewal and cancellation flow passes. A production subscription purchase is not part of automated testing.

## Later email extension
Use durable delivery records keyed by event/channel. A background sender leases work, retries transient failures with bounded backoff and uses provider-supported idempotency. A database row alone cannot guarantee exactly-once email after an ambiguous provider timeout. Verify sender domain and consent/preferences before enabling delivery. No email provider is chosen or installed in this release.
