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

test("snap and thread are buyer choices; other options_* keys are ignored", () => {
  const p = shape(
    price({ options_snap: "Single Snap|Double Snap", options_thread: "Cream|Havana Brown", options_stash: "Without|With", options_color: "Red|Whiskey", options_stamp: "TP Monogram" })
  );
  assert.deepEqual(p.options.snap, ["Single Snap", "Double Snap"]);
  assert.deepEqual(p.options.thread, ["Cream", "Havana Brown"]);
  assert.deepEqual(p.options.color, []);
  assert.equal(p.options.stash, undefined);
  assert.deepEqual(shape(price({})).options.snap, []);
  assert.deepEqual(shape(price({})).options.thread, []);
});

test("a page that fixes its thread does not ask for one", () => {
  const siah = shape(price({ options_thread: "Cream|Chestnut|Havana Brown", build_thread: "Chestnut" }));
  assert.deepEqual(siah.options.thread, []);
  assert.equal(siah.build.thread, "Chestnut");
});

test("`choices` lists exactly the options a product asks for", () => {
  const only = shape(price({ choices: "snap", options_snap: "A|B", options_thread: "Cream|Havana Brown" }));
  assert.deepEqual(only.options.snap, ["A", "B"]);
  assert.deepEqual(only.options.thread, []);
  // Names are plain lowercase words, so a stray key cannot be asked for.
  assert.deepEqual(shape(price({ choices: "../x|snap", options_snap: "A|B" })).options.snap, ["A", "B"]);
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
