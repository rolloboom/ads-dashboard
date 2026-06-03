const SHEET_ID  = process.env.SHEET_ID  || "1IjE6IGmXAmDHF-mbaUjkWWIK8hk2wjL0YfC2-VjXkz0";
const INSTALS_TAB = "Instals";

// ── GET: read all instals from the "Instals" sheet tab
async function readInstals(apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(INSTALS_TAB)}?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) return {};
  const json = await r.json();
  const rows = (json.values || []).slice(1); // skip header
  const result = {};
  rows.forEach(row => {
    if (row[0] && row[1] !== undefined) result[String(row[0])] = String(row[1]);
  });
  return result;
}

// ── POST: write instal value via Apps Script web app (if configured)
async function writeInstal(key, instal) {
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  if (!scriptUrl) return false;
  const r = await fetch(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setInstal", key, instal }),
    redirect: "follow",
  });
  return r.ok;
}

export default async function handler(req, res) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GOOGLE_SHEETS_API_KEY not set" });

  if (req.method === "GET") {
    try {
      const instals = await readInstals(apiKey);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ instals });
    } catch (e) {
      return res.status(200).json({ instals: {} }); // graceful fallback
    }
  }

  if (req.method === "POST") {
    const { key, instal } = req.body || {};
    if (!key) return res.status(400).json({ error: "key required" });
    try {
      const ok = await writeInstal(key, instal);
      return res.status(200).json({ ok });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
