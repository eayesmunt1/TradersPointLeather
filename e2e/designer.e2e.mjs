// End-to-end tests for design.html, driven with real mouse clicks in a real browser.
//
// The repo has no package manager, so Playwright is not a dependency. To run these:
//   npm install --no-save playwright && npx playwright install chromium
//   BASE_URL=http://localhost:8888 node --test e2e/designer.e2e.mjs
// Needs the site served (netlify dev, or python3 -m http.server 8000 with BASE_URL set to it).
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8888";
const PARTS = ["exterior", "interior", "pocketUpper", "pocketLower"];

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

// A fresh context each time, so nothing is cached from an earlier run.
async function open(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/design.html`, { waitUntil: "networkidle" });
  return { page, ctx, errors };
}

// A real click on a chip, the way a person does it: scroll it into view, move the mouse, press.
async function pick(page, group, value) {
  const chip = page.locator(`[data-group="${group}"][data-value="${value}"]`);
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
}

// What the page says is selected (the chips) and what it actually paints (the drawing's shades).
async function seen(page) {
  return page.evaluate((parts) => {
    const out = {};
    for (const key of parts) {
      const checked = document.querySelector(`[data-group="${key}"][aria-checked="true"]`);
      const name = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      const shade = document.querySelector(".wallet-svg").style.getPropertyValue(`--s-${name}`);
      const painted = LEATHERS.find((l) => l.shade === shade);
      out[key] = { chip: checked?.dataset.value, painted: painted?.id };
    }
    return out;
  }, PARTS);
}
const ids = (s) => PARTS.map((k) => s[k].chip);
const drawn = (s) => PARTS.map((k) => s[k].painted);

test("a fresh page starts all Whiskey", async () => {
  const { page, ctx, errors } = await open();
  const s = await seen(page);
  assert.deepEqual(ids(s), ["whiskey", "whiskey", "whiskey", "whiskey"]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the first Outside pick sets every part, in the chips and in the drawing", async () => {
  const { page, ctx } = await open();
  await pick(page, "exterior", "plum");
  const s = await seen(page);
  assert.deepEqual(ids(s), ["plum", "plum", "plum", "plum"]);
  assert.deepEqual(drawn(s), ["plum", "plum", "plum", "plum"]);
  await ctx.close();
});

test("after that, choosing a part changes only that part", async () => {
  const { page, ctx } = await open();
  await pick(page, "exterior", "plum");
  await pick(page, "interior", "ink");
  assert.deepEqual(ids(await seen(page)), ["plum", "ink", "plum", "plum"]);
  await pick(page, "pocketUpper", "redbus");
  assert.deepEqual(ids(await seen(page)), ["plum", "ink", "redbus", "plum"]);
  await pick(page, "pocketLower", "whiskey");
  const s = await seen(page);
  assert.deepEqual(ids(s), ["plum", "ink", "redbus", "whiskey"]);
  assert.deepEqual(drawn(s), ["plum", "ink", "redbus", "whiskey"]);
  await ctx.close();
});

test("changing the Outside again changes only the Outside", async () => {
  const { page, ctx } = await open();
  await pick(page, "exterior", "plum");
  await pick(page, "interior", "ink");
  await pick(page, "exterior", "whiskey");
  const s = await seen(page);
  assert.deepEqual(ids(s), ["whiskey", "ink", "plum", "plum"]);
  assert.deepEqual(drawn(s), ["whiskey", "ink", "plum", "plum"]);
  await ctx.close();
});

test("a part chosen before the Outside is not overwritten by it", async () => {
  const { page, ctx } = await open();
  await pick(page, "pocketLower", "ink");
  await pick(page, "exterior", "plum");
  assert.deepEqual(ids(await seen(page)), ["plum", "whiskey", "whiskey", "ink"]);
  await ctx.close();
});

test("switching to Newbury restarts every part and offers only Newbury colors", async () => {
  const { page, ctx } = await open();
  await pick(page, "exterior", "plum");
  await pick(page, "family", "newbury");
  assert.deepEqual(ids(await seen(page)), ["nb-cognac", "nb-cognac", "nb-cognac", "nb-cognac"]);
  const shown = await page.$$eval('[data-group="exterior"].swatch', (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.value));
  assert.equal(shown.length, 10);
  assert.ok(shown.every((v) => v.startsWith("nb-")));
  // The first Outside pick in the new family sets everything again.
  await pick(page, "exterior", "nb-red");
  assert.deepEqual(ids(await seen(page)), ["nb-red", "nb-red", "nb-red", "nb-red"]);
  await ctx.close();
});

test("Newbury locks the stash pocket on; Horween leaves it optional", async () => {
  const { page, ctx } = await open();
  await pick(page, "family", "newbury");
  assert.equal(await page.locator('[data-group="stash"][data-value="none"]').isDisabled(), true);
  assert.equal(await page.getAttribute('[data-group="stash"][data-value="stash"]', "aria-checked"), "true");
  await pick(page, "family", "horween");
  assert.equal(await page.locator('[data-group="stash"][data-value="none"]').isDisabled(), false);
  await ctx.close();
});

test("the same flow works on a phone, with real taps", async () => {
  const { page, ctx, errors } = await open({ width: 390, height: 800 });
  await pick(page, "exterior", "plum");
  await pick(page, "interior", "ink");
  await pick(page, "exterior", "whiskey");
  const s = await seen(page);
  assert.deepEqual(ids(s), ["whiskey", "ink", "plum", "plum"]);
  assert.deepEqual(drawn(s), ["whiskey", "ink", "plum", "plum"]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the build spec and code say what was chosen", async () => {
  const { page, ctx } = await open();
  await pick(page, "exterior", "plum");
  await pick(page, "interior", "ink");
  const spec = await page.evaluate(() => buildSpec());
  assert.match(spec, /Outside: Horween Cavalier Plum/);
  assert.match(spec, /Inside: Horween Cavalier Ink Blue/);
  assert.match(spec, /Upper Card Pockets: Horween Cavalier Plum/);
  const code = await page.evaluate(() => buildCode());
  assert.match(code, /EXT:plum \/ INT:ink \/ PU:plum \/ PL:plum/);
  await ctx.close();
});

test("Buy posts the build to /api/checkout, and initials add a $10 line without changing the style", async () => {
  const { page, ctx, errors } = await open();
  const posts = [];
  await page.route("**/api/checkout", (route) => { posts.push(JSON.parse(route.request().postData())); route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ error: "stub" }) }); });
  page.on("dialog", (d) => d.dismiss());
  const buy = page.locator("a[data-buy]:visible").first();
  assert.equal((await buy.textContent()).trim(), "Buy \u2014 $145");
  assert.match(await page.textContent("#send-note-side"), /\$145\. Initials \+\$10/);
  await page.fill("#monogram", "ABC");
  assert.equal((await buy.textContent()).trim(), "Buy \u2014 $155");
  assert.match(await page.textContent("#send-note-side"), /\$145 \+ Initials \(\+\$10\) = \$155/);
  await buy.click();
  await page.waitForTimeout(300);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].build.model, "classic");
  assert.equal(posts[0].build.initials, "ABC");
  assert.match(posts[0].build.spec, /Initials: ABC/);
  assert.equal(JSON.stringify(posts[0]).includes("amount"), false, "the request carries no price");
  await page.fill("#monogram", "");
  assert.equal((await page.locator("a[data-buy]:visible").first().textContent()).trim(), "Buy \u2014 $145");
  assert.deepEqual(errors, []);
  await ctx.close();
});
