# Security and data protection

## Personal data is encrypted at rest

`lib/server/vault.ts` seals personal data with AES-256-GCM before it reaches D1, so a database export, backup or the Cloudflare dashboard shows `enc1:…` ciphertext:

- saved trips, share snapshots, search history (destination, needs, results)
- waitlist, invite and receipt emails
- Travel Together plans, meeting points, and join-request names and messages

Each value is bound to its column, and tampering is detected. Sealing is deterministic (the IV is an HMAC of the content), so unchanged data keeps the same ciphertext and the "trip updated" notifications still fire only on real edits. Invite emails also get a keyed lookup hash (`email_key`) so duplicates can still be matched.

Left in the clear because the server searches or sorts on them: account IDs, dates, statuses, public trip cities and destinations, and billing records (order IDs, amounts, pass end dates).

### The key

Create it once and keep a copy somewhere safe, such as a password manager. **If the key is lost, the sealed data is gone.** Never change it once data is sealed with it.

```sh
openssl rand -base64 32 | npx wrangler secret put DATA_ENCRYPTION_KEY --name roamly
```

Until the key is set, the app works as before and stores plain text. Once it's set:
- **New writes** are sealed straight away.
- **Older rows** stay readable and are sealed by the Worker's cron (`*/15 * * * *`), 100 rows per table per run. The run logs `sealed_legacy_rows` while it works.
- **A missing or wrong key** makes sealed data return a 503 ("temporarily unavailable"), never garbled text.

## The API only answers Roamly's own pages

Every page calls the server through `lib/client/api.ts`, which adds `X-Roamly-Client: web`. The Worker (`worker/index.ts`) answers any other `/api/` request with the same 404 as a missing route: an address typed into the browser, another site, or a script. The path is decoded and lower-cased first, so `/%61pi/…` or `//api/…` can't slip past.

The payment providers' calls are the only exceptions. Razorpay's checkout callback and webhook each verify Razorpay's signature. Stripe's return page asks Stripe's API whether the payment went through, and its webhook checks a recent `Stripe-Signature`. A test fails if a page calls `fetch()` directly.

Behind the gate, every route still checks sign-in, same-origin writes and ownership. Hosts see a per-trip handle for each traveller, never their account ID.

A signed-in person can always see their own requests in the browser's developer tools. Those requests carry no secrets or third-party keys, and they only return data that person may see.

## Third parties see only what they need

- **Google Analytics** gets addresses without query strings or IDs (`/share/:id`, `/together/invite`). Invite tokens sign people in, so they never leave the site. The only query values it sees are campaign tags (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) with short plain values, so marketing links can be measured.
- **Anthropic, Resend, Razorpay's and Stripe's APIs** are called only from the server.

## Headers

Every response carries:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- a strict `Referrer-Policy` (`no-referrer` on share pages)

Other sites can't frame Roamly (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`), which stops click tricks on Pay, Join and Accept. The exception is ChatGPT's own hosting on `*.chatgpt.site`.

## Limits

Checkout is capped at 20 attempts per person per day, so a script can't flood Razorpay with orders. Invites are capped at 50 a day, and AI plans at 5 a day, or 20 on Plus.
