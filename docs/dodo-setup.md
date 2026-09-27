# Dodo Payments setup (buyers outside India)

Buyers outside India pay $10 for the 30-day Plus pass on Dodo Payments' checkout page. Razorpay keeps India. Until the secrets below are set, Dodo stays off.

Dodo is a **merchant of record**: it is the legal seller, so it adds and pays sales tax or VAT where due. That means a buyer may pay a little more than $10, and may pay in their own currency. Roamly records what was actually charged, and the receipt shows that amount.

| Buyer | Pays through |
|---|---|
| Cloudflare says the country is India, or it's unknown | Razorpay, ₹499 |
| Any other country | Dodo Payments, $10 plus any local tax |
| Anyone using the `ROAMLY99` launch code | Razorpay, ₹99, so it needs an Indian card or UPI |
| Anyone, when Razorpay isn't set up | Dodo Payments |

If both Dodo and Stripe (`docs/stripe-setup.md`) are set up, Dodo is used.

## Set it up

Do this in Dodo's test mode first, with test keys and `DODO_MODE=test`. Then repeat it in live mode. Test-mode and live-mode products, keys and webhooks are separate. Dodo's menu names may differ slightly from these.

1. **Account.** Sign up at dodopayments.com and finish their business verification.
2. **Product.** Create a **one-time** product priced **$10 USD**, for example "Roamly Plus · 30-day pass", in the digital products or software tax category. Store its id (it starts `pdt_`) as `DODO_PRODUCT_ID`.
3. **API key.** In Developer → API keys, create a key and store it as `DODO_API_KEY`.
4. **Webhook.** In Developer → Webhooks, add an endpoint:
   - URL: `https://heyroamly.com/api/billing/dodo/webhook`
   - Events: `payment.succeeded` and `refund.succeeded`

   Store its signing secret (it starts `whsec_`) as `DODO_WEBHOOK_SECRET`.
5. **Turn it on.**
   ```sh
   npx wrangler secret put DODO_API_KEY --name roamly
   npx wrangler secret put DODO_WEBHOOK_SECRET --name roamly
   npx wrangler secret put DODO_PRODUCT_ID --name roamly
   echo test | npx wrangler secret put DODO_MODE --name roamly    # "live" (or delete it) once you switch to live keys
   echo true | npx wrangler secret put DODO_ENABLED --name roamly
   ```

## How a payment is recorded

1. **Checkout starts.** Roamly saves an order with its own id (`dodo_…`, `provider = 'dodo'`). It creates a Dodo checkout for `DODO_PRODUCT_ID`, with that id in the payment's metadata, and stores Dodo's checkout id on the order. The buyer is sent to Dodo's page.
2. **The buyer comes back.** After paying, Dodo sends them to `/api/billing/dodo/return?order=…&payment_id=…`. That page asks Dodo for the payment. The pass is granted only if the payment succeeded, is for `DODO_PRODUCT_ID`, carries this order's id, and came from this order's checkout. The return address alone proves nothing. Without a `payment_id`, the page asks Dodo's checkout for its payment instead.
3. **The webhook backs it up.** `payment.succeeded` grants the pass for buyers who close the tab before coming back, with the same checks.
4. **Only once.** The pass and the receipt email are given once, however many of these arrive. The order then records Dodo's payment id (`pay_…`) and the amount and currency actually charged.

Webhooks follow the Standard Webhooks scheme that Dodo uses. The `webhook-signature` must match `webhook-id.webhook-timestamp.body`, signed with the secret, and be under 5 minutes old; otherwise it is refused with a 400.

## Refunds

Refund in Dodo's dashboard. When a payment is fully refunded (`refund.succeeded`), Roamly takes back the 30 days that payment bought and emails the buyer. Several partial refunds that add up to the full amount count too. A partial refund on its own leaves the pass alone.
