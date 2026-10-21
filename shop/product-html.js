// One template for a product page, used by the server (netlify/functions/shop-page.js)
// so the page works without JavaScript, and by shop.js when it has to render in the browser.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (cents) => "$" + (cents / 100).toFixed(2).replace(/\.00$/, "");
export const TYPES = { wallet: "Wallets", belt: "Belts", collar: "Collars" };
export const RETURNS =
  "Free shipping (US) · Ships in 1–3 business days, arrives in 5–7 days in the lower 48 · 30-day returns if undamaged (buyer pays return shipping)";

function select(id, label, list) {
  return `<div class="field"><label for="${id}">${esc(label)}</label>
    <select id="${id}" name="${id.replace("opt-", "")}" required><option value="">Choose…</option>${list
      .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
      .join("")}</select></div>`;
}

// photos: [{src, color?}]. monogram: {amount} or null.
export function productHtml(p, { photos = [], monogram = null } = {}) {
  const cap = p.oneOfAKind ? 1 : p.stock ? Math.min(p.stock, 10) : 10;
  // Photos are shown whole (mostly 2:3 portrait) in a swipeable strip; thumbnails jump to one.
  const slides = photos.length
    ? photos
        .map(
          (ph, i) =>
            `<figure class="slide" data-color="${esc(ph.color || "")}"><img src="${esc(ph.src)}" alt="${i === 0 ? esc(p.name) : ""}"${i ? ' loading="lazy"' : ""}></figure>`
        )
        .join("")
    : `<figure class="slide empty"><span>Photos coming soon</span></figure>`;
  const many = photos.length > 1;
  const gallery = `<div class="gallery">
    <div class="slides" tabindex="0" role="group" aria-label="Photos of ${esc(p.name)}">${slides}</div>
    ${many ? `<div class="gallery-nav"><button type="button" class="prev" aria-label="Previous photo">\u2039</button><span class="count" aria-live="polite">1 / ${photos.length}</span><button type="button" class="next" aria-label="Next photo">\u203a</button></div>
    <div class="thumbs">${photos
      .map(
        (ph, i) =>
          `<button type="button" aria-label="Show photo ${i + 1}" aria-current="${i === 0}" data-color="${esc(ph.color || "")}"><img src="${esc(ph.src)}" alt="" loading="lazy" width="64" height="96"></button>`
      )
      .join("")}</div>` : ""}
  </div>`;
  const section = TYPES[p.type];
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/shop">\u2190 All products</a>${
    section ? ` <span aria-hidden="true">/</span> <a href="/shop?type=${esc(p.type)}">${section}</a>` : ""
  }</nav>`;
  const fields = [
    ...["color", "thread", "size"]
      .filter((k) => p.options[k].length)
      .map((k) => select(`opt-${k}`, k[0].toUpperCase() + k.slice(1), p.options[k])),
    p.sizeInput
      ? `<div class="field"><label for="opt-sizeText">${esc(p.sizeInput.label)}</label><input id="opt-sizeText" name="sizeText" type="text" required maxlength="20" autocomplete="off"></div>`
      : "",
    p.monogram && monogram
      ? `<div class="field"><label for="initials">Monogram initials (optional, +${money(monogram.amount)})</label><input id="initials" name="initials" type="text" maxlength="4" pattern="[A-Za-z]{1,4}" autocomplete="off"><p class="hint">Up to 4 letters.</p></div>`
      : "",
    cap > 1
      ? `<div class="field"><label for="qty">Quantity</label><select id="qty" name="qty">${Array.from({ length: cap }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></div>`
      : `<input type="hidden" name="qty" value="1">`,
  ].join("");
  return `${crumbs}<div class="product">
  ${gallery}
  <div class="product-info">
    <h1>${esc(p.name)}</h1>
    ${p.leather ? `<p class="leather">${esc(p.leather)}</p>` : ""}
    <div class="price">${money(p.amount)}</div>
    <p class="desc">${esc(p.description)}</p>
    ${p.oneOfAKind ? `<p class="notice">One of a kind: once it is sold, it is gone.</p>` : ""}
    <form id="add-form" method="post" action="/api/checkout">
      <input type="hidden" name="slug" value="${esc(p.slug)}">
      ${fields}
      <button type="submit" class="btn">Add to cart</button>
      <p class="error" role="alert"></p>
    </form>
    <noscript><p class="hint">Without JavaScript this button goes straight to checkout for this item.</p></noscript>
    <p class="terms">${esc(RETURNS)}</p>
  </div>
</div>`;
}
