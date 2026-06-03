const SHEET_ID  = process.env.SHEET_ID || "1IjE6IGmXAmDHF-mbaUjkWWIK8hk2wjL0YfC2-VjXkz0";
const LABELS_TAB = "Labels";
const crypto = require("crypto");

// ── JWT for Google Service Account
function base64url(str) {
  return Buffer.from(str).toString("base64")
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function getAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT not set");
  const key = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg:"RS256", typ:"JWT" }));
  const payload = base64url(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(key.private_key, "base64")
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const jwt = `${header}.${payload}.${sig}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Failed to get access token: " + JSON.stringify(d));
  return d.access_token;
}

// ── Read Labels tab → { [key]: { name, comment, instal } }
async function readLabels() {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB)}?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) return {};
  const json = await r.json();
  const rows = (json.values || []).slice(1);
  const result = {};
  rows.forEach(row => {
    if (!row[0]) return;
    result[String(row[0])] = {
      name:    row[1] || "",
      comment: row[2] || "",
      instal:  row[3] || "",
    };
  });
  return result;
}

// ── Write one field for one key
async function writeLabel(key, field, value) {
  const token = await getAccessToken();
  // First read current rows to find row index
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB)}?key=${process.env.GOOGLE_SHEETS_API_KEY}`;
  const gr = await fetch(getUrl);
  const gj = await gr.json();
  const rows = gj.values || [];

  // Find row for this key (skip header row[0])
  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) { rowIdx = i + 1; break; } // 1-based
  }

  // Build current values for this key
  const existing = rows[rowIdx > 0 ? rowIdx - 1 : -1] || [];
  const cur = {
    name:    existing[1] || "",
    comment: existing[2] || "",
    instal:  existing[3] || "",
    updated: new Date().toISOString(),
  };
  cur[field] = value;

  const rowValues = [[key, cur.name, cur.comment, cur.instal, cur.updated]];

  if (rowIdx > 0) {
    // Update existing row
    const range = `${LABELS_TAB}!A${rowIdx}:E${rowIdx}`;
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method:"PUT",
      headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
      body: JSON.stringify({ values: rowValues }),
    });
  } else {
    // Append new row (ensure header exists first)
    if (rows.length === 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB + "!A1:E1")}?valueInputOption=RAW`, {
        method:"PUT",
        headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ values:[["AccountKey","Name","Comment","Instal","UpdatedAt"]] }),
      });
    }
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB + "!A:E")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method:"POST",
      headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
      body: JSON.stringify({ values: rowValues }),
    });
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const labels = await readLabels();
      return res.status(200).json({ labels });
    } catch (e) {
      return res.status(200).json({ labels: {}, error: e.message });
    }
  }

  if (req.method === "POST") {
    const { key, field, value } = req.body || {};
    if (!key || !field) return res.status(400).json({ error: "key and field required" });
    try {
      await writeLabel(key, field, value || "");
      return res.status(200).json({ ok: true });
    } catch (e) {
      // Don't fail the request — localStorage is the fallback
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
