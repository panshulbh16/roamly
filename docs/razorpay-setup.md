# Roamly Plus payments

Plus is a 30-day pass paid once through Razorpay Orders and Checkout, the same model as Opportunity Hunter: ₹499 in India, $10 elsewhere. It never renews on its own; buying again before it ends stacks another 30 days. Plus gives 20 AI plans per day (UTC reset) instead of 5, plus Travel Together hosting.

## Settings

Store these in the site's secret/environment settings, never in source control or chat:

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (secret)
- `RAZORPAY_WEBHOOK_SECRET` (secret)
- `RAZORPAY_ENABLED=true` to open checkout
- `RAZORPAY_INTERNATIONAL=true` to charge $10 to visitors whose Cloudflare country is known and not India. Unknown country pays ₹499. Needs Razorpay international cards and/or PayPal active, otherwise foreign visitors see a checkout with no usable method.

No subscription plan is needed.

## Webhook

In Razorpay → Webhooks, add `https://roamly.panshulbh16.workers.dev/api/billing/webhook` for the `order.paid` event with the webhook secret above. Razorpay allows one webhook per URL, and a webhook's secret can't be edited; to change the secret, delete the webhook and create it again with the same value saved as `RAZORPAY_WEBHOOK_SECRET`. Checkout's success callback grants the pass immediately after verifying the payment signature; the webhook is the backstop for buyers who close the tab. Both are idempotent: only the first call that flips an order from `created` to `paid` grants 30 days.

## PayPal

PayPal is linked in Razorpay → Account & Settings → International Payments. Razorpay Checkout shows it automatically for non-INR (USD) orders once PayPal reports the account can receive payments; no code change is needed.
