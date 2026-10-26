// Gives each active product's price the lookup_key the site expects (its metadata.slug).
// The shop also falls back to metadata.slug, so this is for scripts/stripe-setup.mjs, which
// finds products by lookup_key, and for products copied to live mode without one.
//   STRIPE_SECRET_KEY=... node scripts/set-lookup-keys.mjs           # dry run
//   STRIPE_SECRET_KEY=... node scripts/set-lookup-keys.mjs --write   # apply
// The key needs Products read and Prices write.
const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY");
const WRITE = process.argv.includes("--write");
const API = "https://api.stripe.com/v1";
async function stripe(method, path, params = {}) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${API}${path}${method === "GET" && body ? `?${body}` : ""}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "content-type": "application/x-www-form-urlencoded" }) },
    body: method === "GET" ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

const products = (await stripe("GET", "/products", { active: "true", limit: "100" })).data;
const prices = (await stripe("GET", "/prices", { active: "true", limit: "100" })).data;
console.log(`${WRITE ? "WRITE" : "DRY RUN"} (${key.includes("_live_") ? "live" : "test"} mode)\n`);
for (const p of products) {
  const slug = p.metadata?.slug;
  const mine = prices.filter((x) => x.product === p.id);
  if (!slug) { console.log(`SKIP     ${p.name}: no metadata.slug`); continue; }
  if (mine.length !== 1) { console.log(`CHECK    ${slug}: ${mine.length} active prices, set the key by hand`); continue; }
  const price = mine[0];
  if (price.lookup_key === slug) { console.log(`OK       ${slug}`); continue; }
  console.log(`SET      ${slug} on ${price.id}${price.lookup_key ? ` (was ${price.lookup_key})` : ""}`);
  if (WRITE) await stripe("POST", `/prices/${price.id}`, { lookup_key: slug, transfer_lookup_key: "true" });
}
