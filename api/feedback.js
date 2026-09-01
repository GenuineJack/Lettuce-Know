// Serverless endpoint for the "report incorrect data / request coverage" link.
// Writes one row per submission into an Airtable Feedback table. Set
// AIRTABLE_API_KEY and AIRTABLE_BASE_ID in the Vercel project settings;
// AIRTABLE_FEEDBACK_TABLE defaults below.

const AIRTABLE = "https://api.airtable.com/v0";

const TYPES = new Set(["no-data", "incorrect-data", "other"]);

// Generous but firm — enough for a real report, not enough to be useful as
// free storage for an abuser.
const MAX = { productName: 200, barcode: 64, notes: 2000 };

function clamp(value, max) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // This is a write endpoint — never cache a response for it.
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const body = req.body && typeof req.body === "object" ? req.body : {};

  // Honeypot: real users never fill this (hidden via CSS on the frontend).
  // Report success anyway so a bot never learns it was caught.
  if (body.website) return res.status(200).json({ ok: true });

  if (!TYPES.has(body.type)) return res.status(400).json({ error: "invalid type" });

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey) return res.status(500).json({ error: "AIRTABLE_API_KEY not configured" });
  if (!baseId) return res.status(500).json({ error: "AIRTABLE_BASE_ID not configured" });

  const table = process.env.AIRTABLE_FEEDBACK_TABLE || "Feedback";
  const url = `${AIRTABLE}/${baseId}/${encodeURIComponent(table)}`;

  const fields = {
    type: body.type,
    productName: clamp(body.productName, MAX.productName),
    barcode: clamp(body.barcode, MAX.barcode),
    notes: clamp(body.notes, MAX.notes),
    // Server-generated — never trust a client-supplied timestamp.
    submittedAt: new Date().toISOString(),
    status: "new"
  };

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });
    if (!upstream.ok) return res.status(502).json({ error: `airtable responded ${upstream.status}` });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
