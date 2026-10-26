import { loadCatalog } from "../lib/catalog.js";

const ORIGIN = "https://traderspointleather.com";
const url = (loc, priority) => `  <url>\n    <loc>${ORIGIN}${loc}</loc>\n    <priority>${priority}</priority>\n  </url>`;

// /sitemap.xml: the pages that are always there, plus the shop and every published product
// once SHOP_PUBLIC is true in shop-config.js. A sold Ready to Ship piece keeps its page, so
// it stays listed. Products flagged needs_review are not in the catalog, so never listed.
export async function handler(event) {
  const origin = process.env.SITE_URL || process.env.URL || new URL(event.rawUrl).origin;
  const config = await fetch(`${origin}/shop-config.js`).then((r) => r.text()).catch(() => "");
  const isPublic = /SHOP_PUBLIC\s*=\s*true/.test(config);

  const urls = [url("/", "1.0"), url("/design.html", "0.8"), ...["shipping", "returns", "privacy", "terms"].map((p) => url(`/${p}`, "0.3"))];
  if (isPublic) {
    urls.push(url("/shop", "0.9"));
    for (const page of ["ready-to-ship", "made-to-order", "belts"]) urls.push(url(`/shop/${page}`, "0.8"));
    const catalog = await loadCatalog().catch(() => new Map());
    for (const slug of [...catalog.keys()].filter((s) => s !== "monogram").sort()) {
      urls.push(url(`/shop/${encodeURIComponent(slug)}`, "0.7"));
    }
  }
  return {
    statusCode: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
  };
}
