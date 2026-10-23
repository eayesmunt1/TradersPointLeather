// Node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { shape } from "../netlify/lib/catalog.js";
import { productHtml, shipLine } from "../shop/product-html.js";

const make = (metadata) =>
  shape({ id: "p", lookup_key: "x", unit_amount: 9500, currency: "usd", product: { id: "x", name: "Thing", active: true, description: "d", images: [], metadata } });

test("the policy line reads the same way for both kinds of piece", () => {
  assert.equal(shipLine(false), "Free shipping (US). Ships in 1\u20132 weeks. Delivery takes 5\u20137 days in the lower 48. 14-day returns if undamaged. Buyer pays return shipping.");
  assert.match(shipLine(true), /^Free shipping \(US\)\. Ships in 1\u20133 business days\. Delivery takes 5\u20137 days in the lower 48\./);
});

test("the initials field is labelled Initials", () => {
  const html = productHtml(make({ section: "made", type: "wallet", monogram: "true" }), { monogram: { amount: 1000 } });
  assert.match(html, /Initials \(optional, \+\$10\)/);
  assert.doesNotMatch(html, /Monogram initials/);
});

test("only wallets offer the designer", () => {
  for (const type of ["belt", "collar"]) assert.doesNotMatch(productHtml(make({ section: "made", type }), {}), /Open the designer/);
  assert.match(productHtml(make({ section: "made", type: "wallet" }), {}), /Open the designer/);
  assert.doesNotMatch(productHtml(make({ section: "ready", type: "wallet" }), {}), /Open the designer/);
});

test("a blank spec value never makes a row", () => {
  const html = productHtml(make({ section: "made", type: "belt", hardware: "Brass buckle", capacity: "  ", size: "", features: "" }), {});
  assert.match(html, /<dt>Hardware<\/dt>/);
  assert.doesNotMatch(html, /<dt>(Capacity|Size|Features|Thread)<\/dt>/);
});
