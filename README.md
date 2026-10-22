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
| `/shop/<slug>` | `netlify/functions/shop-page.js` | Product page rendered on the server (works without JavaScript); real 404 for unknown slugs |
| `/api/catalog` | `netlify/functions/catalog.js` | Read-only catalog from Stripe |
| `/api/checkout` | `netlify/functions/checkout.js` | Validates the cart, creates the Session |
| `/api/order` | `netlify/functions/order.js` | Order summary for the thanks page |
| `/api/stripe-webhook` | `netlify/functions/stripe-webhook.js` | Marks pieces sold, emails the owner |

The catalog lives in Stripe: each Product has one Price whose `lookup_key` is the slug. Product
metadata drives the pages (`one_of_a_kind`, `stock`, `monogram`, `options_color`,
`options_thread`, `options_size`, `size_input`, `size_label`, `needs_review`, `ready_to_ship`). Everything ships in 1–2 weeks unless its product has
`ready_to_ship=true`, which switches it to 1–3 business days and adds a "Ready to ship" badge;
a cart gets the faster estimate only when every item is ready. "Made to order" is dropped from
product names on display, since every piece is made to order by default. The `monogram`
product is the $10 add-on. Stripe sandbox and live are separate catalogs: use the sandbox key
until launch, then recreate the catalog in live mode.

### Photos

`img/<slug>/` holds web-sized photos from the owner's TPL-photos folder; `img/manifest.json` maps each
slug to its photos (made-to-order products tag each photo with its colour, and picking a colour on the
product page shows just those). Products with no folder fall back to Stripe's product images, then to
"Photos coming soon". `img/details/` has the TanneryStamp detail shots, not yet placed on a page.
Without JavaScript a product page's button posts straight to checkout for that one item.

### Environment variables (Netlify, never committed)

| Name | Needed | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes | `sk_test_...` until launch |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` for the endpoint `https://<site>/api/stripe-webhook`, event `checkout.session.completed` |
| `SITE_URL` | no | Defaults to Netlify's `URL`; used for the success and cancel URLs |
| `STRIPE_TAX` | no | `true` turns on Stripe automatic tax. Decide with a tax professional |
| `RESEND_API_KEY`, `ORDER_EMAIL_FROM` | for owner emails | Without them the webhook logs and skips the email. `ORDER_EMAIL_TO` defaults to the support address |

### `SHOP_PUBLIC`

`shop-config.js` holds `window.SHOP_PUBLIC`, and it is `true`. That means:

- The home page's Shop link shows, and every buy link points at the shop. Each link keeps its old Etsy
  URL in `data-etsy`, so setting the flag to `false` swaps them back to Etsy and hides the Shop link: a
  one-line rollback.
- `/sitemap.xml` (a function, built from the Stripe catalog) lists `/shop` and every published product
  page, sold Ready to Ship pieces included. With the flag `false` it lists only the home page and the designer.
- The shop pages have no `noindex` tag. `cart.html` and `order-thanks.html` keep theirs, and a `?drafts=1`
  preview of unapproved products is added `noindex` by the page itself.
- `robots.txt` does not mention the shop.
- Products with `needs_review` in Stripe are never listed or sold. Approve a description, then delete that metadata key.

Locally, `npx netlify-cli dev --offline` serves the site with the functions. `python3 -m http.server`
serves the home page and the designer but not `/shop` or `/api/*`.

### Known limits

- Two buyers can check out the last piece of a Ready to Ship item within the same few minutes. The webhook sets `oversold` on the Checkout Session and adds an OVERSOLD line to the owner email: refund one.
- Items sold on Etsy must be marked inactive in Stripe by hand.
- Checkout Sessions last 31 minutes (Stripe's minimum is 30).
- Limited-stock counts (`stock`) are decremented by the webhook, not atomically.

### Local testing

Install the Netlify and Stripe CLIs, then `netlify dev` and `stripe listen --forward-to localhost:8888/api/stripe-webhook`. Test card `4242 4242 4242 4242`.
