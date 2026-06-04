const SHEET_ID   = process.env.SHEET_ID || "1IjE6IGmXAmDHF-mbaUjkWWIK8hk2wjL0YfC2-VjXkz0";
const LABELS_TAB = "Labels";
const crypto     = require("crypto");

// ── JWT for Google Service Account ──────────────────────────────────────────
function base64url(str) {
  return Buffer.from(str).toString("base64")
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function getAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT not set");

  let key;
  try { key = JSON.parse(raw); }
  catch { throw new Error("GOOGLE_SERVICE_ACCOUNT is not valid JSON"); }

  const privateKey = (key.private_key || "").replace(/\\n/g, "\n");

  const now     = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg:"RS256", typ:"JWT" }));
  const payload = base64url(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(privateKey, "base64")
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");

  const jwt = `${header}.${payload}.${sig}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Token error: " + JSON.stringify(d));
  return d.access_token;
}

// ── Ensure "Labels" sheet tab exists, create it if not ──────────────────────
async function ensureLabelsTab(token) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const metaR  = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${apiKey}&fields=sheets.properties.title`);
  const meta   = await metaR.json();
  const exists = (meta.sheets || []).some(s => s.properties.title === LABELS_TAB);
  if (exists) return;

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: LABELS_TAB } } }] }),
  });

  // Write header row: A=AccountKey B=Name C=Comment D=Instal E=UpdatedAt F=ManualBan G=Known H=Deleted
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB + "!A1:H1")}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["AccountKey","Name","Comment","Instal","UpdatedAt","ManualBan","Known","Deleted"]] }),
    }
  );
}

// ── Read Labels tab ──────────────────────────────────────────────────────────
async function readLabels() {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) return {};
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB)}?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) return {};
  const json = await r.json();
  if (json.error) return {};
  const rows = (json.values || []).slice(1);
  const result = {};
  rows.forEach(row => {
    if (!row[0]) return;
    result[String(row[0])] = {
      name:      row[1] || "",
      comment:   row[2] || "",
      instal:    row[3] || "",
      manualBan: row[5] || "",
      known:     row[6] || "",
      deleted:   row[7] || "",
    };
  });
  return result;
}

// ── Write one field for one key ──────────────────────────────────────────────
async function writeLabel(key, field, value) {
  const token = await getAccessToken();
  await ensureLabelsTab(token);

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB)}?key=${apiKey}`;
  const gr  = await fetch(getUrl);
  const gj  = await gr.json();
  const rows = gj.values || [["AccountKey","Name","Comment","Instal","UpdatedAt","ManualBan","Known","Deleted"]];

  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) { rowIdx = i + 1; break; }
  }

  const existing = rowIdx > 0 ? rows[rowIdx - 1] : [];
  const cur = {
    name:      existing[1] || "",
    comment:   existing[2] || "",
    instal:    existing[3] || "",
    manualBan: existing[5] || "",
    known:     existing[6] || "",
    deleted:   existing[7] || "",
  };
  cur[field] = value;

  const rowValues = [[key, cur.name, cur.comment, cur.instal, new Date().toISOString(), cur.manualBan, cur.known, cur.deleted]];

  if (rowIdx > 0) {
    const range = `${LABELS_TAB}!A${rowIdx}:H${rowIdx}`;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: rowValues }),
      }
    );
  } else {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB + "!A:H")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: rowValues }),
      }
    );
  }
}

// ── Batch write "known" for multiple accounts at once ────────────────────────
async function batchMarkKnown(keys) {
  if (!keys || keys.length === 0) return;
  const token = await getAccessToken();
  await ensureLabelsTab(token);

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB)}?key=${apiKey}`;
  const gr  = await fetch(getUrl);
  const gj  = await gr.json();
  const rows = gj.values || [["AccountKey","Name","Comment","Instal","UpdatedAt","ManualBan","Known","Deleted"]];

  // Build index of existing rows
  const idxMap = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) idxMap[String(rows[i][0])] = i + 1;
  }

  const updates = [];
  const appends = [];

  keys.forEach(key => {
    if (idxMap[key]) {
      const existing = rows[idxMap[key] - 1];
      if (existing[6] === "1") return; // already known, skip
      const cur = {
        name:      existing[1] || "",
        comment:   existing[2] || "",
        instal:    existing[3] || "",
        manualBan: existing[5] || "",
        known:     "1",
        deleted:   existing[7] || "",
      };
      updates.push({ rowIdx: idxMap[key], values: [key, cur.name, cur.comment, cur.instal, new Date().toISOString(), cur.manualBan, cur.known, cur.deleted] });
    } else {
      appends.push([key, "", "", "", new Date().toISOString(), "", "1", ""]);
    }
  });

  // Batch update existing rows
  if (updates.length > 0) {
    const data = updates.map(u => ({
      range: `${LABELS_TAB}!A${u.rowIdx}:H${u.rowIdx}`,
      values: [u.values],
    }));
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "RAW", data }),
      }
    );
  }

  // Append new rows one by one (Sheets API append doesn't support multi-row well in all cases)
  for (const rowValues of appends) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(LABELS_TAB + "!A:H")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [rowValues] }),
      }
    );
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const labels = await readLabels();
      return res.status(200).json({ labels });
    } catch (e) {
      console.error("GET /api/labels error:", e.message);
      return res.status(200).json({ labels: {} });
    }
  }

  if (req.method === "POST") {
    const { key, field, value, action, keys } = req.body || {};

    // Batch mark known accounts
    if (action === "syncKnown") {
      if (!Array.isArray(keys)) return res.status(400).json({ error: "keys array required" });
      try {
        await batchMarkKnown(keys);
        return res.status(200).json({ ok: true });
      } catch (e) {
        console.error("POST /api/labels syncKnown error:", e.message);
        return res.status(200).json({ ok: false, error: e.message });
      }
    }

    if (!key || !field) return res.status(400).json({ error: "key and field required" });
    try {
      await writeLabel(key, field, value || "");
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("POST /api/labels error:", e.message);
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
