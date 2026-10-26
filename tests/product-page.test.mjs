// Node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { shape } from "../netlify/lib/catalog.js";
import { productHtml, shipLine, specRows, leatherNote, reviewsFor, CARE } from "../shop/product-html.js";

const make = (metadata) =>
  shape({ id: "p", lookup_key: "x", unit_amount: 9500, currency: "usd", product: { id: "x", name: "Thing", active: true, description: "d", images: [], metadata } });

test("the policy line gives each kind of piece its ship time and return rule", () => {
  assert.equal(shipLine(false), "Free shipping (US). Ships in 1\u20132 weeks. Delivery takes 5\u20137 days in the lower 48. Made for you, so final sale unless it arrives defective or damaged.");
  assert.match(shipLine(true), /14-day returns if undamaged and without initials/);
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

test("wallet pages show a closed size by model, care on everything, and a leather note where one is known", () => {
  const cygnet = { ...shape({ id: "p", lookup_key: "c", unit_amount: 14500, currency: "usd", product: { id: "c", name: "CygnetV2 in Newbury Balmoral - Navy", active: true, description: "", images: [], metadata: { type: "wallet", leather: "Newbury Balmoral" } } }) };
  assert.deepEqual(specRows(cygnet), [["Closed size", "4.25 x 3.25 in"], ["Care", CARE]]);
  assert.match(leatherNote(cygnet), /Newbury Balmoral is dual-tanned/);
  const gv1 = shape({ id: "p", lookup_key: "g", unit_amount: 6500, currency: "usd", product: { id: "g", name: "GV1 in Horween Cypress - Minimalist Wallet", active: true, description: "", images: [], metadata: { type: "wallet", leather: "Horween Cypress" } } });
  assert.deepEqual(specRows(gv1), [["Care", CARE]]); // no size for GV1 yet
  assert.match(leatherNote(gv1), /^Horween Cypress in Chestnut is a limited run/);
  const threaded = shape({ id: "p", lookup_key: "t", unit_amount: 1, currency: "usd", product: { id: "t", name: "CygnetV2 in X", active: true, description: "", images: [], metadata: { type: "wallet", thread: "Ritza Tiger" } } });
  assert.ok(!specRows(threaded).some(([k]) => k === "Thread"), "no thread row");
  const own = shape({ id: "p", lookup_key: "s", unit_amount: 1, currency: "usd", product: { id: "s", name: "SparrowV2 in X", active: true, description: "", images: [], metadata: { type: "wallet", size: "4.1 x 3.2 in", leather_note: "Own note." } } });
  assert.deepEqual(specRows(own)[0], ["Closed size", "4.1 x 3.2 in"]);
  assert.equal(leatherNote(own), "Own note.");
});

test("product pages show up to two verbatim reviews picked by the piece, and the Etsy link", () => {
  const horweenMto = shape({ id: "p", lookup_key: "h", unit_amount: 1, currency: "usd", product: { id: "h", name: "SiahV2", active: true, description: "", images: [], metadata: { type: "wallet", section: "made", leather: "Horween Cavalier" } } });
  assert.deepEqual(reviewsFor(horweenMto).map((r) => r.name + r.date), ["S.Apr 22, 2026", "J.Jan 4, 2025"]);
  const belt = shape({ id: "p", lookup_key: "b", unit_amount: 1, currency: "usd", product: { id: "b", name: "Belt", active: true, description: "", images: [], metadata: { type: "belt", section: "made" } } });
  assert.equal(reviewsFor(belt).length, 2);
  assert.match(productHtml(belt, {}), /Read all reviews on Etsy/);
});

test("each leather family has its owner-approved note", () => {
  const note = (leather) => leatherNote({ leather, leatherNote: "" });
  assert.match(note("Marbled Shell Cordovan"), /^Shell cordovan comes from a dense layer of horse hide/);
  assert.match(note("Inverse Marbled Shell Cordovan"), /^Shell cordovan comes from/);
  assert.match(note("Horween Chromexcel No.3 Dark Navy"), /^Horween Chromexcel is a combination-tanned leather/);
  assert.match(note("Newbury Latigo, Burgundy"), /^Newbury Latigo is a tough, supple leather/);
  assert.match(note("Horween Chromexcel Cavalier"), /sub-class of Horween's signature CXL/); // Sparrow stays Cavalier
});
