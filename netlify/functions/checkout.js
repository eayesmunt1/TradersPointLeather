import { loadCatalog, maxQty } from "../lib/catalog.js";
import { json, stripe } from "../lib/stripe.js";

const MAX_LINES = 20;
const clean = (v, n = 40) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);

// The designer's styles and their price. Money is decided here, never read from the request.
const DESIGNER = { classic: { name: "Classic Bifold", amount: 14500 }, vertical: { name: "Vertical Bifold", amount: 14500 } };

// Builds a Stripe Checkout Session from {slug, qty, options, initials} entries.
// Prices are looked up here from Stripe; nothing about money is read from the request.
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  // The cart posts JSON. A product page form submitted without JavaScript posts
  // form fields instead: one item, and the answer is a redirect or an HTML page.
  const isForm = (event.headers["content-type"] || "").includes("application/x-www-form-urlencoded");
  const reply = (status, body) =>
    !isForm
      ? json(status, body)
      : body.url
        ? { statusCode: 303, headers: { location: body.url }, body: "" }
        : {
            statusCode: status,
            headers: { "content-type": "text/html; charset=utf-8" },
            body: `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Checkout</title><body style="font-family:sans-serif;padding:2rem"><p>${String(body.error).replace(/</g, "&lt;")}</p><p><a href="javascript:history.back()">Go back</a></p>`,
          };

  let items, build = null;
  try {
    if (isForm) {
      const f = Object.fromEntries(new URLSearchParams(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body));
      items = [{ slug: f.slug, qty: Number(f.qty || 1), initials: f.initials, options: f }];
    } else {
      const body = JSON.parse(event.body || "{}");
      items = body.items;
      // The designer posts one custom build instead of cart items.
      if (body.build) { build = body.build; items = []; }
    }
  } catch {
    return reply(400, { error: "Invalid request." });
  }
  if (build && !Object.hasOwn(DESIGNER, String(build.model))) return reply(400, { error: "That wallet style is not available." });
  if (!Array.isArray(items) || (!build && !items.length) || items.length > MAX_LINES) {
    return reply(400, { error: "Your cart is empty or too large." });
  }

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch {
    return reply(502, { error: "The shop is unavailable right now. Please try again." });
  }

  const lineItems = [];
  const metadata = {};
  const wanted = new Map(); // slug -> total qty, to catch a split line over-ordering
  const problems = [];

  items.forEach((raw, i) => {
    const slug = clean(raw?.slug, 80);
    const product = catalog.get(slug);
    if (!product || slug === "monogram") {
      problems.push(`An item in your cart is no longer available.`);
      return;
    }
    if (product.soldOut) {
      problems.push(`${product.name} has sold. Ask for a Made to Order build instead.`);
      return;
    }
    const qty = Number(raw.qty);
    const total = (wanted.get(slug) || 0) + qty;
    wanted.set(slug, total);
    if (!Number.isInteger(qty) || qty < 1 || total > maxQty(product)) {
      problems.push(
        product.section === "made"
          ? `${product.name} is built to order, so only one can be ordered at a time.`
          : `${product.name}: only ${maxQty(product)} available.`
      );
      return;
    }

    // Every choice the product offers is required and must be one of its listed values.
    const chosen = {};
    for (const [key, list] of Object.entries(product.options)) {
      if (!list.length) continue;
      const v = clean(raw.options?.[key], 60);
      if (!list.includes(v)) {
        problems.push(`${product.name}: please choose a ${key}.`);
        return;
      }
      chosen[key] = v;
    }
    if (product.sizeInput) {
      const v = clean(raw.options?.sizeText, product.sizeInput.max);
      if (!v) {
        problems.push(`${product.name}: please enter ${product.sizeInput.label.toLowerCase()}.`);
        return;
      }
      chosen[product.sizeInput.label] = v;
    }

    const initials = clean(raw.initials, 4).toUpperCase();
    if (initials && (!product.monogram || !/^[A-Z]{1,4}$/.test(initials))) {
      problems.push(`${product.name}: initials must be 1 to 4 letters.`);
      return;
    }

    // The owner's pre-built color and thread, so the order says exactly what to make.
    const built = [
      product.build.color && `Color: ${product.build.color}`,
      product.build.thread && `Thread: ${product.build.thread}`,
    ];
    const description = [
      ...built,
      ...Object.entries(chosen).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`),
      initials ? `Initials: ${initials}` : "",
    ].filter(Boolean).join(" · ");

    lineItems.push({
      quantity: qty,
      price_data: {
        currency: product.currency,
        unit_amount: product.amount,
        product_data: {
          name: product.name,
          ...(description ? { description } : {}),
          ...(product.images[0] ? { images: [product.images[0]] } : {}),
        },
      },
    });
    if (initials) {
      const mono = catalog.get("monogram");
      if (!mono) {
        problems.push("Initials are unavailable right now.");
        return;
      }
      lineItems.push({
        quantity: qty,
        price_data: {
          currency: mono.currency,
          unit_amount: mono.amount,
          product_data: { name: `Initials for ${product.name}` },
        },
      });
    }
    // Keyed by line so the webhook knows what to mark sold and the owner what to make.
    metadata[`item_${i + 1}`] = `${slug} x${qty}${description ? ` | ${description}` : ""}`.slice(0, 500);
  });

  if (build) {
    const style = DESIGNER[build.model];
    const initials = clean(build.initials, 8).toUpperCase();
    if (initials && !/^[A-Z]{1,4}$/.test(initials)) problems.push("Initials must be 1 to 4 letters.");
    // The spec rows the customer chose, one line, with the title lines dropped.
    const rows = String(build.spec ?? "").split(/\r?\n/).slice(2).map((r) => clean(r, 120)).filter((r) => r && !/^Build code:/.test(r));
    const code = clean(build.code, 200);
    const description = rows.join(" · ").slice(0, 480);
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: style.amount,
        product_data: { name: `Custom wallet \u2014 ${style.name}`, ...(description ? { description } : {}) },
      },
    });
    if (initials) {
      const mono = catalog.get("monogram");
      if (!mono) problems.push("Initials are unavailable right now.");
      else lineItems.push({ quantity: 1, price_data: { currency: mono.currency, unit_amount: mono.amount, product_data: { name: "Initials for custom wallet" } } });
    }
    metadata.item_1 = `designer-${build.model} x1 | ${code}${initials ? ` | Initials: ${initials}` : ""}`.slice(0, 500);
  }

  if (problems.length) return reply(400, { error: [...new Set(problems)].join(" ") });

  // 1-2 weeks to ship unless every piece is Ready to Ship (section=ready); 5-7 days in transit either way.
  const ready = !build && items.every((raw) => catalog.get(clean(raw?.slug, 80))?.readyToShip);
  const origin = process.env.SITE_URL || process.env.URL || event.headers.origin;
  const now = Math.floor(Date.now() / 1000);
  try {
    const session = await stripe("POST", "/checkout/sessions", {
      mode: "payment",
      line_items: lineItems,
      metadata,
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: ready ? "Free shipping · ships in 1-3 business days" : "Free shipping · ships in 1-2 weeks",
            fixed_amount: { amount: 0, currency: "usd" },
            delivery_estimate: ready
              ? { minimum: { unit: "day", value: 6 }, maximum: { unit: "day", value: 12 } }
              : { minimum: { unit: "day", value: 12 }, maximum: { unit: "day", value: 21 } },
          },
        },
      ],
      // Stripe's minimum lifetime is 30 minutes; a minute of slack keeps the request valid.
      expires_at: now + 31 * 60,
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: build ? `${origin}/design.html` : `${origin}/cart`,
      ...(process.env.STRIPE_TAX === "true" ? { automatic_tax: { enabled: true } } : {}),
      // Managed Payments is off for this shop: accounts with it on by default reject our shipping
      // address collection and line items with no product tax code. Set STRIPE_MANAGED_PAYMENTS=true
      // to leave it to the account instead.
      ...(process.env.STRIPE_MANAGED_PAYMENTS === "true" ? {} : { managed_payments: { enabled: false } }),
    });
    return reply(200, { url: session.url });
  } catch (e) {
    return reply(502, { error: "Could not start checkout. Please try again." });
  }
}
