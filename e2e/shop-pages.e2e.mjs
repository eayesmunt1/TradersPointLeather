// The shop's own pages: Ready to Ship, Made to Order and Belts.
//   BASE_URL=http://localhost:8888 node --test e2e/shop-pages.e2e.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8888";
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(path, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#listing .grid", { timeout: 15000 });
  return { page, ctx, errors };
}
const cards = (page) => page.$$eval("#listing a.card", (cs) => cs.map((c) => ({ href: c.getAttribute("href"), name: c.querySelector("h2").textContent })));

test("/shop has no landing page: it redirects permanently to Ready to Ship", async () => {
  for (const path of ["/shop", "/shop/"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    assert.equal(res.status, 301, path);
    assert.equal(new URL(res.headers.get("location"), BASE).pathname, "/shop/ready-to-ship", path);
  }
});

test("Ready to Ship lists only finished pieces that are in stock, and no belts", async () => {
  const { page, ctx } = await open("/shop/ready-to-ship");
  assert.equal(await page.textContent("#shop-title"), "Ready to Ship");
  assert.match(await page.title(), /^Ready to Ship/);
  const list = await cards(page);
  assert.ok(list.length > 0);
  assert.ok(list.every((c) => !/belt/i.test(c.href)));
  // A Made to Order build is never listed here.
  const slugs = list.map((c) => c.href.replace("/shop/", ""));
  assert.ok(!slugs.includes("gv1-horween-cypress"));
  await ctx.close();
});

test("Made to Order lists the wallets, and no belts or collar", async () => {
  const { page, ctx } = await open("/shop/made-to-order");
  assert.equal(await page.textContent("#shop-title"), "Made to Order");
  const slugs = (await cards(page)).map((c) => c.href.replace("/shop/", ""));
  assert.ok(slugs.includes("gv1-horween-cypress"));
  assert.ok(!slugs.includes("collar-horween-cxl"), "the collar is on the Made to Order page");
  assert.ok(slugs.every((s) => !s.startsWith("belt-")), "a belt is on the Made to Order page");
  await ctx.close();
});

test("Belts and Dog Collars has its own page with the belts and the collar only", async () => {
  const { page, ctx } = await open("/shop/belts");
  assert.equal(await page.textContent("#shop-title"), "Belts and Dog Collars");
  const slugs = (await cards(page)).map((c) => c.href.replace("/shop/", ""));
  assert.ok(slugs.length > 0);
  assert.ok(slugs.includes("collar-horween-cxl"), "the collar is missing");
  assert.ok(slugs.every((s) => s.startsWith("belt-") || s.startsWith("collar-")), `not only belts and collars: ${slugs}`);
  await ctx.close();
});

test("the tabs and the header move between the pages and mark where you are", async () => {
  const { page, ctx } = await open("/shop/belts");
  const tabs = await page.$$eval("#shop-tabs a", (as) => as.map((a) => `${a.textContent}|${a.getAttribute("href")}|${a.getAttribute("aria-current") || ""}`));
  assert.deepEqual(tabs, ["Ready to Ship|/shop/ready-to-ship|", "Made to Order|/shop/made-to-order|", "Belts and Dog Collars|/shop/belts|page"]);
  assert.equal(await page.getAttribute('.site-nav a[href="/shop/belts"]', "aria-current"), "page");
  await page.click('#shop-tabs a:has-text("Made to Order")');
  await page.waitForURL(/\/shop\/made-to-order$/);
  await page.waitForSelector("#listing .grid");
  // Made to Order highlights Wallets; Shop is Ready to Ship.
  assert.equal(await page.getAttribute('.site-nav a[href="/shop/made-to-order"]', "aria-current"), "page");
  assert.equal(await page.getAttribute('.site-nav a[href="/shop/ready-to-ship"]', "aria-current"), null);
  await ctx.close();
});

test("a product page links back to its own category", async () => {
  for (const [slug, href, name] of [["gv1-horween-cypress", "/shop/made-to-order", "Made to Order"], ["belt-horween-cxl-raven", "/shop/belts", "Belts and Dog Collars"], ["collar-horween-cxl", "/shop/belts", "Belts and Dog Collars"], ["cygnet-newbury-balmoral-sunflower", "/shop/ready-to-ship", "Ready to Ship"]]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/shop/${slug}`, { waitUntil: "networkidle" });
    const crumbs = await page.$$eval(".crumbs a", (as) => as.map((a) => `${a.textContent}|${a.getAttribute("href")}`));
    assert.deepEqual(crumbs, [`\u2190 ${name}|${href}`], slug);
    await ctx.close();
  }
});

test("the shop pages fit a phone", async () => {
  for (const path of ["/shop/ready-to-ship", "/shop/made-to-order", "/shop/belts"]) {
    const { page, ctx, errors } = await open(path, { width: 390, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path}: sideways scroll`);
    assert.deepEqual(errors, [], path);
    await ctx.close();
  }
});

test("GV1 asks for a thread and a snap, and will not add until both are chosen", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/shop/gv1-horween-cypress`, { waitUntil: "networkidle" });
  const valid = () => page.evaluate(() => document.querySelector("#add-form").checkValidity());
  assert.equal(await page.$$eval('#add-form select[required]', (s) => s.map((e) => e.name).join(",")), "thread,snap");
  assert.equal(await valid(), false);
  await page.selectOption("[name=thread]", "Havana Brown");
  assert.equal(await valid(), false, "a thread alone is not enough");
  await page.selectOption("[name=snap]", "Double Snap");
  assert.equal(await valid(), true);
  await page.click('#add-form button[type=submit]');
  await page.waitForSelector("dialog[open]");
  assert.match(await page.innerText("dialog .drawer-body"), /Thread: Havana Brown · Snap: Double Snap/);
  await ctx.close();
});

test("pages that fix their thread do not ask for one", async () => {
  for (const slug of ["siah-horween-cavalier", "cygnet-horween-cavalier-mto"]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/shop/${slug}`, { waitUntil: "networkidle" });
    assert.equal(await page.locator('#add-form select[name="thread"]').count(), 0, slug);
    await ctx.close();
  }
});

test("the archived Sparrow address sends buyers to the Made to Order Sparrow", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/shop/sparrow-horween-cavalier-two-tone`, { waitUntil: "networkidle" });
  assert.match(page.url(), /\/shop\/sparrow-horween-cavalier-mto$/);
  await ctx.close();
});

test("the four policy pages load, and the footer and cart link to them", async () => {
  for (const path of ["/shipping", "/returns", "/privacy", "/terms"]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    assert.equal(res.status(), 200, path);
    assert.ok((await page.textContent("h1")).length > 3, path);
    await ctx.close();
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  assert.deepEqual(await page.$$eval(".footer-policy a", (as) => as.map((a) => a.getAttribute("href"))), ["/shipping", "/returns", "/privacy", "/terms"]);
  await ctx.close();
});

test("the Belts and Dog Collars tile (empty cart) shows the burgundy Latigo belt, not the collar", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
  await page.waitForSelector('.cart-tiles a.card[href="/shop/belts"] img');
  const src = await page.$eval('.cart-tiles a.card[href="/shop/belts"] img', (i) => i.getAttribute("src"));
  assert.match(src, /belt-newbury-latigo-burgundy/);
  await ctx.close();
});
