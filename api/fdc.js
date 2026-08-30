// Serverless proxy for the USDA FoodData Central product lookup.
// Exists so the API key lives in a Vercel environment variable instead of in
// index.html — the browser never sees it. Set FDC_API_KEY in the Vercel project
// settings; without it this falls back to DEMO_KEY (30 req/hr), which is the
// same behaviour the app had before.

const FDC = "https://api.nal.usda.gov/fdc/v1";

// Barcodes only. Keeps this from being usable as a general-purpose FDC search
// proxy on someone else's quota.
const CODE = /^[A-Za-z0-9-]{1,32}$/;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Product identity for a given barcode is effectively static, so let the CDN
  // hold it far longer than the recall index.
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");

  if (req.method === "OPTIONS") return res.status(200).end();

  const code = (req.query && req.query.code) || "";
  if (!CODE.test(code)) return res.status(400).json({ error: "bad or missing code" });

  const key = process.env.FDC_API_KEY || "DEMO_KEY";
  const url = `${FDC}/foods/search?api_key=${encodeURIComponent(key)}`
    + `&query=${encodeURIComponent(code)}&dataType=Branded&pageSize=1`;

  try {
    const upstream = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!upstream.ok) return res.status(502).json({ error: `fdc responded ${upstream.status}` });
    const data = await upstream.json();
    // Passed through unchanged so fetchFdc() in index.html keeps reading d.foods.
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
