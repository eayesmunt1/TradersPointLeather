import { loadCatalog } from "../lib/catalog.js";
import { json } from "../lib/stripe.js";

// Read-only catalog for the shop pages and the cart drawer. Prices come from
// Stripe, never from the browser.
export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "GET only" });
  try {
    const catalog = await loadCatalog();
    const monogram = catalog.get("monogram");
    const products = [...catalog.values()]
      .filter((p) => p.slug !== "monogram")
      .map(({ priceId, productId, ...pub }) => pub);
    return json(
      200,
      { products, monogram: monogram ? { amount: monogram.amount, currency: monogram.currency } : null },
      { "cache-control": "public, max-age=60" }
    );
  } catch (e) {
    return json(502, { error: "Catalog unavailable" });
  }
}
