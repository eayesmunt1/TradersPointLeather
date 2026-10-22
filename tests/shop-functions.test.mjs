// Run with: node --test tests/
// Checkout and the webhook, with Stripe's API replaced by an in-memory stub.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.STRIPE_SECRET_KEY = "rk_test_stub";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_stub";
process.env.SITE_URL = "https://shop.test";

const { handler: checkout } = await import("../netlify/functions/checkout.js");
const { handler: webhook } = await import("../netlify/functions/stripe-webhook.js");

const product = (id, name, metadata, amount = 14500) => ({
  id: `price_${id}`,
  lookup_key: id,
  unit_amount: amount,
  currency: "usd",
  product: { id: `prod_${id}`, name, active: true, description: "", images: [], metadata },
});

const PRICES = [
  product("plum", "CygnetV2 Plum", { section: "ready", stock: "2", monogram: "true", type: "wallet" }),
  product("gone", "CygnetV2 Gone", { section: "ready", stock: "0", monogram: "true", type: "wallet" }),
  product("gv1", "GV1", { section: "made", monogram: "true", type: "wallet", choices: "snap|thread", options_snap: "Single Snap|Double Snap", options_thread: "Cream|Havana Brown" }, 6500),
  // A product with a leftover thread list but no `choices`: the thread must not become a choice.
  product("siah", "SiahV2", { section: "made", monogram: "true", type: "wallet", options_thread: "Cream|Chestnut|Havana Brown" }, 6500),
  product("belt", "Belt", { section: "made", type: "belt", size_input: "text", size_label: "Belt length" }, 9500),
  product("collar", "Collar", { section: "made", type: "collar", size_input: "text", size_label: "Size" }, 5000),
  product("cygnet", "CygnetV2 Cavalier", { section: "made", monogram: "true", type: "wallet", build_color: "Whiskey", build_thread: "Cream" }),
  product("draft", "Draft", { section: "made", type: "wallet", needs_review: "draft_description" }),
  product("monogram", "Monogram", { type: "addon" }, 1000),
];

let calls;
function stubStripe(extra = {}) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    const path = u.pathname.replace("/v1", "");
    calls.push({ method, path, body: init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {} });
    const reply = (data) => ({ ok: true, status: 200, json: async () => data });
    if (path === "/prices") return reply({ data: PRICES });
    if (path === "/checkout/sessions" && method === "POST") return reply({ url: "https://checkout.test/s" });
    if (extra[`${method} ${path}`]) return reply(extra[`${method} ${path}`]);
    return reply({});
  };
}

