# Travel Together

Plus members may save private drafts and publish manual itineraries. Browsing is public; authenticated users may request one place without Plus. Server membership verification uses the same paid, active, unexpired subscription record as AI quotas. Razorpay must be configured before customers can acquire Plus; no bypass is added for this feature.

## Lifecycle and privacy

Draft → open → closed (new requests and approvals stop) → open with Plus, or cancelled permanently. Cancelling a draft makes it discarded and still private. Published itinerary fields cannot change: create a new trip if the route, dates, price estimate or capacity change. Private meeting details remain editable. Hosts retain management access after their subscription expires.

Requests are pending → approved or declined; approved travellers may be removed. Travellers may withdraw pending or approved requests. One request per account per trip, enforced by the composite primary key. A withdrawn, declined or removed account cannot request that same trip again. An atomic conditional update reserves capacity; pending requests do not reserve places. Capacity excludes the host. Departure dates use UTC for server comparisons.

Only the host sees request introductions. Meeting notes are returned only to the host or approved travellers, and are withheld from travellers on cancelled trips. Public output omits owner IDs and account emails. Removing a traveller stops future access but cannot recall details already seen. User content is rendered as text. All writes check origin and authentication, and API responses are private/no-store.

Discover shows up to 50 upcoming trips, filtered by case-insensitive city/destination text and exact departure date. My activity returns the latest 100 hosted/requested trips. Hosting and joining each have a 100-record account ceiling; each trip has a 100-request ceiling. Saved drafts count toward the hosting ceiling. This bounded first version does not include email notifications, group chat, group bookings or payments between travellers; users refresh My activity for status changes.

## Reports and operation

Reports are stored in `outing_reports`, one per reporter/trip. The UI explicitly says reports do not automatically remove content and do not provide emergency response. There is no moderation dashboard or automatic notification. Before promoting this as a moderated community, assign an operator and review queue.

Site operators can review `outing_reports` using the trusted D1 administration interface, joined to `outings` on `trip_id=id`; do not publish reporter identities. For confirmed abuse, cancel the outing with an owner-operated SQL update to `outings.status='cancelled'`. Draft/discarded trips must remain private. No public endpoint grants moderation privileges.

## Checks

`node --test tests/auth-history.test.mjs tests/navigation.test.mjs` covers free/guest rejection, private drafts, discarded-draft privacy, public field filtering, request ownership, duplicate joins, competing last-place approvals, revoked access, lifecycle and subscription expiry. Full regression: `npm test`, plus `npx tsc --noEmit` and `python3 tests/storage_test.py`.

## In-app notifications

Signed-in users open the bell in the header for a private inbox. New requests and withdrawals notify the host; approvals, declines and removals notify the affected traveller. Cancellation notifies pending and approved travellers. Changed meeting notes notify approved travellers. Alert text never copies private introductions or meeting/contact details.

SQL triggers in migration 0005 insert notifications in the same transaction as the state change. No-op updates do not emit, and notification failure rolls back the mutation. Existing activity is not backfilled. Notifications survive trip removal; a link always uses the current trip authorization checks.

GET /api/notifications returns 20 newest items with a stable timestamp/ID cursor and unread count. POST marks one recipient-owned record read, idempotently. The inbox fetches on open, refreshes every 30 seconds while visible and supports older pages. Refresh returns to the latest page. The badge shows the last fetched count; it is not a push subscription. Read status is durable. Retention is indefinite in this release. No emails or browser push notifications are sent.
