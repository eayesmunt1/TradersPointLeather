// Brings the Stripe catalog into the shape the shop expects. Dry run by default:
// it prints every change it would make and writes nothing.
//
//   STRIPE_KEY=rk_test_... node scripts/stripe-setup.mjs            dry run
//   STRIPE_KEY=rk_test_... node scripts/stripe-setup.mjs --write    apply
//
// A live key is refused unless --live is also given. Without STRIPE_KEY it falls
// back to STRIPE_SECRET_KEY (or STRIPE_READ_KEY) in .env. Writing needs a key with
// write access to Products; a read-only key only works for the dry run.
//
// Products keep their existing Price lookup_key, which is the shop slug. Nothing
// is deleted; the one duplicate Plum product is archived, never removed.
import { readFileSync } from "node:fs";

const API = "https://api.stripe.com/v1";
const args = new Set(process.argv.slice(2));
const WRITE = args.has("--write");
const LIVE = args.has("--live");

function loadKey() {
  if (process.env.STRIPE_KEY) return process.env.STRIPE_KEY;
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const name of ["STRIPE_SECRET_KEY", "STRIPE_READ_KEY"]) {
      const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return "";
}

const key = loadKey();
if (!key) {
  console.error("Set STRIPE_KEY (a test-mode key) or put STRIPE_SECRET_KEY in .env.");
  process.exit(1);
}
if (/_live_/.test(key) && !LIVE) {
  console.error("That is a live key. Pass --live as well if you mean it.");
  process.exit(1);
}

// Descriptions come from the owner's product files, unchanged. Only products whose
// description is empty receive one; an existing description is never overwritten.
const DESCRIPTIONS = {
  // The Cavalier build has no stash pockets (the designer adds them); Newbury always has two.
  cygnetCavalier:
    "Made one at a time in Traders Point, Indiana.\n\nThis traditional bifold has burnished edges and 4 card pockets. It holds 8-12 cards.",
  cygnetNewbury:
    "Made one at a time in Traders Point, Indiana.\n\nThis traditional bifold has burnished edges, 4 card pockets and two stash pockets. It holds 12-16 cards.",
  sparrow:
    "Made one at a time in Traders Point, Indiana.\n\nThis vertical bifold has a cash flap, three interior card pockets, and one exterior card pocket. It holds 9-10 cards.",
};

// The shared Cygnet text this script wrote earlier. A description is replaced only when it is empty or
// still exactly this, so text the owner has edited is never overwritten.
const OLD_CYGNET =
  "Made one at a time in Traders Point, Indiana.\n\nThis traditional bifold has burnished edges and 4 card pockets. It holds 8-12 cards, or 12-16 with the optional two stash pockets.";

// Keyed by Price lookup_key. `meta` is merged into the product's metadata; a value
// of "" removes that key. `stock` applies to Ready to Ship pieces only.
const PLAN = {
  // Ready to Ship
  "cygnet-horween-cavalier-plum": { section: "ready", stock: 2, desc: "cygnetCavalier", meta: { one_of_a_kind: "false" } },
  "cygnet-horween-cavalier-rts": { archive: "duplicate of cygnet-horween-cavalier-plum (the two Plum pieces are one listing, stock 2)" },
  "cygnet-horween-cavalier-sunflower": { section: "ready", stock: 1 },
  "cygnet-newbury-balmoral-navy": { section: "ready", stock: 1, desc: "cygnetNewbury" },
  "sparrow-horween-cavalier-two-tone": { section: "ready", stock: 2, desc: "sparrow" },
  "cygnus-shell-cordovan-marbled": { section: "ready", stock: 1 },
  // Made to Order: one pre-built page each
  "cygnet-horween-cavalier-mto": { section: "made", desc: "cygnetCavalier", meta: { capacity: "8-12 cards, 4 slots, cash pocket" } },
  "cygnet-newbury-balmoral-mto": { section: "made", desc: "cygnetNewbury" },
  "sparrow-horween-cavalier-mto": { section: "made", desc: "sparrow" },
  "sparrow-newbury-balmoral-mto": { section: "made", desc: "sparrow" },
  "jonas-horween-cavalier": { section: "made" },
  "gv1-horween-cypress": { section: "made", meta: { options_snap: "Single Snap|Double Snap", options_thread: "Cream|Havana Brown", choices: "snap|thread" } },
  "siah-horween-cavalier": { section: "made" },
  // Not sold any more: archived, never deleted, so past orders keep their history.
  "belt-hermann-oak": { archive: "no longer sold" },
  "belt-horween-cxl-raven": { section: "made" },
  "belt-newbury-latigo-burgundy": { section: "made" },
  "collar-horween-cxl": { section: "made", meta: { size_input: "text", size_label: "Size", options_size: "" } },
  monogram: {},
};

