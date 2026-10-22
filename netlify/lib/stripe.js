import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

// Stripe takes form-encoded bodies with bracketed keys for nesting: a[b][0]=c.
export function encode(value, prefix = "", out = []) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => encode(v, `${prefix}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) encode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  }
  return out;
}

export async function stripe(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const body = encode(params).join("&");
  const get = method === "GET";
  const res = await fetch(`${API}${path}${get && body ? `?${body}` : ""}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(get ? {} : { "content-type": "application/x-www-form-urlencoded" }),
    },
    body: get ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || `Stripe error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Verifies the Stripe-Signature header against the raw body. Throws if it does not match.
export function verifySignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) throw new Error("Missing signature or secret");
  const parts = {};
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=");
    (parts[k] ||= []).push(v);
  }
  const t = parts.t?.[0];
  if (!t || !parts.v1) throw new Error("Malformed signature header");
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) throw new Error("Timestamp outside tolerance");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const ok = parts.v1.some((sig) => {
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error("Signature mismatch");
}

// Stripe moved the shipping address to collected_information; older Sessions keep it at the top.
export const shippingOf = (session) => session.collected_information?.shipping_details || session.shipping_details || null;

export const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});
