import { stripe } from "./stripe.js";

const split = (v) => (v ? v.split("|").map((s) => s.trim()).filter(Boolean) : []);

// A product's `section` metadata decides where it is listed and how fast it ships:
// "ready" is a finished piece (1-3 business days), "made" is built after the order (1-2 weeks).
const SECTIONS = ["ready", "made"];

// Made to Order pages are pre-built, so only these options_<name> keys are choices the
// buyer makes (pipe-separated). Any other options_* key left in Stripe is ignored;
// customising leather, color, thread and stash pockets happens in the wallet designer.
const CHOICES = ["snap"];

function optionLists(m) {
  const lists = { color: [], thread: [], size: [] };
  for (const name of CHOICES) lists[name] = split(m[`options_${name}`]);
  return lists;
}

// One entry per active Price. The Price's lookup_key is the product slug.
export function shape(price) {
  const p = price.product;
  const m = p.metadata || {};
  const slug = price.lookup_key || m.slug;
  const section = SECTIONS.includes(m.section) ? m.section : "made";
  const stock = m.stock !== undefined && m.stock !== "" ? Number(m.stock) : null;
  return {
    slug,
    priceId: price.id,
    productId: p.id,
    // Every piece is made to order by default, so the phrase adds nothing to a name.
    name: p.name
      .replace(/\s*\(\s*made[\s-]to[\s-]order\s*\)/i, "")
      .replace(/[\s,\-–—]*\bmade[\s-]to[\s-]order\b/i, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s,\-–—]+$/, "")
      .trim(),
    description: p.description || "",
    amount: price.unit_amount,
    currency: price.currency,
    images: p.images || [],
    type: m.type || "",
    // Spec lines shown on the product page; many products have these but no description.
    details: [
      ["Capacity", m.capacity],
      ["Size", m.size],
      ["Thread", m.thread],
      ["Hardware", m.hardware],
      ["Features", m.features],
    ].filter(([, v]) => v),
    leather: m.leather || "",
    etsyListing: m.etsy_listing || "",
    oneOfAKind: m.one_of_a_kind === "true",
    section,
    readyToShip: section === "ready",
    stock,
    // A Ready to Ship piece with no stock left stays listed, but cannot be bought.
    soldOut: section === "ready" && stock !== null && stock <= 0,
    monogram: m.monogram === "true",
    options: optionLists(m),
    // The one pre-built version a Made to Order page sells, set by the owner.
    build: { color: m.build_color || "", thread: m.build_thread || "" },
    // Free-text size (belt length, collar size): the collar takes a breed size or neck inches.
    sizeInput: m.size_input === "text" ? { label: m.size_label || "Size", max: m.type === "collar" ? 30 : 20 } : null,
    needsReview: Boolean(m.needs_review),
  };
}

// Active products with an active price, keyed by slug. Products flagged needs_review
// are left out unless `drafts` is set, so an unapproved listing is never sold.
export async function loadCatalog({ drafts = false } = {}) {
  const res = await stripe("GET", "/prices", {
    active: true,
    limit: 100,
    expand: ["data.product"],
  });
  const map = new Map();
  for (const price of res.data) {
    if (!price.product || price.product.deleted || !price.product.active) continue;
    const entry = shape(price);
    if (entry.needsReview && !drafts) continue;
    if (entry.slug) map.set(entry.slug, entry);
  }
  return map;
}

export const MAX_QTY = 10;
// Made to Order is one per line; a Ready to Ship piece is capped at its stock.
export const maxQty = (item) =>
  item.section === "made" ? 1 : item.soldOut ? 0 : item.stock !== null ? Math.min(item.stock, MAX_QTY) : item.oneOfAKind ? 1 : MAX_QTY;
