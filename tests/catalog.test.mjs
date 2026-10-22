// Run with: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { shape, maxQty } from "../netlify/lib/catalog.js";

const price = (metadata, extra = {}) => ({
  id: "price_1",
  lookup_key: "demo",
  unit_amount: 14500,
  currency: "usd",
  product: { id: "prod_1", name: "Demo", active: true, metadata, images: [], ...extra },
});

test("section defaults to made and drives readyToShip", () => {
  assert.equal(shape(price({})).section, "made");
  assert.equal(shape(price({ section: "bogus" })).section, "made");
  assert.equal(shape(price({ section: "ready" })).readyToShip, true);
  assert.equal(shape(price({ section: "made" })).readyToShip, false);
  // The retired field no longer changes anything.
  assert.equal(shape(price({ section: "made", ready_to_ship: "true" })).readyToShip, false);
});

test("every options_<name> key becomes a choice list", () => {
  const p = shape(price({ options_stash: "Without|With", options_snaps: "One snap|Two snaps", options_color: "Red|Whiskey" }));
  assert.deepEqual(p.options.stash, ["Without", "With"]);
  assert.deepEqual(p.options.snaps, ["One snap", "Two snaps"]);
  assert.deepEqual(p.options.color, ["Red", "Whiskey"]);
  assert.deepEqual(p.options.thread, []);
});

test("stock, sold out and quantity caps", () => {
  const ready2 = shape(price({ section: "ready", stock: "2" }));
  assert.equal(ready2.stock, 2);
  assert.equal(ready2.soldOut, false);
  assert.equal(maxQty(ready2), 2);

  const gone = shape(price({ section: "ready", stock: "0" }));
  assert.equal(gone.soldOut, true);
  assert.equal(maxQty(gone), 0);

  assert.equal(maxQty(shape(price({ section: "made" }))), 1);
  assert.equal(maxQty(shape(price({ section: "made", stock: "5" }))), 1);
});

test("build holds the pre-built color and thread", () => {
  const p = shape(price({ section: "made", build_color: "Whiskey", build_thread: "Cream" }));
  assert.deepEqual(p.build, { color: "Whiskey", thread: "Cream" });
  assert.deepEqual(shape(price({})).build, { color: "", thread: "" });
});

test("needs_review is carried through for the loader to filter", () => {
  assert.equal(shape(price({ needs_review: "draft_description" })).needsReview, true);
  assert.equal(shape(price({})).needsReview, false);
});
