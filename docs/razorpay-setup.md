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

In Razorpay → Webhooks, add `https://heyroamly.com/api/billing/webhook` (the older `roamly.panshulbh16.workers.dev` webhook URL keeps working because `/api/` is not redirected) for the `order.paid` and `refund.processed` events with the webhook secret above. Razorpay allows one webhook per URL, and a webhook's secret can't be edited; to change the secret, delete the webhook and create it again with the same value saved as `RAZORPAY_WEBHOOK_SECRET`. Checkout runs in redirect mode with `callback_url` set to `<site>/api/billing/callback`: Razorpay posts the result there, the route verifies the payment signature, grants the pass and redirects the buyer to `/pricing?checkout=activated` (or `failed`/`unverified`), where Plus is celebrated. This works on phones, in-app browsers and the installed app, where paying leaves the page and a JavaScript handler would never run. The webhook is the backstop for buyers who never make it back. Both are idempotent: only the first call that flips an order from `created` to `paid` grants 30 days.

## Launch code

`ROAMLY99` gives one 30-day pass for ₹99 (INR, whatever the country) to the first 200 accounts that use it. Signed-in buyers enter it on `/pricing`, or open a link such as `https://heyroamly.com/pricing?code=ROAMLY99`, which fills it in and still works after signing in.

- **Once per account:** paying with the code uses it, and a refund doesn't give it back.
- **The 200 places:** a place is taken by paying or, for 30 minutes, by an open checkout. Reopening checkout reuses the same order, so one account never holds two places. Taking the place and saving the order happen in one database statement, so two people paying at the same moment can't both get the last one. A checkout left open for over 30 minutes and then paid still grants the pass, which can put the total a little over 200.
- **Order details:** the order is saved with `coupon = 'ROAMLY99'`, and Razorpay's order notes include `coupon`, so these payments are easy to find in the dashboard. Receipts and refunds work as for any other order.
- **Changing the offer:** the code, price and number of places are set in `LAUNCH` in `lib/billing/razorpay.ts`.

## Receipts and refunds

Each purchase emails the buyer a receipt: amount, order and payment IDs, and the date Plus runs until. It's sent once, by whichever of the callback or webhook records the payment first. Receipts use the invite email settings (`RESEND_API_KEY`, `EMAIL_FROM`); without them, payments still work and no receipt is sent. A receipt is not a tax invoice.

To refund, use Razorpay → Payments → Refund. When Razorpay reports the refund (`refund.processed`):

- **Full refund:** removes the 30 days that payment bought and emails the buyer. If they had bought another pass, that pass is kept.
- **Partial refund:** leaves the pass unchanged.

Emails go to the address saved with the order. Orders placed before receipts existed (27 September 2026) have none, so their refund email goes to the address the buyer entered in Razorpay's checkout.

Replayed events change nothing.

## PayPal

PayPal is linked in Razorpay → Account & Settings → International Payments. Razorpay Checkout shows it automatically for non-INR (USD) orders once PayPal reports the account can receive payments; no code change is needed.
