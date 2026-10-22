// One header on every page. See designer.e2e.mjs for how to run these.
//   BASE_URL=http://localhost:8888 node --test e2e/header.e2e.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8888";
const PAGES = ["/", "/shop", "/shop/gv1-horween-cypress", "/cart"];

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(path, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  return { page, ctx, errors };
}

const headerOf = (page) =>
  page.evaluate(() => ({
    logoHref: document.querySelector(".site-header-logo")?.getAttribute("href"),
    links: [...document.querySelectorAll(".site-nav a")].filter((a) => a.offsetParent).map((a) => `${a.textContent.trim()} -> ${a.getAttribute("href")}`),
    cart: !!document.querySelector(".cart-btn") && document.querySelector(".cart-btn").offsetParent !== null,
    oldHeader: !!document.querySelector(".shop-header"),
  }));

test("home, shop, product and cart carry the same header", async () => {
  const seen = [];
  for (const path of PAGES) {
    const { page, ctx, errors } = await open(path);
    const h = await headerOf(page);
    assert.equal(h.oldHeader, false, `${path} still has the old shop header`);
    assert.equal(h.cart, true, `${path} has no cart`);
    assert.deepEqual(errors, [], path);
    seen.push({ path, logoHref: h.logoHref, links: h.links });
    await ctx.close();
  }
  for (const s of seen) {
    assert.equal(s.logoHref, "/");
    assert.deepEqual(s.links, seen[0].links, `${s.path} menu differs from the home page`);
  }
  assert.deepEqual(seen[0].links, [
    "Process -> /#craft", "Details -> /#details", "Shop -> /shop", "Wallets -> /shop/made-to-order",
    "Belts -> /shop/belts", "Design Your Wallet -> /design.html", "Contact -> /#contact",
  ]);
});

test("a link from the shop lands on the right section of the home page", async () => {
  const { page, ctx } = await open("/shop");
  await page.locator('.site-nav a:has-text("Process")').click();
  await page.waitForURL(/\/#craft$/);
  assert.ok(await page.locator("#craft").isVisible());
  await ctx.close();
});

test("the phone menu opens and closes on every page", async () => {
  for (const path of ["/", "/shop", "/shop/gv1-horween-cypress"]) {
    const { page, ctx } = await open(path, { width: 390, height: 800 });
    const nav = page.locator("#site-nav");
    assert.equal(await nav.isVisible(), false, `${path}: menu should start closed`);
    await page.locator(".nav-toggle").click();
    assert.equal(await nav.isVisible(), true, `${path}: menu should open`);
    assert.equal(await page.getAttribute(".nav-toggle", "aria-expanded"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await nav.isVisible(), false, `${path}: Escape should close it`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path}: sideways scroll`);
    await ctx.close();
  }
});

test("the cart count follows the cart, on the shop and on the home page", async () => {
  const { page, ctx } = await open("/shop/gv1-horween-cypress");
  await page.selectOption("[name=snap]", "Single Snap");
  await page.click('#add-form button[type=submit]');
  await page.waitForSelector("dialog[open]");
  assert.equal((await page.textContent(".cart-count")).trim(), "1");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  assert.equal((await page.textContent(".cart-count")).trim(), "1");
  await ctx.close();
});
