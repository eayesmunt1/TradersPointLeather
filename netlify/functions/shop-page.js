import { loadCatalog } from "../lib/catalog.js";
import { productHtml } from "../../shop/product-html.js";

const SLOT = /<div id="product"[^>]*>[\s\S]*?<\/div>/;
const html = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" },
  body,
});

// Serves /shop/<slug>: the product page rendered into the shell, or a real 404 for
// anything not in the catalog. Both keep the shell's noindex tag.
export async function handler(event) {
  const url = new URL(event.rawUrl);
  const slug = decodeURIComponent(url.pathname.replace(/^\/shop\//, "").replace(/\/$/, ""));
  const [shell, config, manifest, catalog] = await Promise.all([
    fetch(`${url.origin}/shop/product.html`).then((r) => r.text()),
    fetch(`${url.origin}/shop-config.js`).then((r) => r.text()).catch(() => ""),
    fetch(`${url.origin}/img/manifest.json`).then((r) => r.json()).catch(() => ({})),
    loadCatalog().catch(() => null),
  ]);
  const isPublic = /SHOP_PUBLIC\s*=\s*true/.test(config);
  const p = catalog?.get(slug);
  const listed = p && slug !== "monogram" && !(isPublic && p.needsReview);

  if (!catalog) return html(502, shell.replace(SLOT, () => `<div id="product"><h1>Unavailable</h1><p class="lede">The shop is unavailable right now. Please try again shortly.</p></div>`));
  if (!listed) {
    return html(
      404,
      shell
        .replace("<title>Product — Traders Point Leather</title>", "<title>Not found — Traders Point Leather</title>")
        .replace(SLOT, () => `<div id="product" data-missing><h1>Not available</h1><p class="lede">This piece is sold out or no longer listed.</p><a href="/shop">Back to the shop</a></div>`)
    );
  }
  const photos = manifest[slug] || p.images.map((src) => ({ src }));
  const body = productHtml(p, { photos, monogram: catalog.get("monogram") });
  return html(
    200,
    shell
      .replace("<title>Product — Traders Point Leather</title>", `<title>${p.name.replace(/</g, "")} — Traders Point Leather</title>`)
      .replace(SLOT, () => `<div id="product" data-ssr>${body}</div>`)
  );
}
