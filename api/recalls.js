// Serverless proxy for the USDA FSIS recall API.
// Deploy alongside index.html on Vercel, then set PROXY = "/api/recalls" in index.html.
// Only needed if the browser can't reach fsis.usda.gov directly (CORS or bot filtering).

const FSIS = "https://www.fsis.usda.gov/fsis/api/recall/v/1";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const upstream = await fetch(`${FSIS}?field_archive_recall=0`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RecallChecker/1.0)",
        "Accept": "application/json"
      }
    });
    if (!upstream.ok) return res.status(502).json({ error: `fsis responded ${upstream.status}` });
    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
