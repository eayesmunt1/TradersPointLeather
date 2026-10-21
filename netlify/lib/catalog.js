import { stripe } from "./stripe.js";

const split = (v) => (v ? v.split("|").map((s) => s.trim()).filter(Boolean) : []);

// One entry per active Price. The Price's lookup_key is the product slug.
function shape(price) {
  const p = price.product;
  const m = p.metadata || {};
  const slug = price.lookup_key || m.slug;
  return {
    slug,
    priceId: price.id,
    productId: p.id,
    name: p.name,
    description: p.description || "",
    amount: price.unit_amount,
    currency: price.currency,
    images: p.images || [],
    type: m.type || "",
    leather: m.leather || "",
    etsyListing: m.etsy_listing || "",
    oneOfAKind: m.one_of_a_kind === "true",
    stock: m.stock ? Number(m.stock) : null,
    monogram: m.monogram === "true",
    options: {
      color: split(m.options_color),
      thread: split(m.options_thread),
      size: split(m.options_size),
    },
    sizeInput: m.size_input === "text" ? { label: m.size_label || "Size" } : null,
    needsReview: Boolean(m.needs_review),
  };
}

// Active products with an active price, keyed by slug.
export async function loadCatalog() {
  const res = await stripe("GET", "/prices", {
    active: true,
    limit: 100,
    expand: ["data.product"],
  });
  const map = new Map();
  for (const price of res.data) {
    if (!price.product || price.product.deleted || !price.product.active) continue;
    const entry = shape(price);
    if (entry.slug) map.set(entry.slug, entry);
  }
  return map;
}

export const MAX_QTY = 10;
export const maxQty = (item) => (item.oneOfAKind ? 1 : item.stock ? Math.min(item.stock, MAX_QTY) : MAX_QTY);
