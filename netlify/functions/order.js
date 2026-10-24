import { json, shippingOf, stripe } from "../lib/stripe.js";

// Order summary for the thanks page, looked up server-side by Checkout Session id.
export async function handler(event) {
  const id = event.queryStringParameters?.session_id || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json(400, { error: "Invalid session." });
  try {
    const s = await stripe("GET", `/checkout/sessions/${id}`, { expand: ["line_items.data.price.product", "shipping_cost.shipping_rate"] });
    if (s.payment_status !== "paid") return json(200, { paid: false });
    const ship = shippingOf(s);
    const addr = ship?.address || {};
    return json(
      200,
      {
        paid: true,
        email: s.customer_details?.email || "",
        items: s.line_items.data.map((l) => ({
          name: l.description,
          quantity: l.quantity,
          total: l.amount_total,
        })),
        // One readable line per item: the name, then its choices and initials from the product description.
        details: s.line_items.data.map((l) => {
          const choices = l.price?.product?.description;
          return `${l.description}${l.quantity > 1 ? ` x${l.quantity}` : ""}${choices ? ` \u2014 ${choices}` : ""}`;
        }),
        // The shipping rate carries the promise made at checkout: 1-3 business days when everything was Ready to Ship.
        readyToShip: /1-3 business days/.test(s.shipping_cost?.shipping_rate?.display_name || ""),
        total: s.amount_total,
        currency: s.currency,
        shipTo: ship
          ? {
              name: ship.name,
              lines: [addr.line1, addr.line2, [addr.city, addr.state, addr.postal_code].filter(Boolean).join(" ")].filter(Boolean),
            }
          : null,
      },
      { "cache-control": "no-store" }
    );
  } catch {
    return json(404, { error: "Order not found." });
  }
}
