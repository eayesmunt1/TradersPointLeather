import { loadCatalog } from "../lib/catalog.js";
import { json, shippingOf, stripe, verifySignature } from "../lib/stripe.js";

// Parses the "slug xQTY | details" lines that checkout.js wrote into the Session metadata.
function orderedItems(metadata) {
  return Object.entries(metadata || {})
    .filter(([k]) => k.startsWith("item_"))
    .map(([, v]) => {
      const m = /^(\S+) x(\d+)/.exec(v);
      return m ? { slug: m[1], qty: Number(m[2]), line: v } : null;
    })
    .filter(Boolean);
}

// Counts down Ready to Ship stock. A sold-out piece stays active in Stripe at stock 0 so its page
// can still offer a Made to Order build. Returns the orders that could not be filled from stock
// (a second buyer got through), which the owner refunds by hand.
async function applyInventory(items) {
  const catalog = await loadCatalog();
  const left = new Map(); // slug -> stock after the lines handled so far
  const oversold = [];
  for (const it of items) {
    if (it.slug.startsWith("designer-")) continue; // a custom build: nothing in stock to count
    const product = catalog.get(it.slug);
    if (!product) {
      oversold.push(`${it.slug} x${it.qty} (no longer listed)`);
      continue;
    }
    if (product.section !== "ready" || product.stock === null) continue;
    const after = (left.has(it.slug) ? left.get(it.slug) : product.stock) - it.qty;
    left.set(it.slug, after);
    if (after < 0) oversold.push(`${it.slug} x${it.qty} (only ${product.stock} was in stock)`);
    await stripe("POST", `/products/${product.productId}`, { metadata: { stock: Math.max(after, 0) } });
  }
  return oversold;
}

async function emailOwner(session, items, oversold = "") {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_EMAIL_TO || "customer-support@traderspointleather.com";
  const from = process.env.ORDER_EMAIL_FROM;
  if (!key || !from) {
    console.warn("RESEND_API_KEY or ORDER_EMAIL_FROM not set: order email skipped for", session.id);
    return false;
  }
  const ship = shippingOf(session);
  const a = ship?.address || {};
  const text = [
    ...(oversold ? [`OVERSOLD, refund or remake: ${oversold}`, ""] : []),
    `New order ${session.id}`,
    `Total: $${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}`,
    `Buyer: ${session.customer_details?.name || ""} <${session.customer_details?.email || ""}>`,
    "",
    "Items:",
    ...items.map((i) => `- ${i.line}`),
    "",
    "Ship to:",
    ship?.name || "",
    [a.line1, a.line2].filter(Boolean).join(", "),
    [a.city, a.state, a.postal_code].filter(Boolean).join(" "),
  ].join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject: `${oversold ? "OVERSOLD " : ""}New order: $${(session.amount_total / 100).toFixed(2)}`, text }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status}`);
  return true;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    verifySignature(raw, event.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return json(400, { error: "Bad signature" });
  }

  const evt = JSON.parse(raw);
  if (evt.type !== "checkout.session.completed") return json(200, { received: true });

  try {
    // Re-read the Session so we act on Stripe's copy, including flags from an earlier delivery.
    const session = await stripe("GET", `/checkout/sessions/${evt.data.object.id}`);
    if (session.payment_status !== "paid") return json(200, { received: true });
    const items = orderedItems(session.metadata);
    const done = {};

    // Each step records itself on the Session, so a repeat delivery skips what already ran.
    let oversold = session.metadata.oversold || "";
    if (session.metadata.inventory_applied !== "true") {
      oversold = (await applyInventory(items)).join("; ").slice(0, 500);
      done.inventory_applied = "true";
      if (oversold) done.oversold = oversold;
      await stripe("POST", `/checkout/sessions/${session.id}`, { metadata: done });
    }
    if (session.metadata.owner_notified !== "true") {
      if (await emailOwner(session, items, oversold)) {
        await stripe("POST", `/checkout/sessions/${session.id}`, { metadata: { owner_notified: "true" } });
      }
    }
    return json(200, { received: true });
  } catch (e) {
    console.error("Webhook failed", e);
    return json(500, { error: "Retry" }); // Stripe retries; finished steps are skipped
  }
}
