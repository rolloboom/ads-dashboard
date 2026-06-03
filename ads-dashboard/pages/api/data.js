export default async function handler(req, res) {
  const apiKey  = process.env.GOOGLE_SHEETS_API_KEY;
  const sheetId = process.env.SHEET_ID || "1IjE6IGmXAmDHF-mbaUjkWWIK8hk2wjL0YfC2-VjXkz0";
  const tab     = process.env.SHEET_TAB || "Кампанії";

  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_SHEETS_API_KEY not set" });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}?key=${apiKey}`;

  try {
    const r    = await fetch(url);
    const json = await r.json();

    if (!r.ok) {
      return res.status(500).json({ error: json.error?.message || "Sheets API error" });
    }

    const values  = json.values || [];
    const headers = values[0] || [];
    const rows    = values.slice(1);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({ headers, rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
