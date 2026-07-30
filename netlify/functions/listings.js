export async function handler() {
  const KEY = process.env.etsy_key;
  const keyDebug = KEY ? `set (length ${KEY.length})` : "MISSING — env var not loaded";
  const H = { "x-api-key": KEY };

  try {
    // Resolve numeric shop_id from shop name
    const s = await fetch(
      "https://api.etsy.com/v3/application/shops?shop_name=TradersPointLeather",
      { headers: H }
    ).then((r) => r.json());

    const shopId = s.results?.[0]?.shop_id;
    if (!shopId) {
      return { statusCode: 502, body: JSON.stringify({ error: "shop_id not resolved", etsy_key: keyDebug, raw: s }) };
    }

    // Active listings (key-only, no OAuth)
    const l = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/listings/active?limit=100`,
      { headers: H }
    ).then((r) => r.json());

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify((l.results || []).map((x) => x.title)),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}
