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

// Closed size by model. A product's `size` in Stripe wins if the owner ever sets one. Siah and GV1 have none yet.
const CLOSED_SIZE = { CygnetV2: "4.25 x 3.25 in", CygnusV2: "4.25 x 3.25 in", SparrowV2: "4 x 3.25 in" };
// Care, as the owner gives it.
export const CARE = "Wipe with a dry cloth. Condition lightly once or twice a year with Ashland Leather conditioner. Keep away from prolonged water and heat.";
// About the leather, kept here by leather family. A product's `leather_note` in Stripe wins if the owner ever sets one.
const LEATHER_NOTES = [
  [/Cavalier/, "Horween Cavalier, a sub-class of Horween's signature CXL, is hot-stuffed over twenty-eight days into a leather with a soft hand and deep, dimensional pull-up. It takes on a patina that is different for every owner. Horween has stopped producing Cavalier, and what remains is limited."],
  // Owner-provided, reworded by the rater (Oct 26).
  [/Cypress/, "Horween Cypress in Chestnut is a limited run in this color. Cypress is a dual-tannage leather Horween developed recently. It has the strength of CXL with more body and rigidity, so it holds its form. It has a fantastic pull-up when folded and creased."],
  // Owner-approved, verbatim (Oct 26).
  [/Shell Cordovan/, "Shell cordovan comes from a dense layer of horse hide found only in the rump. The flesh side is sealed down, so it doesn't wrinkle like most other leathers. It rolls into soft waves as it wears and polishes to a deep, glossy shine."],
  [/Chromexcel/, "Horween Chromexcel is a combination-tanned leather, hot-stuffed with oils and waxes. It's tough and flexible, with a rich pull-up that darkens and develops character as it ages."],
  [/Latigo/, "Newbury Latigo is a tough, supple leather stuffed with oils and waxes. It's one of the strongest leathers for belts and tack, and softens as you wear it."],
  [/Balmoral/, "Tanned on the American East Coast, Newbury Balmoral is dual-tanned to stand beside Horween Cavalier. Its color is struck all the way through the hide, so a burnished edge comes up even and clean. A touch thinner, it lets pockets stack flat without bulk."],
];

// The spec rows: what Stripe holds, a closed size for wallets that have none, and care for everything.
export function specRows(p) {
  // No thread type on any page: the owner is moving every piece to the same thread (Oct 26).
  const rows = (p.details || []).filter(([k]) => k !== "Thread").map(([k, v]) => [k === "Size" && p.type === "wallet" ? "Closed size" : k, v]);
  const model = String(p.name || "").split(" ")[0];
  if (p.type === "wallet" && !rows.some(([k]) => k === "Closed size") && CLOSED_SIZE[model]) rows.splice(1, 0, ["Closed size", CLOSED_SIZE[model]]);
  rows.push(["Care", CARE]);
  return rows;
}
export function leatherNote(p) {
  if (p.leatherNote) return p.leatherNote;
  const hit = LEATHER_NOTES.find(([re]) => re.test(p.leather || ""));
  return hit ? hit[1] : "";
}

// Verbatim Etsy reviews, copied from the review-data block in index.html (keep the two the same).
// Never edit the text. Each page shows up to two, picked by what the piece is.
const REVIEWS = {
  custom: { text: "Absolutely fantastic custom craftsmanship \u2014 it was a pleasure working with the creator. I'd happily buy from again.", name: "J.", date: "Jan 4, 2025" },
  second: { text: "Good quality wallet. The color is amazing. Great size as well. Just got my second one.", name: "J.", date: "Nov 12, 2025" },
  horween: { text: "This is an incredible wallet for the price. The leather quality is excellent, which I'd expect from Horween, but it's very well put together and the design itself is lovely.", name: "S.", date: "Apr 22, 2026" },
  general: { text: "Traders Point Leather makes superior, high-quality leather products \u2014 you will not be disappointed!", name: "T.", date: "Jun 17, 2026" },
};
const ETSY_REVIEWS = "https://www.etsy.com/shop/TradersPointLeather/reviews";
export function reviewsFor(p) {
  const wallet = p.type === "wallet";
  const picks = [
    wallet && /Horween/.test(p.leather || p.name) && "horween",
    p.section === "made" && "custom",
    wallet && "second",
    "general",
  ].filter(Boolean);
  return [...new Set(picks)].slice(0, 2).map((k) => REVIEWS[k]);
}

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
    <dl class="specs">${specRows(p).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    ${leatherNote(p) ? `<p class="leather-note"><strong>${esc(p.leather)}.</strong> ${esc(leatherNote(p))}</p>` : ""}
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
    <section class="product-reviews" aria-label="Reviews">
      <p class="proof-line"><a href="${ETSY_REVIEWS}" target="_blank" rel="noopener">\u2605 Etsy Star Seller \u00b7 4.9 from 34 reviews</a></p>
      ${reviewsFor(p).map((r) => `<blockquote><p>\u201c${esc(r.text)}\u201d</p><footer>${esc(r.name)} \u00b7 ${esc(r.date)}</footer></blockquote>`).join("")}
      <a class="all-reviews" href="${ETSY_REVIEWS}" target="_blank" rel="noopener">Read all reviews on Etsy \u2192</a>
    </section>
  </div>
</div>`;
}