const order = (items) => checkout({ httpMethod: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
const session = () => calls.find((c) => c.path === "/checkout/sessions" && c.method === "POST")?.body;
const errorOf = (res) => JSON.parse(res.body).error;

test("a Ready to Ship piece checks out with its ship time", async () => {
  stubStripe();
  const res = await order([{ slug: "plum", qty: 2, options: {} }]);
  assert.equal(res.statusCode, 200);
  assert.match(session()["shipping_options[0][shipping_rate_data][display_name]"], /1-3 business days/);
});

test("Managed Payments is left alone unless STRIPE_MANAGED_PAYMENTS=false", async () => {
  stubStripe();
  await order([{ slug: "plum", qty: 1, options: {} }]);
  assert.equal(session()["managed_payments[enabled]"], undefined);
  process.env.STRIPE_MANAGED_PAYMENTS = "false";
  try {
    stubStripe();
    await order([{ slug: "plum", qty: 1, options: {} }]);
    assert.equal(session()["managed_payments[enabled]"], "false");
  } finally {
    delete process.env.STRIPE_MANAGED_PAYMENTS;
  }
});

test("a sold-out piece is refused", async () => {
  stubStripe();
  const res = await order([{ slug: "gone", qty: 1, options: {} }]);
  assert.equal(res.statusCode, 400);
  assert.match(errorOf(res), /has sold/);
});

test("Ready to Ship cannot exceed stock, Made to Order is one per line", async () => {
  stubStripe();
  assert.equal((await order([{ slug: "plum", qty: 3, options: {} }])).statusCode, 400);
  const made = await order([{ slug: "cygnet", qty: 2, options: {} }]);
  assert.equal(made.statusCode, 400);
  assert.match(errorOf(made), /one can be ordered/);
});

test("a split line cannot over-order stock", async () => {
  stubStripe();
  const res = await order([{ slug: "plum", qty: 2, options: {} }, { slug: "plum", qty: 1, options: {} }]);
  assert.equal(res.statusCode, 400);
});

test("GV1 needs a listed snap and a listed thread, and records both", async () => {
  stubStripe();
  assert.equal((await order([{ slug: "gv1", qty: 1, options: {} }])).statusCode, 400);
  // Each is required on its own.
  assert.equal((await order([{ slug: "gv1", qty: 1, options: { snap: "Double Snap" } }])).statusCode, 400);
  assert.equal((await order([{ slug: "gv1", qty: 1, options: { thread: "Cream" } }])).statusCode, 400);
  // Values must be on the product's own lists.
  assert.equal((await order([{ slug: "gv1", qty: 1, options: { snap: "Triple Snap", thread: "Cream" } }])).statusCode, 400);
  assert.equal((await order([{ slug: "gv1", qty: 1, options: { snap: "Double Snap", thread: "Chestnut" } }])).statusCode, 400);
  stubStripe();
  const res = await order([{ slug: "gv1", qty: 1, options: { snap: "Double Snap", thread: "Havana Brown" } }]);
  assert.equal(res.statusCode, 200);
  const d = session()["line_items[0][price_data][product_data][description]"];
  assert.match(d, /Thread: Havana Brown/);
  assert.match(d, /Snap: Double Snap/);
});

test("a leftover thread list on a product that does not opt in is not required", async () => {
  stubStripe();
  const res = await order([{ slug: "siah", qty: 1, options: {} }]);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(session()["line_items[0][price_data][product_data][description]"] || "", /Thread/);
});

test("a price or choice the product does not offer is ignored", async () => {
  stubStripe();
  const res = await order([{ slug: "cygnet", qty: 1, price: 1, unit_amount: 1, options: { color: "Pink", thread: "Neon" } }]);
  assert.equal(res.statusCode, 200);
  const s = session();
  assert.equal(s["line_items[0][price_data][unit_amount]"], "14500");
  assert.doesNotMatch(s["line_items[0][price_data][product_data][description]"], /Pink|Neon/);
});

test("the pre-built color and thread, and initials, reach the line item", async () => {
  stubStripe();
  const res = await order([{ slug: "cygnet", qty: 1, initials: "ey", options: {} }]);
  assert.equal(res.statusCode, 200);
  const s = session();
  assert.equal(s["line_items[0][price_data][product_data][description]"], "Color: Whiskey · Thread: Cream · Initials: EY");
  assert.equal(s["line_items[1][price_data][unit_amount]"], "1000"); // the $10 monogram line
  assert.match(s["metadata[item_1]"], /^cygnet x1 \| Color: Whiskey/);
  assert.match(s["shipping_options[0][shipping_rate_data][display_name]"], /1-2 weeks/);
});

test("initials are limited to wallets and to letters", async () => {
  stubStripe();
  assert.equal((await order([{ slug: "cygnet", qty: 1, initials: "E1", options: {} }])).statusCode, 400);
  assert.equal((await order([{ slug: "belt", qty: 1, initials: "EY", options: { sizeText: "36" } }])).statusCode, 400);
});

test("belt length and collar size are required text with their own limits", async () => {
  stubStripe();
  assert.equal((await order([{ slug: "belt", qty: 1, options: {} }])).statusCode, 400);
  const long = "x".repeat(40);
  await order([{ slug: "belt", qty: 1, options: { sizeText: long } }]);
  assert.equal(session()["line_items[0][price_data][product_data][description]"], `Belt length: ${"x".repeat(20)}`);
  stubStripe();
  await order([{ slug: "collar", qty: 1, options: { sizeText: long } }]);
  assert.equal(session()["line_items[0][price_data][product_data][description]"], `Size: ${"x".repeat(30)}`);
});

test("a draft product cannot be bought", async () => {
  stubStripe();
  const res = await order([{ slug: "draft", qty: 1, options: {} }]);
  assert.equal(res.statusCode, 400);
});

// --- webhook ---

const signed = (event) => {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest("hex");
  return { httpMethod: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: raw };
};
const completed = (metadata) => ({
  type: "checkout.session.completed",
  data: { object: { id: "cs_1" } },
  _session: { id: "cs_1", payment_status: "paid", metadata, currency: "usd", amount_total: 14500, customer_details: {}, shipping_details: { address: {} } },
});
const deliver = async (metadata) => {
  const evt = completed(metadata);
  stubStripe({ "GET /checkout/sessions/cs_1": evt._session });
  const res = await webhook(signed({ type: evt.type, data: evt.data }));
  return res;
};
const productWrites = () => calls.filter((c) => c.method === "POST" && c.path.startsWith("/products/"));

test("a sale lowers stock and leaves the product active", async () => {
  const warn = console.warn;
  console.warn = () => {};
  const res = await deliver({ item_1: "plum x1 | " });
  console.warn = warn;
  assert.equal(res.statusCode, 200);
  const [w] = productWrites();
  assert.equal(w.path, "/products/prod_plum");
  assert.equal(w.body["metadata[stock]"], "1");
  assert.equal(w.body.active, undefined);
  const flags = calls.find((c) => c.path === "/checkout/sessions/cs_1" && c.method === "POST").body;
  assert.equal(flags["metadata[inventory_applied]"], "true");
  assert.equal(flags["metadata[oversold]"], undefined);
});

test("an order past the stock is flagged oversold, and stock stops at 0", async () => {
  const warn = console.warn;
  console.warn = () => {};
  await deliver({ item_1: "plum x2 | ", item_2: "plum x1 | " });
  console.warn = warn;
  const stocks = productWrites().map((w) => w.body["metadata[stock]"]);
  assert.deepEqual(stocks, ["0", "0"]);
  const flags = calls.find((c) => c.path === "/checkout/sessions/cs_1" && c.method === "POST").body;
  assert.match(flags["metadata[oversold]"], /plum x1/);
});

test("Made to Order sales do not touch stock", async () => {
  const warn = console.warn;
  console.warn = () => {};
  await deliver({ item_1: "cygnet x1 | Color: Whiskey" });
  console.warn = warn;
  assert.equal(productWrites().length, 0);
});

test("a repeat delivery does not count stock twice", async () => {
  const warn = console.warn;
  console.warn = () => {};
  await deliver({ item_1: "plum x1 | ", inventory_applied: "true" });
  console.warn = warn;
  assert.equal(productWrites().length, 0);
});

// --- sitemap ---

const { handler: sitemap } = await import("../netlify/functions/sitemap.js");
const sitemapFor = async (publicFlag) => {
  stubStripe();
  const real = globalThis.fetch;
  globalThis.fetch = async (u, init) =>
    String(u).endsWith("/shop-config.js")
      ? { ok: true, text: async () => `window.SHOP_PUBLIC = ${publicFlag};` }
      : real(u, init);
  return (await sitemap({ rawUrl: "https://shop.test/sitemap.xml" })).body;
};

test("the sitemap lists only the static pages while the shop is hidden", async () => {
  const xml = await sitemapFor(false);
  assert.match(xml, /<loc>https:\/\/traderspointleather\.com\/<\/loc>/);
  assert.doesNotMatch(xml, /\/shop/);
});

test("the sitemap lists the shop and every published product, sold ones included", async () => {
  const xml = await sitemapFor(true);
  assert.match(xml, /traderspointleather\.com\/shop<\/loc>/);
  for (const page of ["ready-to-ship", "made-to-order", "belts"]) assert.match(xml, new RegExp(`/shop/${page}</loc>`));
  assert.match(xml, /\/shop\/plum</);
  assert.match(xml, /\/shop\/gone</); // sold out, page stays up
  assert.doesNotMatch(xml, /\/shop\/draft</);
  assert.doesNotMatch(xml, /\/shop\/monogram</);
});

// --- thank-you page and owner email ---

const { handler: orderHandler } = await import("../netlify/functions/order.js");
const paidSession = {
  id: "cs_test_abc123",
  payment_status: "paid",
  currency: "usd",
  amount_total: 20000,
  customer_details: { email: "buyer@example.com", name: "Test Buyer" },
  // Stripe's current API: the address lives under collected_information.
  collected_information: { shipping_details: { name: "Test Buyer", address: { line1: "123 Test Street", city: "Indianapolis", state: "IN", postal_code: "46201" } } },
  metadata: { item_1: "gv1 x1 | Snap: Double Snap" },
  line_items: { data: [{ description: "GV1", quantity: 1, amount_total: 6500, price: { product: { description: "Snap: Double Snap · Initials: EY" } } }] },
};

test("the order summary reads the shipping address and shows names with choices", async () => {
  stubStripe({ "GET /checkout/sessions/cs_test_abc123": paidSession });
  const res = await orderHandler({ queryStringParameters: { session_id: "cs_test_abc123" } });
  const o = JSON.parse(res.body);
  assert.equal(o.paid, true);
  assert.deepEqual(o.shipTo, { name: "Test Buyer", lines: ["123 Test Street", "Indianapolis IN 46201"] });
  assert.deepEqual(o.details, ["GV1 — Snap: Double Snap · Initials: EY"]);
});

test("the owner email carries the shipping address and the oversold line", async () => {
  process.env.RESEND_API_KEY = "re_stub";
  process.env.ORDER_EMAIL_FROM = "shop@example.com";
  const sent = [];
  try {
    const evt = { ...paidSession, metadata: { item_1: "plum x1 | " } };
    stubStripe({ "GET /checkout/sessions/cs_1": { ...evt, id: "cs_1", metadata: { ...evt.metadata, oversold: "plum x1 (only 0 was in stock)", inventory_applied: "true" } } });
    const base = globalThis.fetch;
    globalThis.fetch = async (u, init) => {
      if (String(u).includes("api.resend.com")) { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}) }; }
      return base(u, init);
    };
    await webhook(signed({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } }));
  } finally {
    delete process.env.RESEND_API_KEY;
    delete process.env.ORDER_EMAIL_FROM;
  }
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /^OVERSOLD /);
  assert.match(sent[0].text, /OVERSOLD, refund or remake: plum x1/);
  assert.match(sent[0].text, /123 Test Street/);
  assert.match(sent[0].text, /Indianapolis IN 46201/);
});
