// Head tags for the server-rendered shop pages: title, description, canonical, social cards
// and, on product pages, Product + Offer structured data.
export const SITE = "https://traderspointleather.com";
export const SUFFIX = "Handmade in Indiana | Traders Point Leather";

const attr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const text = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
// A search-result length description from free text: one line, cut at a word near 155 characters.
export function summary(s, max = 155) {
  const one = String(s ?? "").replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "\u2026";
}

// The section pages under /shop, keyed by the path after /shop/ ("" is /shop itself).
export const SECTIONS = {
  "": { title: "Shop", description: "Handmade leather wallets, belts and dog collars from Traders Point Leather in Indiana. Ready to Ship pieces, Made to Order builds, and belts cut to your length." },
  "ready-to-ship": { title: "Ready to Ship", description: "Finished handmade leather wallets that leave the shop in 1\u20133 business days. Free US shipping from Traders Point Leather in Indiana." },
  "made-to-order": { title: "Made to Order", description: "Handmade leather wallets built for you after you order and shipped in 1\u20132 weeks. Horween, Newbury and shell cordovan, saddle-stitched by hand in Indiana." },
  belts: { title: "Belts and Dog Collars", description: "Full-grain leather belts and dog collars made to your length or size in Indiana, shipped in 1\u20132 weeks. Free US shipping." },
};

// Replaces the shell's title and description and adds the rest before </head>.
export function withHead(shell, { title, description, path, image, jsonLd }) {
  const url = `${SITE}${path}`;
  const tags = [
    `<link rel="canonical" href="${attr(url)}">`,
    `<meta property="og:type" content="${jsonLd ? "product" : "website"}">`,
    `<meta property="og:site_name" content="Traders Point Leather">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    image ? `<meta property="og:image" content="${attr(image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    // "<" is escaped so text from Stripe can never close the script tag.
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : "",
  ].filter(Boolean).join("\n");
  return shell
    .replace(/<title>[^<]*<\/title>/, () => `<title>${text(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${attr(description)}">`)
    .replace("</head>", () => `${tags}\n</head>`);
}

// Made to Order is always available to order; a Ready to Ship piece is in stock until it sells.
export function productJsonLd(p, { description, images }) {
  const url = `${SITE}/shop/${p.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description,
    sku: p.slug,
    ...(images.length ? { image: images } : {}),
    brand: { "@type": "Brand", name: "Traders Point Leather" },
    ...(p.leather ? { material: p.leather } : {}),
    offers: {
      "@type": "Offer",
      url,
      price: (p.amount / 100).toFixed(2),
      priceCurrency: p.currency.toUpperCase(),
      availability: p.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Traders Point Leather" },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "USD" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      },
    },
  };
}
