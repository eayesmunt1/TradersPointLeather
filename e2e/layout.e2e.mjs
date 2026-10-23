// Layout checks from the rater's round 1: the home gallery, the hero, the product gallery,
// the phone tabs and the designer page.
//   BASE_URL=http://localhost:8888 node --test e2e/layout.e2e.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8888";
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(path, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  return { page, ctx, errors };
}
const box = (page, sel) => page.$$eval(sel, (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));

test("the home gallery is six square tiles that fill a three-column grid", async () => {
  const { page, ctx } = await open("/", { width: 1280, height: 900 });
  const tiles = await box(page, ".gallery-item");
  assert.equal(tiles.length, 6);
  assert.ok(tiles.every((t) => t.w <= t.h), "a tile is wider than tall");
  const small = tiles.slice(1);
  assert.equal(new Set(small.map((t) => `${t.w}x${t.h}`)).size, 1, "the five small tiles differ");
  const big = tiles[0];
  assert.ok(Math.abs(big.w - (2 * small[0].w + 12)) <= 2 && Math.abs(big.h - (2 * small[0].h + 12)) <= 2, "the feature tile is not exactly two cells");
  await ctx.close();
});

test("the home gallery fits a phone with no sideways scroll, and no tile is wider than tall", async () => {
  const { page, ctx } = await open("/", { width: 390, height: 800 });
  assert.ok((await box(page, ".gallery-item")).every((t) => t.w <= t.h));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await ctx.close();
});

test("on a wide screen the Shop button is on screen without scrolling", async () => {
  for (const [w, h] of [[1280, 800], [1440, 900], [1024, 768]]) {
    const { page, ctx } = await open("/", { width: w, height: h });
    await page.waitForTimeout(2400);
    const bottom = await page.$eval(".hero-shop", (e) => e.getBoundingClientRect().bottom);
    assert.ok(bottom <= h, `${w}x${h}: Shop ends at ${Math.round(bottom)}`);
    await ctx.close();
  }
});

test("the cue under the hero is 64px above the next section at every size", async () => {
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const { page, ctx } = await open("/", { width: w, height: h });
    await page.waitForTimeout(2400);
    const gap = await page.evaluate(() => Math.round(document.querySelector("#craft").getBoundingClientRect().top - document.querySelector(".scroll-hint").getBoundingClientRect().bottom));
    assert.equal(gap, 64, `${w}x${h}`);
    await ctx.close();
  }
});

test("portrait albums get a 4:5 gallery frame and landscape albums 3:2", async () => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const sizes = new Set();
    for (const slug of ["cygnus-shell-cordovan-marbled", "gv1-horween-cypress"]) {
      const { page, ctx } = await open(`/shop/${slug}`, vp);
      const [frame] = await box(page, ".slides");
      sizes.add(`${frame.w}x${frame.h}`);
      assert.ok(Math.abs(frame.w / frame.h - 0.8) < 0.01, `${slug}: ${frame.w}x${frame.h}`);
      await ctx.close();
    }
    assert.equal(sizes.size, 1, `frames differ at ${vp.width}px: ${[...sizes]}`);
    for (const slug of ["cygnet-horween-cavalier-sunflower", "collar-horween-cxl"]) {
      const { page, ctx } = await open(`/shop/${slug}`, vp);
      await page.waitForSelector(".gallery.landscape");
      const [frame] = await box(page, ".slides");
      assert.ok(Math.abs(frame.w / frame.h - 1.5) < 0.02, `${slug}: ${frame.w}x${frame.h}`);
      await ctx.close();
    }
  }
});

test("thumbnails are 72px squares on a desktop, and dots replace them on a phone", async () => {
  const d = await open("/shop/cygnus-shell-cordovan-marbled", { width: 1280, height: 800 });
  const thumbs = await box(d.page, ".thumbs button");
  assert.ok(thumbs.length > 1 && thumbs.every((t) => t.w === 72 && t.h === 72));
  assert.equal(await d.page.locator(".dots").isVisible(), false);
  await d.ctx.close();
  const m = await open("/shop/cygnus-shell-cordovan-marbled", { width: 390, height: 844 });
  assert.equal(await m.page.locator(".thumbs").isVisible(), false);
  assert.equal(await m.page.locator(".dots").isVisible(), true);
  await m.page.click(".dots button:nth-child(3)");
  await m.page.waitForTimeout(700);
  assert.equal(await m.page.getAttribute(".dots button:nth-child(3)", "aria-current"), "true");
  await m.ctx.close();
});

test("the category tabs stay on one row on a phone", async () => {
  const { page, ctx } = await open("/shop/made-to-order", { width: 390, height: 800 });
  await page.waitForSelector("#listing .grid");
  const rows = await page.$$eval("#shop-tabs a", (a) => new Set(a.map((x) => Math.round(x.getBoundingClientRect().top))).size);
  assert.equal(rows, 1);
  await ctx.close();
});

test("shop cards split the color from the leather, and prices line up", async () => {
  const { page, ctx } = await open("/shop/made-to-order", { width: 390, height: 800 });
  await page.waitForSelector("#listing .grid");
  const off = await page.$$eval(".card", (cs) => [...new Set(cs.map((c) => Math.round(c.getBoundingClientRect().bottom - c.querySelector(".price").getBoundingClientRect().bottom)))]);
  assert.equal(off.length, 1, `prices sit at different heights in their cards: ${off}`);
  const cygnet = await page.$$eval(".card h2", (hs) => hs.map((h) => h.textContent).filter((t) => /^CygnetV2 \u00b7 /.test(t)));
  assert.ok(cygnet.length >= 2, "Cygnet cards lead with the color");
  await ctx.close();
});

test("the designer has the shared header, one buy block and no page errors", async () => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const { page, ctx, errors } = await open("/design.html", vp);
    assert.equal(await page.locator(".site-header").count(), 1);
    assert.equal(await page.locator(".cart-btn").isVisible(), true);
    const buys = await page.$$eval("a[data-buy]", (as) => as.filter((a) => a.getClientRects().length && getComputedStyle(a).visibility !== "hidden").length);
    assert.equal(buys, 1, `${vp.width}px shows ${buys} buy buttons`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
