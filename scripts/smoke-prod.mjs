// Read-only check of a deployed site, run right after a deploy. Changes nothing anywhere: GET requests,
// plus one unsigned POST to the webhook, which a configured webhook refuses with 400.
//   node scripts/smoke-prod.mjs                       # https://traderspointleather.com
//   BASE_URL=https://<deploy-preview>.netlify.app node scripts/smoke-prod.mjs
const BASE = (process.env.BASE_URL || "https://traderspointleather.com").replace(/\/$/, "");
let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!pass) failed++;
};
const get = (path, init) => fetch(`${BASE}${path}`, { redirect: "manual", ...init });

// Pages
for (const path of ["/", "/shop", "/shop/ready-to-ship", "/shop/made-to-order", "/shop/belts", "/design.html", "/cart", "/shipping", "/returns", "/privacy", "/terms"]) {
  const r = await get(path);
  ok(`GET ${path}`, r.status === 200, String(r.status));
}

// Catalog: the functions are deployed and Stripe answers with the live catalog.
const cat = await get("/api/catalog");
let products = [];
try { products = (await cat.json()).products || []; } catch {}
ok("GET /api/catalog", cat.status === 200 && products.length > 0, `${cat.status}, ${products.length} products`);
const body = cat.status === 200 ? products : [];
ok("catalog has Ready to Ship pieces", body.some((p) => p.section === "ready"));
ok("catalog has Made to Order pieces", body.some((p) => p.section === "made"));

// Every product page renders from the server with its own title and Product data.
for (const p of body) {
  const r = await get(`/shop/${p.slug}`);
  const html = r.status === 200 ? await r.text() : "";
  ok(`GET /shop/${p.slug}`, r.status === 200 && html.includes('"@type":"Product"') && html.includes("data-ssr"), String(r.status));
}
const missing = await get("/shop/this-does-not-exist");
ok("unknown product is a 404", missing.status === 404, String(missing.status));

// Webhook: deployed and holding its secret. Unsigned requests get 400; 503 means STRIPE_WEBHOOK_SECRET is not set.
const hook = await get("/api/stripe-webhook", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
ok("webhook refuses an unsigned request", hook.status === 400, hook.status === 503 ? "503: STRIPE_WEBHOOK_SECRET is not set" : String(hook.status));

// Sitemap, headers, and files that must not be served.
const map = await get("/sitemap.xml");
const xml = map.status === 200 ? await map.text() : "";
ok("sitemap lists the shop", xml.includes("/shop/ready-to-ship"), String(map.status));
const home = await get("/");
ok("security headers", home.headers.get("x-frame-options") === "DENY" && !!home.headers.get("strict-transport-security"));
for (const path of ["/README.md", "/netlify/functions/checkout.js", "/api/listings"]) {
  const r = await get(path);
  ok(`${path} is not served`, r.status === 404, String(r.status));
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
