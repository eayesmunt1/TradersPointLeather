// Sends a signed checkout.session.completed event for a paid session to a local server, so stock
// and the owner email can be checked under `netlify dev` without the Stripe CLI.
//   STRIPE_WEBHOOK_SECRET=whsec_local node scripts/replay-webhook.mjs cs_test_...
// The dev server needs the same STRIPE_WEBHOOK_SECRET (put it in .env). Stripe sends the real event
// in production; this exists only for local checks.
import { createHmac } from "node:crypto";

const id = process.argv[2];
const secret = process.env.STRIPE_WEBHOOK_SECRET;
const base = process.env.BASE_URL || "http://localhost:8888";
if (!id || !secret) {
  console.error("Usage: STRIPE_WEBHOOK_SECRET=whsec_... node scripts/replay-webhook.mjs <checkout session id>");
  process.exit(1);
}
const body = JSON.stringify({ id: "evt_local", type: "checkout.session.completed", data: { object: { id } } });
const t = Math.floor(Date.now() / 1000);
const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const res = await fetch(`${base}/api/stripe-webhook`, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}`, "content-type": "application/json" }, body });
console.log(res.status, await res.text());
