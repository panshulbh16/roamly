# Roamly Plus activation

Prepared plan: ₹499/month, 20 AI plans per day (UTC reset). Regenerating one day consumes one plan. Free stays at 5. The global AI spending cap still applies. Existing editing, sharing and PDF export remain free.

Checkout is disabled until all production runtime settings are configured. No Razorpay credentials were available during implementation; tests use simulated provider responses. Do not enable live billing before completing Razorpay test-mode checkout, renewal, cancellation and webhook tests.

## Configure securely

In Razorpay, create a monthly INR plan with interval 1 and amount 49900 paise. Store its plan ID and API credentials in the site's secret/environment settings, never in source control or chat:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET` (secret)
- `RAZORPAY_PLAN_ID`
- `RAZORPAY_WEBHOOK_SECRET` (secret)
- `RAZORPAY_ENABLED` (leave `false` until testing is complete)

Configure `https://roamly-trip-planner.pb116.chatgpt.site/api/billing/webhook` for all subscription events. It verifies the HMAC of the raw body, then fetches canonical subscription state. It does not grant access from a browser callback or unsigned event. Checkout verifies the configured plan's actual currency, amount and interval before creating a subscription.

The subscription uses Razorpay's hosted checkout link and up to 120 monthly billing cycles. After payment, return to Pricing and choose **Refresh membership after payment**. Active, paid, unexpired subscriptions receive the higher allowance. Cancellation schedules active subscriptions to end after the current paid period.

## Test before enabling live checkout

Use test keys and a test plan in a separate test deployment. Verify guest rejection; ₹499 plan validation; payment success/failure; duplicate checkout; duplicate and out-of-order webhooks; 20-versus-5 daily limits; failed renewal; expiry; and account-isolated cancellation. Then configure live keys, the live plan and live webhook secret. Finalise customer-facing billing, support and refund information for your business before accepting charges.

A timed-out subscription creation is deliberately not retried automatically, because Razorpay may already have created it. If a row remains `creating`, find the subscription in Razorpay using its `roamly_owner` note and reconcile its ID before clearing or retrying. Never clear it blindly. Existing IDs are reused for pending checkout.

Official references: [Create subscriptions](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/), [validate webhooks](https://razorpay.com/docs/webhooks/validate-test/), [cancel subscriptions](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription).
