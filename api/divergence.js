// Serverless proxy for the EU/US divergence panel, backed by Airtable.
// Lets that data be edited without a redeploy — eu-us-data.js is the fallback
// if this isn't wired up. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in the
// Vercel project settings; AIRTABLE_DIVERGENCE_TABLE defaults below.

const AIRTABLE = "https://api.airtable.com/v0";

// Airtable stores matchTags as one comma-separated text field, not a real
// array field, so this is the client-side shape EU_US_DIVERGENCE expects.
function splitTags(raw) {
  return String(raw || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

function toEntry(record) {
  const f = record.fields || {};
  return {
    id: f.id || record.id,
    name: f.name || "",
    eNumber: f.eNumber || null,
    matchTags: splitTags(f.matchTags),
    usStatus: f.usStatus || "",
    euStatus: f.euStatus || "",
    note: f.note || "",
    source: f.source || ""
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Edits should show up within about an hour without a redeploy, but this
  // still isn't a write endpoint — cache harder than recalls, softer than fdc.
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey) return res.status(500).json({ error: "AIRTABLE_API_KEY not configured" });
  if (!baseId) return res.status(500).json({ error: "AIRTABLE_BASE_ID not configured" });

  const table = process.env.AIRTABLE_DIVERGENCE_TABLE || "EU_US_Divergence";
  const url = `${AIRTABLE}/${baseId}/${encodeURIComponent(table)}`;

  try {
    const records = [];
    let offset;
    // The table should only ever hold a few dozen rows, but don't loop forever
    // if Airtable ever hands back a bad/looping offset.
    for (let i = 0; i < 20; i++) {
      const page = offset ? `${url}?offset=${encodeURIComponent(offset)}` : url;
      const upstream = await fetch(page, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!upstream.ok) return res.status(502).json({ error: `airtable responded ${upstream.status}` });
      const data = await upstream.json();
      records.push(...(data.records || []));
      offset = data.offset;
      if (!offset) break;
    }
    // Flat array, not wrapped — drop-in replacement for the EU_US_DIVERGENCE const.
    return res.status(200).json(records.map(toEntry));
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
