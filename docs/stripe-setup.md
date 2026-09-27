# Stripe setup (buyers outside India)

Buyers outside India pay $10 for the 30-day Plus pass on Stripe Checkout, Stripe's own payment page. Razorpay keeps India. Until the three Stripe secrets below are set, Stripe stays off and everyone pays through Razorpay as before.

| Buyer | Pays through | Price |
|---|---|---|
| Cloudflare says the country is India, or it's unknown | Razorpay | ₹499 |
| Any other country | Stripe | $10 |
| Anyone using the `ROAMLY99` launch code | Razorpay | ₹99, so it needs an Indian card or UPI (the pricing page says so) |
| Anyone, when only Stripe is set up | Stripe | $10 |

## You need a Stripe account

New Stripe accounts for Indian businesses are [invite-only](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india). You can request an invite from Stripe, or use a company registered where Stripe signs up directly (for example a US company, through Stripe Atlas).

If neither works, the fallback is a merchant of record such as Dodo Payments. It works the same way: buyers go to the provider's page and a signed webhook confirms the payment.

## Set it up

Try everything in test mode first, with keys starting `sk_test_` and the test card `4242 4242 4242 4242`. Then repeat these steps with live keys.

1. **API key.** In Stripe, go to Developers → API keys. A restricted key with **Checkout Sessions: Write** permission is enough. Store it as `STRIPE_SECRET_KEY`.
2. **Webhook.** In Developers → Webhooks, add an endpoint:
   - URL: `https://heyroamly.com/api/billing/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`

   Store its signing secret (it starts `whsec_`) as `STRIPE_WEBHOOK_SECRET`.
3. **Turn it on.** Store the secrets and switch Stripe on:
   ```sh
   npx wrangler secret put STRIPE_SECRET_KEY --name roamly
   npx wrangler secret put STRIPE_WEBHOOK_SECRET --name roamly
   echo true | npx wrangler secret put STRIPE_ENABLED --name roamly
   ```
4. **Payment methods.** Stripe's page shows whatever is on under Stripe → Settings → Payment methods, such as cards, Apple Pay and Google Pay.

## How a payment is recorded

1. **Checkout starts.** Roamly creates a Checkout Session for $10 and saves an order with `provider = 'stripe'`. The order's id is the session id (`cs_…`).
2. **The buyer is sent to Stripe's page.**
3. **The buyer comes back.** After paying, Stripe sends them to `/api/billing/stripe/return`. That page asks Stripe directly whether the session is paid, because the return address alone proves nothing. The pass is granted only if the session belongs to one of Roamly's orders and was paid for the same amount. The buyer then lands on `/pricing`.
4. **The webhook backs it up.** `checkout.session.completed` grants the pass for buyers who close the tab before coming back. `checkout.session.async_payment_succeeded` grants it for payment methods that clear later; those buyers see "switching on" until then.
5. **Only once.** The pass and the receipt email are given once, however many of these arrive. The payment id (`pi_…`) is saved on the order.

Webhooks must carry a valid `Stripe-Signature` made in the last 5 minutes. Otherwise they are refused with a 400.

## Refunds

Refund in Stripe → Payments → Refund. A full refund (`charge.refunded`) takes back the 30 days that payment bought and emails the buyer, the same as a Razorpay refund. A partial refund leaves the pass alone.

## Tax

Stripe processes the payment, but Roamly is still the seller. Sales tax and VAT on digital services abroad are yours to handle; Stripe Tax can help. A merchant of record handles them for you.