function encode(value, prefix = "", out = []) {
  if (value === undefined || value === null) return out;
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) encode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  }
  return out;
}

async function stripe(method, path, params) {
  const body = encode(params).join("&");
  const get = method === "GET";
  const res = await fetch(`${API}${path}${get && body ? `?${body}` : ""}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(get ? {} : { "content-type": "application/x-www-form-urlencoded" }) },
    body: get ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

const prices = await stripe("GET", "/prices", { active: true, limit: 100, expand: ["data.product"] });
const byKey = new Map();
for (const price of prices.data) {
  if (price.lookup_key && price.product?.active) byKey.set(price.lookup_key, price.product);
}

console.log(`${WRITE ? "WRITE" : "DRY RUN"}: ${byKey.size} active products with a lookup key\n`);

const updates = []; // { id, label, params }
const report = { unplanned: [], noDescription: [], noBuildColor: [] };

for (const [lookup, plan] of Object.entries(PLAN)) {
  const product = byKey.get(lookup);
  if (!product) {
    console.log(`MISSING  ${lookup}: not in Stripe`);
    continue;
  }
  if (plan.archive) {
    console.log(`ARCHIVE  ${product.name}\n         ${plan.archive}`);
    updates.push({ id: product.id, label: `archive ${lookup}`, params: { active: false } });
    continue;
  }

  const meta = { ...(plan.meta || {}) };
  if (plan.section) meta.section = plan.section;
  if (plan.section === "ready" && plan.stock !== undefined) meta.stock = String(plan.stock);

  const changes = [];
  const params = {};
  const metadata = {};
  for (const [k, v] of Object.entries(meta)) {
    const have = product.metadata?.[k] ?? "";
    if (have !== v) {
      metadata[k] = v;
      changes.push(`metadata.${k}: ${JSON.stringify(have)} -> ${JSON.stringify(v)}`);
    }
  }
  if (Object.keys(metadata).length) params.metadata = metadata;

  const wanted = plan.desc && DESCRIPTIONS[plan.desc];
  if (wanted && product.description !== wanted && (!product.description || product.description === OLD_CYGNET)) {
    params.description = wanted;
    changes.push(`description: ${product.description ? "old shared Cygnet text" : "empty"} -> ${plan.desc} text`);
  }

  console.log(`${changes.length ? "UPDATE " : "ok     "}  ${product.name}  [${lookup}]`);
  for (const c of changes) console.log(`           ${c}`);
  if (changes.length) updates.push({ id: product.id, label: lookup, params });

  if (!product.description && !params.description && lookup !== "monogram") report.noDescription.push(product.name);
  if (plan.section === "made" && !product.metadata?.build_color) report.noBuildColor.push(product.name);
}

for (const [lookup, product] of byKey) {
  if (!(lookup in PLAN)) report.unplanned.push(`${product.name} [${lookup}]`);
}

console.log("\nMissing data report");
const list = (title, items) => {
  console.log(`  ${title}: ${items.length ? "" : "none"}`);
  for (const i of items) console.log(`    - ${i}`);
};
list("Products Stripe has that this script does not know", report.unplanned);
list("Still no description", report.noDescription);
list("Made to Order pages with no build_color (the fixed color the owner picks per page)", report.noBuildColor);
console.log(
  "  Photos still needed: GV1, SiahV2, Dog Collar, Cygnus (shown as 'Photos coming soon').\n" +
    "  Owner text needed: Two-Tone color wording (metadata.colors is 'from photos')."
);

if (!WRITE) {
  console.log(`\nDry run only. ${updates.length} product(s) would change. Re-run with --write to apply.`);
  process.exit(0);
}

console.log(`\nApplying ${updates.length} change(s)...`);
for (const u of updates) {
  await stripe("POST", `/products/${u.id}`, u.params);
  console.log(`  done  ${u.label}`);
}
