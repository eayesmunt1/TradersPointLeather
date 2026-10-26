// One template for a product page, used by the server (netlify/functions/shop-page.js)
// so the page works without JavaScript, and by shop.js when it has to render in the browser.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (cents) => "$" + (cents / 100).toFixed(2).replace(/\.00$/, "");
export const CONTACT = "customer-support@traderspointleather.com";
// What a sold Ready to Ship piece asks the owner for. Crisp sends it as the first chat message;
// without Crisp the button is a mailto link carrying the same text.
export const mtoMessage = (p) => `I'd like a ${p.name} built to order. It shows as sold.`;
// Ready to Ship pieces (section=ready in Stripe) ship in 1-3 business days; Made to Order in 1-2 weeks.
export const shipLine = (ready) =>
  "Free shipping (US). " +
  (ready ? "Ships in 1\u20133 business days." : "Ships in 1\u20132 weeks.") +
  (ready ? " Delivery takes 5\u20137 days in the lower 48. 14-day returns if undamaged and without initials; buyer pays return shipping." : " Delivery takes 5\u20137 days in the lower 48. Made for you, so final sale unless it arrives defective or damaged.");

function select(id, label, list) {
  return `<div class="field"><label for="${id}">${esc(label)}</label>
    <select id="${id}" name="${id.replace("opt-", "")}" required><option value="">Choose…</option>${list
      .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
      .join("")}</select></div>`;
}

// photos: [{src, color?}]. monogram: {amount} or null.
export function productHtml(p, { photos: allPhotos = [], monogram = null } = {}) {
  const cap = p.section === "made" ? 1 : p.soldOut ? 0 : p.stock !== null ? Math.min(p.stock, 10) : p.oneOfAKind ? 1 : 10;
  // A page with a pre-built color shows that color's photos when there are any.
  const photos = p.build.color && allPhotos.some((ph) => ph.color === p.build.color) ? allPhotos.filter((ph) => ph.color === p.build.color) : allPhotos;
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
          `<button type="button" aria-label="Show photo ${i + 1}" aria-current="${i === 0}" data-color="${esc(ph.color || "")}"><img src="${esc(ph.src)}" alt="" loading="lazy" width="72" height="72"></button>`
      )
      .join("")}</div>
    <div class="dots">${photos.map((ph, i) => `<button type="button" aria-label="Show photo ${i + 1}" aria-current="${i === 0}" data-color="${esc(ph.color || "")}"></button>`).join("")}</div>` : ""}
  </div>`;
  const ready = p.section === "ready";
  // Its own category page: belts have one, and so do Ready to Ship and Made to Order.
  const [catHref, catName] = p.type === "belt" || p.type === "collar" ? ["/shop/belts", "Belts and Dog Collars"] : ready ? ["/shop/ready-to-ship", "Ready to Ship"] : ["/shop/made-to-order", "Made to Order"];
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/shop">\u2190 Shop</a> <span aria-hidden="true">/</span> <a href="${catHref}">${catName}</a></nav>`;
  const fields = [
    ...Object.keys(p.options)
      .filter((k) => p.options[k].length)
      .map((k) => select(`opt-${k}`, k[0].toUpperCase() + k.slice(1), p.options[k])),
    p.sizeInput
      ? `<div class="field"><label for="opt-sizeText">${esc(p.sizeInput.label)}</label><input id="opt-sizeText" name="sizeText" type="text" required maxlength="${p.sizeInput.max || 20}" autocomplete="off"></div>`
      : "",
    p.monogram && monogram
      ? `<div class="field"><label for="initials">Initials (optional, +${money(monogram.amount)})</label><input id="initials" name="initials" type="text" maxlength="4" pattern="[A-Za-z]{1,4}" autocomplete="off"><p class="hint">Up to 4 letters.</p></div>`
      : "",
    cap > 1
      ? `<div class="field"><label for="qty">Quantity</label><select id="qty" name="qty">${Array.from({ length: cap }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></div>`
      : `<input type="hidden" name="qty" value="1">`,
  ].join("");
  return `${crumbs}<div class="product">
  ${gallery}
  <div class="product-info">
    <h1>${esc(p.name)}</h1>
    ${[p.build.color && `Color: ${p.build.color}`, p.build.thread && `Thread: ${p.build.thread}`].filter(Boolean).length ? `<p class="leather">${esc([p.build.color && `Color: ${p.build.color}`, p.build.thread && `Thread: ${p.build.thread}`].filter(Boolean).join(" \u00b7 "))}</p>` : ""}
    <div class="price">${money(p.amount)}</div>
    ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
    ${(p.details || []).length ? `<dl class="specs">${p.details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
    ${p.needsReview ? `<p class="notice">Draft preview: this piece is not visible to the public yet.</p>` : ""}
    ${
      p.soldOut
        ? `<p class="notice">Sold. We can make another one for you.</p>
    <a class="btn" id="mto-request" href="mailto:${CONTACT}?subject=${encodeURIComponent("Made to Order: " + p.name)}&body=${encodeURIComponent(mtoMessage(p))}" data-message="${esc(mtoMessage(p))}">Request MTO build</a>`
        : `${ready ? `<p class="notice">Ready to ship${p.stock > 1 ? `. Only ${p.stock} left` : ""}.</p>` : `<p class="notice">Built for you after you order.</p>`}
    <form id="add-form" method="post" action="/api/checkout">
      <input type="hidden" name="slug" value="${esc(p.slug)}">
      ${fields}
      <button type="submit" class="btn">Add to cart</button>
      <p class="error" role="alert"></p>
    </form>
    <noscript><p class="hint">Without JavaScript this button goes straight to checkout for this item.</p></noscript>`
    }
    ${ready || p.type !== "wallet" ? "" : `<p class="hint">Want something different? <a href="/design">Open the designer</a>.</p>`}
    <p class="terms">${esc(shipLine(ready))}</p>
  </div>
</div>`;
}
