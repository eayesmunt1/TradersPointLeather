import { loadCatalog } from "../lib/catalog.js";
import { productHtml } from "../../shop/product-html.js";
import { SECTIONS, SITE, SUFFIX, productJsonLd, summary, withHead } from "../lib/seo.js";

const SLOT = /<div id="product"[^>]*>[\s\S]*?<\/div>/;
const html = (statusCode, body, drafts = false) => ({
  statusCode,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": drafts ? "no-store" : "public, max-age=30" },
  body,
});
// A draft preview is never indexed, whatever the shell says.
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';
const withDraftTag = (page, drafts) => (drafts && !page.includes(NOINDEX) ? page.replace("</head>", `${NOINDEX}</head>`) : page);

// Serves its three section pages and /shop/<slug>: the product page rendered into the
// shell, or a real 404 for anything not in the catalog. A sold-out Ready to Ship piece keeps its page.
export async function handler(event) {
  const url = new URL(event.rawUrl);
  const drafts = url.searchParams.get("drafts") === "1";
  const slug = decodeURIComponent(url.pathname.replace(/^\/shop\/?/, "").replace(/\/$/, ""));

  // A section page: the listing shell with its own title, description and canonical. shop.js fills the grid.
  if (Object.hasOwn(SECTIONS, slug)) {
    const s = SECTIONS[slug];
    const shell = await fetch(`${url.origin}/shop/index.html`).then((r) => r.text());
    const page = withHead(shell, { title: `${s.title} \u2014 ${SUFFIX}`, description: s.description, path: `/shop/${slug}` });
    return html(200, withDraftTag(page, drafts), drafts);
  }

  const [shell, manifest, catalog] = await Promise.all([
    fetch(`${url.origin}/shop/product.html`).then((r) => r.text()),
    fetch(`${url.origin}/img/manifest.json`).then((r) => r.json()).catch(() => ({})),
    loadCatalog({ drafts }).catch(() => null),
  ]);
  const p = catalog?.get(slug);
  const listed = p && slug !== "monogram";

  if (!catalog) return html(502, shell.replace(SLOT, () => `<div id="product"><h1>Unavailable</h1><p class="lede">The shop is unavailable right now. Please try again shortly.</p></div>`));
  if (!listed) {
    return html(
      404,
      shell
        .replace("<title>Product — Traders Point Leather</title>", "<title>Not found — Traders Point Leather</title>")
        .replace("</head>", `${NOINDEX}</head>`)
        .replace(SLOT, () => `<div id="product" data-missing><h1>Not available</h1><p class="lede">This piece is no longer listed.</p><a href="/shop/ready-to-ship">Back to the shop</a></div>`)
    );
  }
  const photos = manifest[slug] || p.images.map((src) => ({ src }));
  const body = productHtml(p, { photos, monogram: catalog.get("monogram") });
  // The same photos the page shows: a pre-built color shows that color's photos when there are any.
  const shown = p.build.color && photos.some((ph) => ph.color === p.build.color) ? photos.filter((ph) => ph.color === p.build.color) : photos;
  const images = shown.slice(0, 3).map((ph) => (/^https?:/.test(ph.src) ? ph.src : `${SITE}${ph.src}`));
  const description = summary(p.description || `Handmade ${p.name}, made one at a time in Traders Point, Indiana.`);
  const page = withHead(shell, {
    title: `${p.name} \u2014 ${SUFFIX}`,
    description,
    path: `/shop/${p.slug}`,
    image: images[0],
    jsonLd: productJsonLd(p, { description: p.description || description, images }),
  }).replace(SLOT, () => `<div id="product" data-ssr>${body}</div>`);
  return html(200, withDraftTag(page, drafts), drafts);
}
