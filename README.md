# Traders Point Leather

Static site on Netlify; see `CLAUDE.md` for conventions. This file covers the on-site shop.

## The shop

`/shop` (listing), `/shop/<slug>` (product), `/cart`, `/order/thanks`. Cart is vanilla JS in
`shop/shop.js`, kept in `localStorage` (`tpl-cart-v1`) as `{slug, qty, options, initials}`. Prices
are never stored in the browser: they come from `/api/catalog` and are looked up again by
`/api/checkout`, which builds a Stripe Checkout Session. Stripe's REST API is called with `fetch`,
so there is no `package.json`.

| Path | Function | Purpose |
| --- | --- | --- |
| `/api/catalog` | `netlify/functions/catalog.js` | Read-only catalog from Stripe |
| `/api/checkout` | `netlify/functions/checkout.js` | Validates the cart, creates the Session |
| `/api/order` | `netlify/functions/order.js` | Order summary for the thanks page |
| `/api/stripe-webhook` | `netlify/functions/stripe-webhook.js` | Marks pieces sold, emails the owner |

The catalog lives in Stripe: each Product has one Price whose `lookup_key` is the slug. Product
metadata drives the pages (`one_of_a_kind`, `stock`, `monogram`, `options_color`,
`options_thread`, `options_size`, `size_input`, `size_label`, `needs_review`). The `monogram`
product is the $10 add-on. Stripe sandbox and live are separate catalogs: use the sandbox key
until launch, then recreate the catalog in live mode.

### Environment variables (Netlify, never committed)

| Name | Needed | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes | `sk_test_...` until launch |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` for the endpoint `https://<site>/api/stripe-webhook`, event `checkout.session.completed` |
| `SITE_URL` | no | Defaults to Netlify's `URL`; used for the success and cancel URLs |
| `STRIPE_TAX` | no | `true` turns on Stripe automatic tax. Decide with a tax professional |
| `RESEND_API_KEY`, `ORDER_EMAIL_FROM` | for owner emails | Without them the webhook logs and skips the email. `ORDER_EMAIL_TO` defaults to the support address |

### Soft launch and `SHOP_PUBLIC`

`shop-config.js` holds `window.SHOP_PUBLIC = false`. While false nothing public links to the shop,
the cart button exists only on shop pages, and every shop page has `noindex, nofollow`.

To launch, set `SHOP_PUBLIC = true`, then also (these are static files, not driven by the flag):

1. Remove the `<meta name="robots">` tag from `shop/index.html`, `shop/product.html`, `cart.html` and `order-thanks.html`.
2. Remove the three `Disallow` lines from `robots.txt`.
3. Add `/shop` and each product page to `sitemap.xml`.
4. Point `offers.url` in the `index.html` Product JSON-LD at the on-site pages.
5. Products with `needs_review` in Stripe stay hidden once the flag is true. Approve each description, then delete that metadata key.

### Known limits

- Two buyers can check out the same one-of-a-kind piece within the same few minutes. If the webhook finds it already sold, refund one.
- Items sold on Etsy must be marked inactive in Stripe by hand.
- Checkout Sessions last 31 minutes (Stripe's minimum is 30).
- Limited-stock counts (`stock`) are decremented by the webhook, not atomically.

### Local testing

Install the Netlify and Stripe CLIs, then `netlify dev` and `stripe listen --forward-to localhost:8888/api/stripe-webhook`. Test card `4242 4242 4242 4242`.
