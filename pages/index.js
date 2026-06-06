import { useState, useEffect, useMemo, useCallback } from "react";
import Head from "next/head";

const C = {
  date: 0, time: 1, company: 2, accountId: 3,
  accStatus: 4, payStatus: 5,          // NEW: account & payment status
  currency: 6,
  campaign: 7, creo: 8, type: 9, status: 10, budget: 11,
  spendY: 12, spendT: 13, impY: 14, impT: 15, clicksY: 16,
  cpc: 17,
  conv: 18, convT: 19,                 // NEW: downloads today at index 19
  policyN: 20, policyD: 21, policyS: 22,
  geo: 23, domain: 24, monthSpend: 25,
};

const n      = v => parseFloat(String(v).replace(",", ".")) || 0;
const ni     = v => parseInt(String(v).replace(",", "."))  || 0;
const fmt2   = v => n(v).toLocaleString("uk-UA", { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmt3   = v => n(v).toFixed(3);
const fmtN   = v => ni(v).toLocaleString("uk-UA");
const fmtPct = v => n(v).toFixed(2) + "%";
const fmtDate = d => { const dt = new Date(); dt.setDate(dt.getDate()+d); return dt.toISOString().slice(0,10); };
const unique  = (rows, idx) => [...new Set(rows.map(r=>r[idx]).filter(Boolean))].sort();

// Columns for "Yesterday" tab
const COLS_YESTERDAY = [
  { label:"Кампанія",         col:C.campaign,   render: r => <Ellipsis v={r[C.campaign]} w={220} /> },
  { label:"Крео",             col:C.creo,       render: r => <Ellipsis v={r[C.creo]} w={150} muted /> },
  { label:"Тип",              col:C.type,       render: r => <Badge v={r[C.type]} color="blue" /> },
  { label:"Статус",           col:C.status,     render: r => <StatusBadge v={r[C.status]} /> },
  { label:"Бюджет $",         col:C.budget,     render: r => <Money v={r[C.budget]} /> },
  { label:"Витрати $",        col:C.spendY,     render: r => <Money v={r[C.spendY]} bold /> },
  { label:"Покази",           col:C.impY,       render: r => <Num v={r[C.impY]} /> },
  { label:"Кліки",            col:C.clicksY,    render: r => <Num v={r[C.clicksY]} /> },
  { label:"CTR",              col:C.clicksY,    render: r => <CTRCell clicks={r[C.clicksY]} imp={r[C.impY]} /> },
  { label:"CPC $",            col:C.cpc,        render: r => <Money v={r[C.cpc]} digits={3} /> },
  { label:"CPM $",            col:C.spendY,     render: r => <CPMCell spend={r[C.spendY]} imp={r[C.impY]} /> },
  { label:"DL вчора",         col:C.conv,       render: r => <Num v={r[C.conv]} yellow /> },
  { label:"Policy",           col:C.policyN,    render: r => <PolicyCell n={r[C.policyN]} d={r[C.policyD]} /> },
  { label:"Гео",              col:C.geo,        render: r => <Ellipsis v={r[C.geo]} w={160} muted /> },
  { label:"Домен",            col:C.domain,     render: r => <span style={{color:"var(--blue)",fontWeight:500}}>{r[C.domain]||"—"}</span> },
];

// Columns for "Today" tab
const COLS_TODAY = [
  { label:"Кампанія",         col:C.campaign,   render: r => <Ellipsis v={r[C.campaign]} w={220} /> },
  { label:"Крео",             col:C.creo,       render: r => <Ellipsis v={r[C.creo]} w={150} muted /> },
  { label:"Тип",              col:C.type,       render: r => <Badge v={r[C.type]} color="blue" /> },
  { label:"Статус",           col:C.status,     render: r => <StatusBadge v={r[C.status]} /> },
  { label:"Крутить?",         col:C.status,     render: r => <ServingCell status={r[C.status]} policyS={r[C.policyS]} policyN={r[C.policyN]} impT={r[C.impT]} impY={r[C.impY]} /> },
  { label:"Бюджет $",         col:C.budget,     render: r => <Money v={r[C.budget]} /> },
  { label:"Витрати сьогодні $",col:C.spendT,    render: r => <Money v={r[C.spendT]} accent /> },
  { label:"Покази сьогодні",  col:C.impT,       render: r => <Num v={r[C.impT]} /> },
  { label:"DL сьогодні",      col:C.convT,      render: r => <Num v={r[C.convT]} yellow /> },
  { label:"Policy",           col:C.policyN,    render: r => <PolicyCell n={r[C.policyN]} d={r[C.policyD]} /> },
  { label:"Акаунт",           col:C.accStatus,  render: r => <AccStatusCell v={r[C.accStatus]} p={r[C.payStatus]} /> },
  { label:"Гео",              col:C.geo,        render: r => <Ellipsis v={r[C.geo]} w={160} muted /> },
  { label:"Домен",            col:C.domain,     render: r => <span style={{color:"var(--blue)",fontWeight:500}}>{r[C.domain]||"—"}</span> },
  { label:"Місяць $",         col:C.monthSpend, render: r => <Money v={r[C.monthSpend]} /> },
];

export default function Dashboard() {
  const [rawRows,  setRawRows]  = useState([]);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [updated,  setUpdated]  = useState(null);
  const [tab,      setTab]      = useState("today"); // "today" | "yesterday" | "week"
  const [collapsed,setCollapsed]= useState(null); // null = collapse all by default

  // Custom labels: { [accountId]: { name: string, comment: string } }
  const [labels, setLabels] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ads_labels") || "{}"); } catch { return {}; }
  });

  const setLabel = useCallback((accountId, field, value) => {
    setLabels(prev => {
      const next = { ...prev, [accountId]: { ...(prev[accountId]||{}), [field]: value } };
      localStorage.setItem("ads_labels", JSON.stringify(next));
      // Persist to Google Sheet (shared between users)
      fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: accountId, field, value }),
      }).catch(() => {});
      return next;
    });
  }, []);

  const [dateFrom, setDateFrom] = useState(fmtDate(-7));
  const [dateTo,   setDateTo]   = useState(fmtDate(0));
  const [company,  setCompany]  = useState("");
  const [status,   setStatus]   = useState("");
  const [policyF,  setPolicyF]  = useState("");
  const [typeF,    setTypeF]    = useState("");
  const [domain,   setDomain]   = useState("");
  const [search,   setSearch]   = useState("");
  const [sortCol,  setSortCol]  = useState(null);
  const [sortDir,  setSortDir]  = useState(-1);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, rl] = await Promise.all([fetch("/api/data"), fetch("/api/labels")]);
      const j  = await r.json();
      const jl = await rl.json().catch(() => ({}));
      if (j.error) throw new Error(j.error);
      const allRows = j.rows || [];
      setRawRows(allRows);
      const map = {};
      allRows.forEach(row => {
        const key = String(row[C.company]) + "||" + String(row[C.campaign]);
        const ts  = String(row[C.date]) + " " + String(row[C.time]);
        if (!map[key] || ts > map[key].ts) map[key] = { row, ts };
      });
      setRows(Object.values(map).map(x => x.row));

      // Merge sheet labels into state (sheet wins — shared between users)
      const sheetLabels = (jl.labels && Object.keys(jl.labels).length > 0) ? jl.labels : null;

      // Register new known accounts (batch sync to Sheets)
      const allCompanies = [...new Set(
        allRows.map(r => String(r[C.company])).filter(c => c && c !== "Компанія")
      )];

      setLabels(prev => {
        const next = { ...prev };
        // 1. Merge sheet labels
        if (sheetLabels) {
          Object.entries(sheetLabels).forEach(([key, val]) => {
            next[key] = { ...(next[key]||{}), ...val };
          });
        }
        // 2. Mark all seen accounts as known (locally)
        const newAccounts = allCompanies.filter(c => !next[c]?.known);
        newAccounts.forEach(c => {
          next[c] = { ...(next[c]||{}), known: "1" };
        });
        localStorage.setItem("ads_labels", JSON.stringify(next));
        // 3. Persist new known accounts to Sheets (batch)
        if (newAccounts.length > 0) {
          fetch("/api/labels", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "syncKnown", keys: newAccounts }),
          }).catch(() => {});
        }
        return next;
      });

      setUpdated(new Date().toLocaleTimeString("uk-UA"));
    } catch(e) { setError(e.message); }
    finally    { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(), 60*60*1000);
    return () => clearInterval(t);
  }, [load]);

  const companies = useMemo(() => unique(rows, C.company), [rows]);
  const types     = useMemo(() => unique(rows, C.type),    [rows]);
  const domains   = useMemo(() => unique(rows, C.domain),  [rows]);
  const statuses  = useMemo(() => unique(rows, C.status),  [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    r = r.filter(x => !String(x[C.status]).includes("Завершена") && !String(x[C.status]).includes("Видалена"));
    if (dateFrom) r = r.filter(x => String(x[C.date]).slice(0,10) >= dateFrom);
    if (dateTo)   r = r.filter(x => String(x[C.date]).slice(0,10) <= dateTo);
    if (company)  r = r.filter(x => x[C.company] === company);
    if (status)   r = r.filter(x => x[C.status]  === status);
    if (typeF)    r = r.filter(x => x[C.type]     === typeF);
    if (domain)   r = r.filter(x => x[C.domain]   === domain);
    if (policyF === "issues") r = r.filter(x => ni(x[C.policyN]) > 0);
    if (policyF === "ok")     r = r.filter(x => ni(x[C.policyN]) === 0);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        String(x[C.campaign]).toLowerCase().includes(q) ||
        String(x[C.creo]).toLowerCase().includes(q) ||
        String(x[C.domain]).toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, dateFrom, dateTo, company, status, typeF, domain, policyF, search]);

  const COLS = tab === "yesterday" ? COLS_YESTERDAY : COLS_TODAY;

  // Table shows only non-Video views campaigns; KPI uses full filtered set
  const filteredForTable = useMemo(() =>
    filtered.filter(x => !String(x[C.campaign]).toLowerCase().includes("video views"))
  , [filtered]);

  const groups = useMemo(() => {
    // For today/yesterday tabs — only include accounts with fresh data
    const todayStr     = fmtDate(0);
    const yesterdayStr = fmtDate(-1);

    const map = {};
    filteredForTable.forEach(r => {
      const key     = String(r[C.company]||"—");
      const rowDate = String(r[C.date]||"").slice(0,10);
      // Skip stale rows: "today" tab needs today's row, "yesterday" needs yesterday or today
      if (tab === "today"     && rowDate < todayStr)     return;
      if (tab === "yesterday" && rowDate < yesterdayStr) return;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    const isNum = col => [C.budget,C.spendY,C.spendT,C.impY,C.impT,C.clicksY,C.cpc,C.conv,C.policyN,C.monthSpend].includes(col);
    const cmpFn = (av, bv) => av < bv ? sortDir : av > bv ? -sortDir : 0;

    // Sort rows within each group
    const rowSortFn = sortCol !== null ? (a,b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (isNum(sortCol)) { av = n(av); bv = n(bv); }
      else { av = String(av||"").toLowerCase(); bv = String(bv||"").toLowerCase(); }
      return cmpFn(av, bv);
    } : null;

    const list = Object.entries(map).map(([name,rows]) => {
      const sortedRows = rowSortFn ? [...rows].sort(rowSortFn) : rows;
      // Display name: if 1 campaign — show campaign name, else show account ID
      // Use campaign name as display; if multiple campaigns — show account ID
      const campNames = [...new Set(sortedRows.map(r => String(r[C.campaign]||"")).filter(Boolean))];
      const displayName = campNames.length === 1 ? campNames[0] : name;
      return { name, displayName, rows: sortedRows };
    });

    // Sort groups themselves by aggregate value of sortCol
    if (sortCol !== null) {
      list.sort((ga, gb) => {
        if (isNum(sortCol)) {
          return cmpFn(
            ga.rows.reduce((s,r) => s + n(r[sortCol]), 0),
            gb.rows.reduce((s,r) => s + n(r[sortCol]), 0)
          );
        } else {
          return cmpFn(
            String(ga.rows[0]?.[sortCol]||"").toLowerCase(),
            String(gb.rows[0]?.[sortCol]||"").toLowerCase()
          );
        }
      });
    } else {
      list.sort((a,b) => a.name.localeCompare(b.name));
    }

    // Add known accounts that have no data in current filter period
    // (e.g. new day with no rows yet, or account with no data in date range)
    Object.keys(labels).forEach(name => {
      const lbl = labels[name];
      if (!lbl?.known) return;          // not a known account
      if (lbl?.deleted === "1") return; // deleted
      if (lbl?.manualBan === "1") return; // in ban tab
      if (map[name]) return;            // already in list (has rows)
      if (accountStatus[name] === "banned") return; // auto-banned → ban tab
      list.push({ name, displayName: lbl.name || name, rows: [], isEmpty: true });
    });

    return list;
  }, [filteredForTable, sortCol, sortDir, tab, labels, accountStatus]);

  // KPI yesterday
  const kpiY = useMemo(() => {
    const spend  = filtered.reduce((s,r)=>s+n(r[C.spendY]),  0);
    const imp    = filtered.reduce((s,r)=>s+ni(r[C.impY]),   0);
    const clicks = filtered.reduce((s,r)=>s+ni(r[C.clicksY]),0);
    const conv   = filtered.reduce((s,r)=>s+n(r[C.conv]),    0);
    const pol    = filtered.filter(r=>ni(r[C.policyN])>0).length;
    return {
      spend, imp, clicks, conv, pol,
      total:  filtered.length,
      active: filtered.filter(r=>String(r[C.status]).includes("крутить")).length,
      ctr:    imp>0 ? (clicks/imp)*100 : 0,
      cpc:    clicks>0 ? spend/clicks : 0,
      cpm:    imp>0 ? (spend/imp)*1000 : 0,
      cpa:    conv>0 ? spend/conv : 0,
    };
  }, [filtered]);

  // KPI today
  const kpiT = useMemo(() => {
    const spend  = filtered.reduce((s,r)=>s+n(r[C.spendT]),  0);
    const imp    = filtered.reduce((s,r)=>s+ni(r[C.impT]),   0);
    const convT  = filtered.reduce((s,r)=>s+ni(r[C.convT]),  0);
    const month  = filtered.reduce((s,r)=>s+n(r[C.monthSpend]),0);
    const pol    = filtered.filter(r=>ni(r[C.policyN])>0).length;
    const active = filtered.filter(r=>String(r[C.status]).includes("крутить")).length;
    const paused = filtered.filter(r=>String(r[C.status]).includes("Пауза")).length;
    const banned = filtered.filter(r=>String(r[C.accStatus]).includes("БАН")).length;
    const payIssue = filtered.filter(r=>String(r[C.payStatus]).includes("Проблема")).length;
    return { spend, imp, convT, month, pol, active, paused, banned, payIssue, total: filtered.length };
  }, [filtered]);

  // Total instal from labels (manual input per account)
  const totalInstal = useMemo(() => {
    return groups.reduce((sum, g) => sum + (parseInt(labels[g.name]?.instal) || 0), 0);
  }, [groups, labels]);

  // Chart data
  const chartData = useMemo(() => {
    const byDC = {};
    rawRows.forEach(row => {
      const date = String(row[C.date]).slice(0,10);
      if (!date || date==="Дата") return;
      const key = date+"||"+String(row[C.company])+"||"+String(row[C.campaign]);
      const ts  = String(row[C.date])+" "+String(row[C.time]);
      const spend = tab==="today" ? n(row[C.spendT]) : n(row[C.spendY]);
      if (!byDC[key]||ts>byDC[key].ts) byDC[key]={date,spend,ts};
    });
    const byDate = {};
    Object.values(byDC).forEach(({date,spend})=>{ byDate[date]=(byDate[date]||0)+spend; });
    return Object.entries(byDate).sort((a,b)=>a[0]<b[0]?-1:1).slice(-30).map(([date,spend])=>({date,spend}));
  }, [rawRows, tab]);

  // Staleness / traffic-stop detection per account
  const accountStatus = useMemo(() => {
    const now     = Date.now();
    const THREE_H = 3 * 60 * 60 * 1000;

    // Step 1: per (company||campaign) — find latest row and anchor row (≥3h old)
    const perCamp = {};
    rawRows.forEach(row => {
      const company  = String(row[C.company]);
      const campaign = String(row[C.campaign]);
      if (!company || company === "Компанія") return;
      const dateStr = String(row[C.date]).slice(0, 10);
      const timeStr = String(row[C.time] || "00:00:00");
      const ts = new Date(dateStr + "T" + timeStr).getTime();
      if (isNaN(ts)) return;

      const key = company + "||" + campaign;
      if (!perCamp[key]) perCamp[key] = { company, lastTs:0, lastImpT:0, anchorTs:0, anchorImpT:null };
      const d = perCamp[key];

      if (ts > d.lastTs)  { d.lastTs = ts; d.lastImpT = ni(row[C.impT]); }
      if (now - ts >= THREE_H && ts > d.anchorTs) { d.anchorTs = ts; d.anchorImpT = ni(row[C.impT]); }
    });

    // Step 1b: track everHadImp per company across ALL rawRows
    const everHadImp = {};
    rawRows.forEach(row => {
      const company = String(row[C.company]);
      if (!company || company === "Компанія") return;
      if (ni(row[C.impY]) > 0 || ni(row[C.impT]) > 0) everHadImp[company] = true;
    });

    // Step 2: aggregate per company — sum impT across all campaigns
    const byCompany = {};
    Object.values(perCamp).forEach(d => {
      if (!byCompany[d.company]) byCompany[d.company] = { lastTs:0, lastImpT:0, anchorImpT:0, hasAnchor:false };
      const c = byCompany[d.company];
      if (d.lastTs > c.lastTs) c.lastTs = d.lastTs;
      c.lastImpT += d.lastImpT;
      if (d.anchorImpT !== null) { c.anchorImpT += d.anchorImpT; c.hasAnchor = true; }
    });

    // Step 3: decide status per company
    const TWO_DAYS = 48 * 60 * 60 * 1000;
    const result = {};
    Object.entries(byCompany).forEach(([company, v]) => {
      if (now - v.lastTs > TWO_DAYS) {
        result[company] = "banned";  // → БАН tab (2+ days without data)
      } else if (now - v.lastTs > THREE_H) {
        result[company] = "stale";   // RED in main table (3h-48h)
      } else if (!everHadImp[company]) {
        result[company] = "zero";    // BLUE — never had any impressions ever
      } else if ((v.lastImpT - v.anchorImpT) < 100) {
        result[company] = "no_imp";  // YELLOW — less than 100 new impressions in 3h
      } else {
        result[company] = "ok";      // GREEN — traffic growing
      }
    });
    return result;
  }, [rawRows]);

  // ── Banned accounts: auto (48h+ no data) OR manually banned (excluding deleted)
  const bannedGroups = useMemo(() => {
    const autoBanned   = new Set(Object.entries(accountStatus).filter(([,v])=>v==="banned").map(([k])=>k));
    const manualBanned = new Set(Object.keys(labels).filter(k=>labels[k]?.manualBan==="1"));
    const allBanned    = new Set([...autoBanned, ...manualBanned]);
    // Remove deleted accounts from ban tab
    Object.keys(labels).filter(k=>labels[k]?.deleted==="1").forEach(k=>allBanned.delete(k));
    if (allBanned.size === 0) return [];

    const latest = {};
    rawRows.forEach(row => {
      const company = String(row[C.company]);
      if (!allBanned.has(company)) return;
      const dateStr = String(row[C.date]).slice(0,10);
      const timeStr = String(row[C.time]||"00:00:00");
      const ts = new Date(dateStr+"T"+timeStr).getTime();
      if (isNaN(ts)) return;
      if (!latest[company] || ts > latest[company].ts) latest[company] = { row, ts };
    });
    // Include manual bans even if no rows found
    manualBanned.forEach(company => {
      if (!latest[company]) latest[company] = { row: [], ts: 0 };
    });

    return Object.entries(latest).map(([company, {row, ts}]) => ({
      company,
      lastSeen: ts > 0 ? new Date(ts).toLocaleString("uk-UA") : "—",
      lastTs: ts,
      row,
      isManual: manualBanned.has(company),
    })).sort((a,b) => b.lastTs - a.lastTs);
  }, [rawRows, accountStatus, labels]);

  // ── 7-day aggregated stats per account
  const weekGroups = useMemo(() => {
    const weekAgo = fmtDate(-7);
    const today   = fmtDate(0);
    // Latest snapshot per (account, campaign, date)
    const snap = {};
    rawRows.forEach(row => {
      const date = String(row[C.date]).slice(0,10);
      if (!date || date === "Дата" || date < weekAgo || date > today) return;
      const key = `${row[C.company]}||${row[C.campaign]}||${date}`;
      const ts  = `${row[C.date]} ${row[C.time]}`;
      if (!snap[key] || ts > snap[key].ts) snap[key] = { row, ts };
    });
    // Aggregate by account
    const byAcc = {};
    Object.values(snap).forEach(({ row }) => {
      const acc = String(row[C.company] || "—");
      if (!byAcc[acc]) byAcc[acc] = { name: acc, spend:0, imp:0, clicks:0, conv:0, policyIssues:0, days:new Set(), domain:"", geo:"" };
      const d = byAcc[acc];
      d.spend  += n(row[C.spendY]);
      d.imp    += ni(row[C.impY]);
      d.clicks += ni(row[C.clicksY]);
      d.conv   += ni(row[C.conv]);
      if (ni(row[C.policyN]) > 0) d.policyIssues++;
      if (!d.domain) d.domain = String(row[C.domain]||"");
      if (!d.geo)    d.geo    = String(row[C.geo]||"");
      d.days.add(String(row[C.date]).slice(0,10));
    });
    return Object.values(byAcc).map(d => ({
      ...d, days: d.days.size,
      ctr: d.imp>0 ? (d.clicks/d.imp)*100 : 0,
      cpc: d.clicks>0 ? d.spend/d.clicks : 0,
      cpm: d.imp>0 ? (d.spend/d.imp)*1000 : 0,
      cpa: d.conv>0 ? d.spend/d.conv : 0,
    })).sort((a,b) => b.spend - a.spend);
  }, [rawRows]);

  const [weekSort, setWeekSort] = useState({ col:"spend", dir:-1 });
  const weekSorted = useMemo(() => {
    const { col, dir } = weekSort;
    const numCols = ["spend","imp","clicks","conv","ctr","cpc","cpm","cpa","days"];
    return [...weekGroups].sort((a,b) => {
      const av = numCols.includes(col) ? (a[col]||0) : String(a[col]||"").toLowerCase();
      const bv = numCols.includes(col) ? (b[col]||0) : String(b[col]||"").toLowerCase();
      return av < bv ? dir : av > bv ? -dir : 0;
    });
  }, [weekGroups, weekSort]);

  const kpiW = useMemo(() => {
    const spend  = weekGroups.reduce((s,r)=>s+r.spend, 0);
    const imp    = weekGroups.reduce((s,r)=>s+r.imp,   0);
    const clicks = weekGroups.reduce((s,r)=>s+r.clicks,0);
    const conv   = weekGroups.reduce((s,r)=>s+r.conv,  0);
    const instal = weekGroups.reduce((s,r)=>s+(parseInt(labels[r.name]?.instal)||0), 0);
    return {
      spend, imp, clicks, conv, instal,
      ctr: imp>0?(clicks/imp)*100:0,
      cpc: clicks>0?spend/clicks:0,
      cpm: imp>0?(spend/imp)*1000:0,
      cpa: conv>0?spend/conv:0,
      cpi: instal>0?spend/instal:0,
      dl2i: conv>0&&instal>0?(instal/conv)*100:0,
      avgDay: spend/7,
    };
  }, [weekGroups, labels]);

  // null means "all collapsed" — resolved lazily when groups are known
  const collapsedSet = useMemo(
    () => collapsed === null ? new Set(groups.map(g=>g.name)) : collapsed,
    [collapsed, groups]
  );

  function toggleCollapse(name) {
    setCollapsed(prev=>{
      const base = prev === null ? new Set(groups.map(g=>g.name)) : new Set(prev);
      base.has(name) ? base.delete(name) : base.add(name);
      return base;
    });
  }
  function collapseAll(){ setCollapsed(null); }
  function expandAll(){   setCollapsed(new Set()); }
  function handleSort(col){ if(sortCol===col) setSortDir(d=>-d); else{setSortCol(col);setSortDir(-1);} }
  function resetFilters(){
    setDateFrom(fmtDate(-7)); setDateTo(fmtDate(0));
    setCompany(""); setStatus(""); setPolicyF(""); setTypeF(""); setDomain(""); setSearch("");
  }

  const today     = fmtDate(0);
  const yesterday = fmtDate(-1);

  return (
    <>
      <Head>
        <title>Ads Monitor</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <div style={S.page}>

        {/* HEADER */}
        <header style={S.header}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={S.logo}>⚡</div>
            <div>
              <div style={{fontSize:20,fontWeight:700,color:"var(--accent)",letterSpacing:"-.3px"}}>Ads Monitor</div>
              <div style={{fontSize:11,color:"var(--muted)"}}>Google Ads Dashboard</div>
            </div>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            {updated && <span style={{fontSize:12,color:"var(--muted)"}}>Оновлено: {updated}</span>}
            <button style={S.btn} onClick={load} disabled={loading}>
              {loading?"⟳ Завантаження…":"↺ Оновити"}
            </button>
          </div>
        </header>

        {error && <div style={S.errorBox}>⚠ {error}. Перевір API ключ у Vercel → Environment Variables.</div>}

        {/* TABS */}
        <div style={S.tabs}>
          <button style={{...S.tab, ...(tab==="today"?S.tabActive:{})}} onClick={()=>setTab("today")}>
            📅 Сьогодні
            <span style={S.tabDate}>{today}</span>
          </button>
          <button style={{...S.tab, ...(tab==="yesterday"?S.tabActive:{})}} onClick={()=>setTab("yesterday")}>
            📊 Вчора
            <span style={S.tabDate}>{yesterday}</span>
          </button>
          <button style={{...S.tab, ...(tab==="week"?S.tabActive:{})}} onClick={()=>setTab("week")}>
            📈 7 днів
            <span style={S.tabDate}>{fmtDate(-6)} — {fmtDate(0)}</span>
          </button>
          <button style={{...S.tab, ...(tab==="banned"?{...S.tabActive,borderColor:"var(--red)",background:"rgba(239,68,68,.1)"}:{})}} onClick={()=>setTab("banned")}>
            🚫 БАН
            {bannedGroups.length>0 && <span style={{background:"var(--red)",color:"#fff",borderRadius:20,fontSize:10,fontWeight:700,padding:"1px 7px",marginTop:2}}>{bannedGroups.length}</span>}
          </button>
        </div>

        {/* KPI — TODAY */}
        {tab==="today" && (
          <div style={S.kpiGrid}>
            <KpiCard label="Витрати сьогодні" value={"$"+fmt2(kpiT.spend)}  color="accent" sub="поточний день" />
            <KpiCard label="Покази сьогодні"  value={fmtN(kpiT.imp)}        color="blue"   sub="impressions" />
            <KpiCard label="DL сьогодні"      value={fmtN(kpiT.convT)}      color="yellow" sub="конверсій" />
            <KpiCard label="Ціна DL сьогодні" value={kpiT.convT>0?"$"+fmt2(kpiT.spend/kpiT.convT):"—"} color={kpiT.convT>0?"accent":"muted"} sub="витрати ÷ DL" />
            <KpiCard label="Витрати місяця"   value={"$"+fmt2(kpiT.month)}  color="purple" sub="цього місяця" />
            <KpiCard label="Активних"         value={kpiT.active}           color="green"  sub={`з ${kpiT.total} кампаній`} />
            <KpiCard label="Policy проблем"   value={kpiT.pol}              color={kpiT.pol>0?"red":"green"} sub="кампаній" onClick={kpiT.pol>0?()=>setPolicyF(f=>f==="issues"?"":"issues"):undefined} active={policyF==="issues"} />
            {kpiT.banned>0  && <KpiCard label="🚫 БАН акаунти"   value={kpiT.banned}   color="red"    sub="перевір акаунти" />}
            {kpiT.payIssue>0 && <KpiCard label="💳 Проблема оплати" value={kpiT.payIssue} color="red"  sub="перевір білінг" />}
          </div>
        )}

        {/* KPI — YESTERDAY */}
        {tab==="yesterday" && (
          <div style={S.kpiGrid}>
            <KpiCard label="Витрати вчора"  value={"$"+fmt2(kpiY.spend)}                    color="accent" sub={`${kpiY.total} кампаній`} />
            <KpiCard label="Покази"         value={fmtN(kpiY.imp)}                           color="blue"   sub="impressions" />
            <KpiCard label="Кліки"          value={fmtN(kpiY.clicks)}                        color="blue"   sub="" />
            <KpiCard label="CTR"            value={fmtPct(kpiY.ctr)}                         color={kpiY.ctr>=3?"green":kpiY.ctr>=1?"yellow":"muted"} sub="кліки ÷ покази" />
            <KpiCard label="CPC $"          value={kpiY.cpc>0?"$"+fmt2(kpiY.cpc):"—"}       color="purple" sub="вартість кліку" />
            <KpiCard label="CPM $"          value={kpiY.cpm>0?"$"+fmt2(kpiY.cpm):"—"}       color="purple" sub="вартість 1000 показів" />
            <KpiCard label="Downloads"      value={fmtN(kpiY.conv)}                          color="yellow" sub="конверсій" />
            <KpiCard label="CPA $"          value={kpiY.cpa>0?"$"+fmt2(kpiY.cpa):"—"}       color="accent" sub="вартість конверсії" />
            <KpiCard label="Instal"         value={fmtN(totalInstal)}                        color="green"  sub="встановлень" />
            <KpiCard label="DL → Instal %"  value={kpiY.conv>0 && totalInstal>0 ? fmtPct(totalInstal/kpiY.conv*100) : "—"} color={totalInstal>0?"green":"muted"} sub="конверсія в instal" />
            <KpiCard label="CPI $"          value={totalInstal>0 && kpiY.spend>0 ? "$"+fmt2(kpiY.spend/totalInstal) : "—"} color={totalInstal>0?"accent":"muted"} sub="ціна інстала" />
            <KpiCard label="Policy проблем" value={kpiY.pol}                                 color={kpiY.pol>0?"red":"green"} sub="кампаній" onClick={kpiY.pol>0?()=>setPolicyF(f=>f==="issues"?"":"issues"):undefined} active={policyF==="issues"} />
          </div>
        )}

        {/* KPI — WEEK */}
        {tab==="week" && (<>
          <div style={S.kpiGrid}>
            <KpiCard label="Витрати 7 днів"  value={"$"+fmt2(kpiW.spend)}                        color="accent" sub="загалом" />
            <KpiCard label="Avg / день"      value={"$"+fmt2(kpiW.avgDay)}                       color="purple" sub="середньо на день" />
            <KpiCard label="Покази"          value={fmtN(kpiW.imp)}                              color="blue"   sub="7 днів" />
            <KpiCard label="Кліки"           value={fmtN(kpiW.clicks)}                           color="blue"   sub="7 днів" />
            <KpiCard label="CTR"             value={fmtPct(kpiW.ctr)}                            color={kpiW.ctr>=3?"green":kpiW.ctr>=1?"yellow":"muted"} sub="кліки ÷ покази" />
            <KpiCard label="CPC $"           value={kpiW.cpc>0?"$"+fmt2(kpiW.cpc):"—"}          color="purple" sub="вартість кліку" />
            <KpiCard label="Downloads"       value={fmtN(kpiW.conv)}                             color="yellow" sub="7 днів" />
            <KpiCard label="CPA $"           value={kpiW.cpa>0?"$"+fmt2(kpiW.cpa):"—"}          color="accent" sub="ціна завантаження" />
            <KpiCard label="Instal"          value={fmtN(kpiW.instal)}                           color="green"  sub="7 днів" />
            <KpiCard label="DL → Instal %"   value={kpiW.dl2i>0?fmtPct(kpiW.dl2i):"—"}          color={kpiW.instal>0?"green":"muted"} sub="конверсія" />
            <KpiCard label="CPI $"           value={kpiW.cpi>0?"$"+fmt2(kpiW.cpi):"—"}          color={kpiW.instal>0?"accent":"muted"} sub="ціна інстала" />
          </div>

          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {[
                    {k:"name",    l:"Акаунт"},
                    {k:"spend",   l:"Витрати $"},
                    {k:"avgDay",  l:"Avg/день $"},
                    {k:"imp",     l:"Покази"},
                    {k:"clicks",  l:"Кліки"},
                    {k:"ctr",     l:"CTR"},
                    {k:"cpc",     l:"CPC $"},
                    {k:"cpm",     l:"CPM $"},
                    {k:"conv",    l:"Downloads"},
                    {k:"instal",  l:"Instal"},
                    {k:"dl2i",    l:"DL→I %"},
                    {k:"cpi",     l:"CPI $"},
                    {k:"domain",  l:"Домен"},
                  ].map(({k,l})=>(
                    <th key={k} style={S.th} onClick={()=>setWeekSort(s=>({col:k,dir:s.col===k?-s.dir:-1}))}>
                      <span style={{display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                        {l}<SortIcon active={weekSort.col===k} dir={weekSort.dir}/>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekSorted.map((g,i)=>{
                  const instal = parseInt(labels[g.name]?.instal)||0;
                  const dl2i   = g.conv>0&&instal>0 ? (instal/g.conv)*100 : 0;
                  const cpi    = instal>0&&g.spend>0 ? g.spend/instal : 0;
                  return (
                    <tr key={i} style={S.tr}>
                      <td style={S.td}><span style={{fontWeight:600}}>{labels[g.name]?.name || g.name}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",fontWeight:700,color:"var(--accent)",fontVariantNumeric:"tabular-nums"}}>${fmt2(g.spend)}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>${fmt2(g.spend/7)}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtN(g.imp)}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtN(g.clicks)}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:g.ctr>=3?"var(--green)":g.ctr>=1?"var(--yellow)":"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtPct(g.ctr)}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{g.cpc>0?"$"+fmt2(g.cpc):"—"}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{g.cpm>0?"$"+fmt2(g.cpm):"—"}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:g.conv>0?"var(--yellow)":"var(--muted)",fontWeight:g.conv>0?600:400,fontVariantNumeric:"tabular-nums"}}>{fmtN(g.conv)}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:instal>0?"var(--green)":"var(--muted)",fontWeight:instal>0?700:400,fontVariantNumeric:"tabular-nums"}}>{instal>0?fmtN(instal):"—"}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:dl2i>0?"var(--green)":"var(--muted)",fontVariantNumeric:"tabular-nums"}}>{dl2i>0?fmtPct(dl2i):"—"}</span></td>
                      <td style={S.td}><span style={{display:"block",textAlign:"right",color:cpi>0?"var(--accent)":"var(--muted)",fontVariantNumeric:"tabular-nums"}}>{cpi>0?"$"+fmt2(cpi):"—"}</span></td>
                      <td style={S.td}><span style={{color:"var(--blue)",fontWeight:500}}>{g.domain||"—"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {weekSorted.length===0&&<div style={S.empty}><div style={{fontSize:40,marginBottom:12}}>📊</div><div>Немає даних за останні 7 днів.</div></div>}
          </div>
        </>)}

        {/* BAN TAB */}
        {tab==="banned" && (
          <div>
            {bannedGroups.length===0 ? (
              <div style={S.empty}>
                <div style={{fontSize:40,marginBottom:12}}>✅</div>
                <div>Забанених акаунтів немає</div>
              </div>
            ) : (<>
              <div style={{marginBottom:16,color:"var(--muted)",fontSize:13}}>
                Акаунти без оновлень 48+ годин — автоматично перенесено з основної таблиці
              </div>
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {["Акаунт","Останній запис","Домен","Гео","Витрати вчора $","Покази вчора","DL вчора","Місяць $","Коментар"].map(l=>(
                        <th key={l} style={S.th}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bannedGroups.map(({company, lastSeen, row, isManual})=>(
                      <tr key={company} style={{...S.tr, background:"rgba(239,68,68,.06)"}}>
                        <td style={S.td}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{width:8,height:8,borderRadius:"50%",background:"var(--red)",boxShadow:"0 0 5px var(--red)",flexShrink:0}}/>
                            <span style={{fontWeight:700,color:"var(--red)"}}>{labels[company]?.name||company}</span>
                            {isManual && <span style={{background:"rgba(239,68,68,.2)",color:"var(--red)",fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:20}}>вручну</span>}
                            <button
                              onClick={()=>setLabel(company,"manualBan","")}
                              title="Повернути в основну таблицю"
                              style={{background:"rgba(16,185,129,.15)",color:"var(--green)",border:"1px solid rgba(16,185,129,.3)",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}
                            >↩ Розбанити</button>
                            <button
                              onClick={()=>{ if(window.confirm(`Видалити акаунт "${labels[company]?.name||company}" назавжди?`)){ setLabel(company,"deleted","1"); setLabel(company,"manualBan",""); } }}
                              title="Видалити назавжди (не відображатиметься більше)"
                              style={{background:"rgba(239,68,68,.12)",color:"var(--red)",border:"1px solid rgba(239,68,68,.3)",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}
                            >🗑 Видалити</button>
                          </div>
                        </td>
                        <td style={S.td}><span style={{color:"var(--muted)",fontSize:12}}>{lastSeen}</span></td>
                        <td style={S.td}><span style={{color:"var(--blue)",fontWeight:500}}>{row[C.domain]||"—"}</span></td>
                        <td style={S.td}><span style={{color:"var(--muted2)"}}>{row[C.geo]||"—"}</span></td>
                        <td style={S.td}><span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"var(--muted2)"}}>{n(row[C.spendY])>0?"$"+fmt2(row[C.spendY]):"—"}</span></td>
                        <td style={S.td}><span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"var(--muted2)"}}>{fmtN(row[C.impY])}</span></td>
                        <td style={S.td}><span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"var(--yellow)"}}>{ni(row[C.conv])>0?fmtN(row[C.conv]):"—"}</span></td>
                        <td style={S.td}><span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"var(--muted2)"}}>{n(row[C.monthSpend])>0?"$"+fmt2(row[C.monthSpend]):"—"}</span></td>
                        <td style={{...S.td,minWidth:180}} onClick={e=>e.stopPropagation()}>
                          <EditableCell value={labels[company]?.comment||""} placeholder="+ коментар…" onSave={v=>setLabel(company,"comment",v)} muted />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </div>
        )}

        {/* CHART */}
        {tab!=="week" && tab!=="banned" && chartData.length>1 && (
          <div style={S.chartBox}>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:12,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>
              {tab==="today"?"Витрати сьогодні по днях ($)":"Витрати вчора по днях ($)"}
            </div>
            <SpendChart data={chartData} />
          </div>
        )}

        {/* FILTERS — hidden on week/banned tabs */}
        {tab!=="week" && tab!=="banned" && <div style={S.filterBox}>
          <div style={S.filterRow}>
            <FGroup label="Від"><input style={S.inp} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></FGroup>
            <FGroup label="До"> <input style={S.inp} type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   /></FGroup>
            <FGroup label="Акаунт">
              <select style={S.sel} value={company} onChange={e=>setCompany(e.target.value)}>
                <option value="">Всі акаунти</option>
                {companies.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </FGroup>
            <FGroup label="Статус">
              <select style={S.sel} value={status} onChange={e=>setStatus(e.target.value)}>
                <option value="">Всі статуси</option>
                {statuses.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </FGroup>
            <FGroup label="Policy">
              <select style={S.sel} value={policyF} onChange={e=>setPolicyF(e.target.value)}>
                <option value="">Всі</option>
                <option value="issues">Є проблеми ⚠</option>
                <option value="ok">Без проблем ✓</option>
              </select>
            </FGroup>
            <FGroup label="Тип">
              <select style={S.sel} value={typeF} onChange={e=>setTypeF(e.target.value)}>
                <option value="">Всі типи</option>
                {types.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </FGroup>
            <FGroup label="Домен">
              <select style={S.sel} value={domain} onChange={e=>setDomain(e.target.value)}>
                <option value="">Всі домени</option>
                {domains.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </FGroup>
            <FGroup label="Пошук">
              <input style={{...S.inp,minWidth:200}} placeholder="Кампанія, крео, домен…" value={search} onChange={e=>setSearch(e.target.value)} />
            </FGroup>
            <FGroup label=" ">
              <button style={{...S.btn,background:"var(--bg4)",color:"var(--muted2)",border:"1px solid var(--border)"}} onClick={resetFilters}>Скинути</button>
            </FGroup>
          </div>
        </div>}

        {/* RESULTS BAR */}
        {tab!=="week" && tab!=="banned" && <div style={S.resultsBar}>
          <span style={{color:"var(--muted)",fontSize:12}}>
            {loading?"Завантаження…":`${filteredForTable.length} кампаній · ${groups.length} акаунтів`}
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button style={S.smallBtn} onClick={expandAll}>Розкрити всі</button>
            <button style={S.smallBtn} onClick={collapseAll}>Згорнути всі</button>
            <span style={{color:"var(--muted)",fontSize:11}}>↑↓ клік по заголовку</span>
          </div>
        </div>}

        {/* TABLE */}
        {tab!=="week" && tab!=="banned" && groups.length>0 && (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {COLS.map((c,i)=>(
                    <th key={i} style={S.th} onClick={()=>handleSort(c.col)}>
                      <span style={{display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                        {c.label}<SortIcon active={sortCol===c.col} dir={sortDir}/>
                      </span>
                    </th>
                  ))}
                  <th style={{...S.th, color:"var(--muted)", cursor:"default"}}>Коментар</th>
                  {tab==="yesterday" && <th style={{...S.th, color:"var(--muted)", cursor:"default"}}>Instal</th>}
                  <th style={{...S.th, cursor:"default", width:70}}></th>
                </tr>
              </thead>
              <tbody>
                {groups.filter(g=>accountStatus[g.name]!=="banned" && labels[g.name]?.manualBan!=="1" && labels[g.name]?.deleted!=="1").map(g=>(
                  <AccountGroup key={g.name} group={g} tab={tab} labels={labels} setLabel={setLabel}
                    collapsed={collapsedSet.has(g.name)} onToggle={()=>toggleCollapse(g.name)}
                    colCount={COLS.length} accSt={accountStatus[g.name]||"ok"} />
                ))}
              </tbody>
            </table>
            {!loading&&filtered.length===0&&<div style={S.empty}><div style={{fontSize:40,marginBottom:12}}>🔍</div><div>Нічого не знайдено.</div></div>}
            {loading&&rows.length===0&&<div style={S.empty}><Spinner/><div style={{marginTop:12,color:"var(--muted)"}}>Завантаження…</div></div>}
          </div>
        )}
      </div>
    </>
  );
}

function AccountGroup({ group, tab, collapsed, onToggle, colCount, labels, setLabel, accSt }) {
  const rows   = group.rows;
  const accountId = group.name; // raw account ID as storage key
  const lbl    = labels?.[accountId] || {};
  const spendY = rows.reduce((s,r)=>s+n(r[C.spendY]),   0);
  const spendT = rows.reduce((s,r)=>s+n(r[C.spendT]),   0);
  const impY   = rows.reduce((s,r)=>s+ni(r[C.impY]),    0);
  const impT   = rows.reduce((s,r)=>s+ni(r[C.impT]),    0);
  const clicks = rows.reduce((s,r)=>s+ni(r[C.clicksY]), 0);
  const conv   = rows.reduce((s,r)=>s+ni(r[C.conv]),    0);
  const convT  = rows.reduce((s,r)=>s+ni(r[C.convT]),   0);
  const budget = rows.reduce((s,r)=>s+n(r[C.budget]),   0);
  const month  = rows.reduce((s,r)=>s+n(r[C.monthSpend]),0);
  const pol      = rows.filter(r=>ni(r[C.policyN])>0).length;
  const active   = rows.filter(r=>ni(r[C.impT])>0 || String(r[C.status]).includes("крутить")).length;
  // Check new launch: exclude Video views, check if remaining campaigns have any impressions
  const nonVideoRows = rows.filter(r => !String(r[C.campaign]).toLowerCase().includes("video views"));
  const hasImpNonVideo = nonVideoRows.some(r => ni(r[C.impY]) > 0 || ni(r[C.impT]) > 0);
  const isNewLaunch = nonVideoRows.length > 0 && !hasImpNonVideo;
  const ctr      = impY>0?(clicks/impY)*100:0;
  const cpc      = clicks>0?spendY/clicks:0;
  const cpm      = impY>0?(spendY/impY)*1000:0;
  // First non-empty geo and domain in the group
  const geoVal   = rows.map(r=>String(r[C.geo]||"")).find(v=>v&&v!=="—") || "—";
  const domainVal= rows.map(r=>String(r[C.domain]||"")).find(v=>v&&v!=="—") || "—";

  // Arrow toggle cell
  const arrowCell = (
    <td style={{...S.td, paddingLeft:10, whiteSpace:"nowrap", cursor:"pointer", minWidth:160}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:11,color:"var(--accent)",display:"inline-block",transform:collapsed?"rotate(-90deg)":"rotate(0deg)",transition:"transform .2s",flexShrink:0}}>▼</span>
        <EditableCell
          value={lbl.name || ""}
          placeholder={group.displayName}
          onSave={v => setLabel(accountId, "name", v)}
          bold
        />
        <span style={{fontSize:10,color:"var(--muted)",flexShrink:0}}>{rows.length}</span>
        {isNewLaunch && (
          <span style={{background:"rgba(59,130,246,.2)",color:"var(--blue)",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20,flexShrink:0,whiteSpace:"nowrap"}}>
            🚀 Новий
          </span>
        )}
        {accSt==="stale" && (
          <span style={{background:"rgba(239,68,68,.2)",color:"var(--red)",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20,flexShrink:0,whiteSpace:"nowrap"}}>
            🚫 БАН
          </span>
        )}
        {accSt==="no_imp" && (
          <span style={{background:"rgba(245,158,11,.2)",color:"var(--yellow)",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20,flexShrink:0,whiteSpace:"nowrap"}}>
            ⚠ Перевірити
          </span>
        )}
      </div>
    </td>
  );

  // Ban button cell (last column, summary rows only)
  const banCell = (
    <td style={{...S.td, width:70}} onClick={e=>e.stopPropagation()}>
      <button
        onClick={()=>setLabel(accountId,"manualBan","1")}
        title="Перенести в БАН вручну"
        style={{background:"rgba(239,68,68,.12)",color:"var(--red)",border:"1px solid rgba(239,68,68,.25)",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}
      >В БАН</button>
    </td>
  );

  // Comment cell
  const commentCell = (
    <td style={{...S.td, minWidth:180}} onClick={e=>e.stopPropagation()}>
      <EditableCell
        value={lbl.comment || ""}
        placeholder="+ коментар…"
        onSave={v => setLabel(accountId, "comment", v)}
        muted
      />
    </td>
  );

  // Instal cell — numeric input with OK button
  const instalVal  = parseInt(lbl.instal) || 0;
  const instalPct  = conv > 0 && instalVal > 0 ? fmtPct(instalVal / conv * 100) : null;
  const instalCpi  = instalVal > 0 && spendY > 0 ? fmt2(spendY / instalVal) : null;
  const instalCell = (
    <td style={{...S.td, minWidth:140}} onClick={e=>e.stopPropagation()}>
      <InstalCell
        value={lbl.instal || ""}
        onSave={v => setLabel(accountId, "instal", v)}
        pct={instalPct}
        cpi={instalCpi}
      />
    </td>
  );

  const rowBg = accSt==="stale" ? "rgba(239,68,68,.08)" : accSt==="no_imp" ? "rgba(245,158,11,.07)" : "var(--bg3)";

  // Summary row for YESTERDAY tab
  if (tab==="yesterday") {
    return (
      <>
        <tr style={{...S.tr, background:rowBg, cursor:"pointer"}} onClick={onToggle}>
          {arrowCell}
          <td style={S.td}></td>{/* крео */}
          <td style={S.td}></td>{/* тип */}
          <td style={S.td}>
            <span style={{fontSize:11,color:"var(--green)"}}>{active} актив.</span>
          </td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>${fmt2(budget)}</span></td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",fontWeight:700,color:"var(--text)",fontVariantNumeric:"tabular-nums"}}>${fmt2(spendY)}</span></td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtN(impY)}</span></td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtN(clicks)}</span></td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",fontWeight:600,color:ctr>=3?"var(--green)":ctr>=1?"var(--yellow)":"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtPct(ctr)}</span></td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{cpc>0?"$"+fmt2(cpc):"—"}</span></td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{cpm>0?"$"+fmt2(cpm):"—"}</span></td>
          <td style={S.td}><span style={{display:"block",textAlign:"right",color:conv>0?"var(--yellow)":"var(--muted)",fontWeight:conv>0?600:400,fontVariantNumeric:"tabular-nums"}}>{fmtN(conv)}</span></td>
          <td style={S.td}>
            {pol>0
              ? <span style={{color:"var(--red)",fontWeight:700}}>⚠ {pol}</span>
              : <span style={{color:"var(--green)"}}>✓</span>}
          </td>
          <td style={S.td}><span style={{color:"var(--muted2)",fontSize:12}}>{geoVal}</span></td>
          <td style={S.td}><span style={{color:"var(--blue)",fontWeight:500,fontSize:12}}>{domainVal}</span></td>
          {commentCell}
          {instalCell}
          {banCell}
        </tr>
        {!collapsed&&rows.map((row,i)=>(
          <tr key={i} style={S.tr}>
            {COLS_YESTERDAY.map((c,j)=><td key={j} style={S.td}>{c.render(row)}</td>)}
            <td style={S.td}></td>{/* comment spacer */}
            <td style={S.td}></td>{/* instal spacer */}
            <td style={S.td}></td>{/* ban spacer */}
          </tr>
        ))}
      </>
    );
  }

  // Summary row for TODAY tab
  return (
    <>
      <tr style={{...S.tr, background:rowBg, cursor:"pointer"}} onClick={onToggle}>
        {arrowCell}
        <td style={S.td}></td>{/* крео */}
        <td style={S.td}></td>{/* тип */}
        <td style={S.td}>
          <span style={{fontSize:11,color:"var(--green)"}}>{active} актив.</span>
        </td>
        <td style={S.td}>
          {impT>0
            ? <span style={{color:"var(--green)",fontWeight:700}}>✓ Так</span>
            : spendT>0
              ? <span style={{color:"var(--yellow)",fontWeight:600}}>⏳ Розганяє</span>
              : <span style={{color:"var(--muted)"}}>✗ Немає</span>}
        </td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>${fmt2(budget)}</span></td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",fontWeight:700,color:"var(--accent)",fontVariantNumeric:"tabular-nums"}}>${fmt2(spendT)}</span></td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtN(impT)}</span></td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",color:convT>0?"var(--yellow)":"var(--muted)",fontWeight:convT>0?600:400,fontVariantNumeric:"tabular-nums"}}>{fmtN(convT)}</span></td>{/* DL сьогодні */}
        <td style={S.td}>
          {pol>0
            ? <span style={{color:"var(--red)",fontWeight:700}}>⚠ {pol}</span>
            : <span style={{color:"var(--green)"}}>✓</span>}
        </td>
        <td style={S.td}><TrafficDot st={accSt} /></td>
        <td style={S.td}><span style={{color:"var(--muted2)",fontSize:12}}>{geoVal}</span></td>
        <td style={S.td}><span style={{color:"var(--blue)",fontWeight:500,fontSize:12}}>{domainVal}</span></td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>${fmt2(month)}</span></td>
        {commentCell}
        {banCell}
      </tr>
      {!collapsed&&rows.map((row,i)=>(
        <tr key={i} style={S.tr}>
          {COLS_TODAY.map((c,j)=><td key={j} style={S.td}>{c.render(row)}</td>)}
          <td style={S.td}></td>{/* comment spacer */}
          <td style={S.td}></td>{/* ban spacer */}
        </tr>
      ))}
    </>
  );
}

// ── Chart
function SpendChart({ data }) {
  const [hover, setHover] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t); }, []);

  const W = 800, H = 180;
  const PAD = { top: 20, right: 20, bottom: 36, left: 56 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.map(d => d.spend), 0.01);
  const n = data.length;
  const bW = iW / n;

  const xOf = i => PAD.left + i * bW + bW / 2;
  const yOf = v => PAD.top + iH - (v / max) * iH;

  // Line path
  const linePts = data.map((d, i) => `${xOf(i)},${yOf(d.spend)}`).join(" L ");
  const linePath = `M ${linePts}`;

  // Area path (for gradient fill under the line)
  const areaPath = `M ${xOf(0)},${yOf(0)} L ${linePts} L ${xOf(n-1)},${yOf(0)} Z`;

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    v: max * t,
    y: yOf(max * t),
    label: max * t >= 1000 ? `$${(max * t / 1000).toFixed(1)}k` : `$${fmt2(max * t)}`,
  }));

  const hovered = hover !== null ? data[hover] : null;
  const tooltipX = hover !== null ? xOf(hover) : 0;
  const tooltipY = hover !== null ? yOf(data[hover].spend) : 0;
  const tipLeft = tooltipX > W * 0.75;

  return (
    <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", minWidth: 400, height: 180, display: "block", overflow: "visible" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00e5b4" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00e5b4" stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect
              x={PAD.left} y={PAD.top}
              width={ready ? iW : 0} height={iH}
              style={{ transition: "width 0.9s cubic-bezier(.4,0,.2,1)" }}
            />
          </clipPath>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
              stroke={i === 0 ? "#2a3347" : "#1a2235"} strokeWidth={i === 0 ? 1 : 0.5} strokeDasharray={i > 0 ? "3,4" : "0"} />
            <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#475569" fontFamily="monospace">{t.label}</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#spendGrad)" clipPath="url(#chartClip)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#00e5b4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          clipPath="url(#chartClip)" filter="url(#glow)"
          style={{ transition: "opacity .3s" }} />

        {/* X-axis labels */}
        {data.map((d, i) => {
          const show = n <= 14 || i % Math.ceil(n / 12) === 0;
          if (!show) return null;
          return (
            <text key={i} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#475569"
              transform={`rotate(-35,${xOf(i)},${H - 8})`}>
              {d.date.slice(5)}
            </text>
          );
        })}

        {/* Hover areas + dots */}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={xOf(i) - bW / 2} y={PAD.top} width={bW} height={iH}
              fill="transparent" style={{ cursor: "crosshair" }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            {hover === i && (
              <>
                <line x1={xOf(i)} y1={PAD.top} x2={xOf(i)} y2={PAD.top + iH}
                  stroke="#00e5b4" strokeWidth="0.8" strokeDasharray="3,3" strokeOpacity="0.5" />
                <circle cx={xOf(i)} cy={yOf(d.spend)} r="5"
                  fill="#00e5b4" stroke="#0b0e16" strokeWidth="2" filter="url(#glow)" />
              </>
            )}
          </g>
        ))}

        {/* Tooltip */}
        {hovered && (
          <g transform={`translate(${tipLeft ? tooltipX - 86 : tooltipX + 8},${Math.max(PAD.top, tooltipY - 28)})`}>
            <rect width="78" height="34" rx="6" fill="#0f1623" stroke="#00e5b4" strokeWidth="0.8" strokeOpacity="0.6" />
            <text x="39" y="13" textAnchor="middle" fontSize="11" fill="#00e5b4" fontWeight="bold" fontFamily="monospace">
              ${fmt2(hovered.spend)}
            </text>
            <text x="39" y="26" textAnchor="middle" fontSize="9" fill="#64748b">{hovered.date}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ── UI atoms
function KpiCard({label,value,color,sub,onClick,active}){
  const colors={accent:"var(--accent)",blue:"var(--blue)",purple:"var(--purple)",red:"var(--red)",yellow:"var(--yellow)",green:"var(--green)",muted:"var(--muted)"};
  return(
    <div
      style={{...S.kpiCard, ...(onClick?{cursor:"pointer",userSelect:"none"}:{}), ...(active?{border:"1px solid var(--red)",background:"rgba(239,68,68,.08)"}:{})}}
      onClick={onClick}
      title={onClick?"Клікни для фільтрації":""}
    >
      <div style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>{label}{onClick&&<span style={{opacity:.5,marginLeft:4,fontSize:10}}>▼</span>}</div>
      <div style={{fontSize:26,fontWeight:700,lineHeight:1,color:colors[color]||"var(--text)"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{sub}</div>}
    </div>
  );
}
function FGroup({label,children}){
  return <div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".5px"}}>{label}</label>{children}</div>;
}
function Money({v,bold,accent,digits=2}){
  const val=parseFloat(v)||0;
  if(!val) return <span style={{color:"var(--muted)",textAlign:"right",display:"block"}}>—</span>;
  const color=accent?"var(--accent)":bold?"var(--text)":"var(--muted2)";
  return <span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color}}>${digits===3?fmt3(val):fmt2(val)}</span>;
}
function Num({v,yellow}){
  const val=parseInt(v)||0;
  if(!val) return <span style={{color:"var(--muted)",textAlign:"right",display:"block"}}>0</span>;
  return <span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color:yellow?"var(--yellow)":undefined}}>{fmtN(val)}</span>;
}
function CTRCell({clicks,imp}){
  const c=ni(clicks),m=ni(imp);
  if(!m) return <span style={{color:"var(--muted)",textAlign:"right",display:"block"}}>—</span>;
  const ctr=(c/m)*100;
  const color=ctr>=3?"var(--green)":ctr>=1?"var(--yellow)":"var(--muted2)";
  return <span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color}}>{fmtPct(ctr)}</span>;
}
function CPMCell({spend,imp}){
  const s=n(spend),m=ni(imp);
  if(!m||!s) return <span style={{color:"var(--muted)",textAlign:"right",display:"block"}}>—</span>;
  return <span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"var(--muted2)"}}>${fmt2((s/m)*1000)}</span>;
}
function Ellipsis({v,w,muted}){
  const s=String(v||"—");
  return <span title={s} style={{display:"block",maxWidth:w,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:muted?"var(--muted2)":undefined}}>{s}</span>;
}
function Badge({v,color}){
  const bg={blue:"rgba(59,130,246,.15)",green:"rgba(16,185,129,.15)",yellow:"rgba(245,158,11,.15)",red:"rgba(239,68,68,.15)",muted:"rgba(100,116,139,.15)"};
  const col={blue:"var(--blue)",green:"var(--green)",yellow:"var(--yellow)",red:"var(--red)",muted:"var(--muted)"};
  return <span style={{background:bg[color]||bg.muted,color:col[color]||col.muted,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{v||"—"}</span>;
}
function StatusBadge({v}){
  const s=String(v||""); let color="muted";
  if(s.includes("крутить")&&!s.includes("обмеж")) color="green";
  else if(s.includes("обмежена")) color="yellow";
  else if(s.includes("Призупинено")||s.includes("Видалена")) color="red";
  else if(s.includes("модерації")) color="blue";
  return <Badge v={s} color={color}/>;
}
function PolicyCell({n:cnt,d}){
  const count=parseInt(cnt)||0;
  if(!count) return <span style={{color:"var(--green)"}}>✓ OK</span>;
  return <span title={String(d)} style={{color:String(d).includes("Дизапрув")?"var(--red)":"var(--yellow)",fontWeight:600,cursor:"help"}}>⚠ {count}</span>;
}
function ServingCell({status,policyS,policyN,impT,impY}){
  const s=String(status||"");
  // Policy running despite ban — critical
  if(parseInt(policyN)>0&&String(policyS).includes("ТАК"))
    return <span style={{color:"var(--red)",fontWeight:700}}>🔴 Policy!</span>;
  // Hard stops
  if(s.includes("Пауза"))       return <span style={{color:"var(--muted)"}}>⏸ Пауза</span>;
  if(s.includes("Призупинено")) return <span style={{color:"var(--red)"}}>🚫 Стоп</span>;
  // Primary: impressions = running
  if(parseInt(impT)>0) return <span style={{color:"var(--green)",fontWeight:700}}>✓ Так</span>;
  if(parseInt(impY)>0) return <span style={{color:"var(--green)",fontWeight:700}}>✓ Так</span>;
  // Budget limited
  if(s.includes("обмежена")) return <span style={{color:"var(--yellow)",fontWeight:600}}>⚡ Обмежена</span>;
  // Active but no impressions yet today
  if(s.includes("крутить")) return <span style={{color:"var(--yellow)",fontWeight:600}}>⏳ Немає показів</span>;
  return <span style={{color:"var(--muted)"}}>—</span>;
}
function SortIcon({active,dir}){
  if(!active) return <span style={{opacity:.25,fontSize:10}}>↕</span>;
  return <span style={{opacity:1,fontSize:10,color:"var(--accent)"}}>{dir===1?"↑":"↓"}</span>;
}
function Spinner(){
  return <div style={{width:36,height:36,border:"3px solid var(--bg4)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto"}}/>;
}

function AccStatusCell({ v, p }) {
  const acc = String(v||"");
  const pay = String(p||"");
  const isBan = acc.includes("БАН");
  const isPay = pay.includes("Проблема");
  if (!isBan && !isPay) return <span style={{color:"var(--green)",fontSize:12}}>✓ OK</span>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      {isBan && <span style={{color:"var(--red)",fontWeight:700,fontSize:11}}>🚫 {acc}</span>}
      {isPay && <span style={{color:"var(--yellow)",fontWeight:600,fontSize:11}}>💳 {pay}</span>}
    </div>
  );
}

function TrafficDot({ st }) {
  if (st === "stale") return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <span style={{width:10,height:10,borderRadius:"50%",background:"var(--red)",flexShrink:0,boxShadow:"0 0 6px var(--red)"}}/>
      <span style={{fontSize:11,color:"var(--red)",fontWeight:700}}>БАН</span>
    </div>
  );
  if (st === "no_imp") return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <span style={{width:10,height:10,borderRadius:"50%",background:"var(--yellow)",flexShrink:0,boxShadow:"0 0 6px var(--yellow)"}}/>
      <span style={{fontSize:11,color:"var(--yellow)",fontWeight:600}}>Немає трафіку</span>
    </div>
  );
  if (st === "zero") return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <span style={{width:10,height:10,borderRadius:"50%",background:"var(--blue)",flexShrink:0,boxShadow:"0 0 6px var(--blue)"}}/>
      <span style={{fontSize:11,color:"var(--blue)",fontWeight:600}}>Пуск</span>
    </div>
  );
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <span style={{width:10,height:10,borderRadius:"50%",background:"var(--green)",flexShrink:0,boxShadow:"0 0 6px var(--green)"}}/>
      <span style={{fontSize:11,color:"var(--green)",fontWeight:600}}>Трафік є</span>
    </div>
  );
}

function InstalCell({ value, onSave, pct, cpi }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");

  const displayVal = parseInt(value) || 0;

  function startEdit(e) {
    e.stopPropagation();
    setDraft(value || "");
    setEditing(true);
  }

  function commit(e) {
    if (e) e.stopPropagation();
    const v = String(draft).trim();
    onSave(v);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:3,minWidth:120}} onClick={e=>e.stopPropagation()}>
        <span
          onClick={startEdit}
          title="Клікни щоб редагувати"
          style={{
            display:"inline-block", cursor:"text", minWidth:60,
            color: displayVal > 0 ? "var(--green)" : "var(--border)",
            fontWeight: displayVal > 0 ? 700 : 400,
            fontSize: displayVal > 0 ? 15 : 13,
            borderBottom: displayVal > 0 ? "none" : "1px dashed var(--border)",
            fontVariantNumeric:"tabular-nums",
          }}
        >
          {displayVal > 0 ? fmtN(displayVal) : "+ instal"}
        </span>
        {pct && <span style={{fontSize:11,color:"var(--green)",fontWeight:600}}>{pct} від DL</span>}
        {cpi && <span style={{fontSize:11,color:"var(--accent)",fontWeight:600}}>CPI ${cpi}</span>}
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:3,minWidth:120}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        <input
          autoFocus
          type="number"
          min="0"
          value={draft}
          placeholder="0"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter") commit(); if (e.key==="Escape") setEditing(false); }}
          onBlur={commit}
          style={{
            background:"var(--bg3)", border:"1px solid var(--accent)", color:"var(--text)",
            borderRadius:6, padding:"4px 8px", fontSize:13, outline:"none",
            width:70, fontVariantNumeric:"tabular-nums",
          }}
        />
        <button
          onMouseDown={e => { e.preventDefault(); commit(e); }}
          style={{background:"var(--green)",color:"#000",border:"none",borderRadius:6,padding:"4px 10px",fontWeight:700,cursor:"pointer",fontSize:12}}
        >OK</button>
      </div>
      {pct && <span style={{fontSize:11,color:"var(--green)",fontWeight:600}}>{pct} від DL</span>}
      {cpi && <span style={{fontSize:11,color:"var(--accent)",fontWeight:600}}>CPI ${cpi}</span>}
    </div>
  );
}

function EditableCell({ value, placeholder, onSave, bold, muted }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key==="Enter") commit(); if (e.key==="Escape") { setDraft(value); setEditing(false); } }}
        onClick={e => e.stopPropagation()}
        style={{
          background:"var(--bg4)", border:"1px solid var(--accent)", color:"var(--text)",
          borderRadius:5, padding:"3px 7px", fontSize:13, outline:"none",
          width:"100%", minWidth:120, fontWeight: bold ? 700 : 400,
        }}
      />
    );
  }

  const hasVal = value && value.trim();
  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title="Клікни щоб редагувати"
      style={{
        display:"block", cursor:"text", minWidth:hasVal ? "auto" : 90,
        color: hasVal ? (bold ? "var(--text)" : "var(--muted2)") : "var(--border)",
        fontWeight: bold && hasVal ? 700 : 400,
        fontSize: 13,
        padding:"2px 0",
        borderBottom: hasVal ? "none" : "1px dashed var(--border)",
      }}
    >
      {hasVal ? value : placeholder}
    </span>
  );
}

const S={
  page:      {padding:"20px 24px 60px",maxWidth:1900,margin:"0 auto"},
  header:    {display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12},
  logo:      {width:40,height:40,background:"rgba(0,229,180,.12)",border:"1px solid rgba(0,229,180,.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20},
  btn:       {background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,cursor:"pointer",fontSize:13},
  smallBtn:  {background:"var(--bg3)",color:"var(--muted2)",border:"1px solid var(--border)",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12},
  errorBox:  {background:"rgba(239,68,68,.1)",border:"1px solid var(--red)",borderRadius:8,padding:"12px 16px",color:"var(--red)",marginBottom:20,fontSize:13},
  tabs:      {display:"flex",gap:8,marginBottom:20},
  tab:       {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 24px",cursor:"pointer",fontSize:14,fontWeight:600,color:"var(--muted2)",display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all .15s",minWidth:160},
  tabActive: {background:"rgba(0,229,180,.1)",border:"1px solid var(--accent)",color:"var(--accent)"},
  tabDate:   {fontSize:11,fontWeight:400,color:"var(--muted)"},
  kpiGrid:   {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12,marginBottom:20},
  kpiCard:   {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:"14px 16px"},
  chartBox:  {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:"16px 20px",marginBottom:20},
  filterBox: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:"16px",marginBottom:16},
  filterRow: {display:"flex",flexWrap:"wrap",gap:12,alignItems:"flex-end"},
  inp:       {background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none",minWidth:140},
  sel:       {background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none",minWidth:150,cursor:"pointer"},
  resultsBar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8},
  tableWrap: {overflowX:"auto",borderRadius:"var(--r)",border:"1px solid var(--border)"},
  table:     {width:"100%",borderCollapse:"collapse"},
  th:        {background:"#0b0e16",color:"var(--accent)",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",padding:"11px 12px",textAlign:"left",whiteSpace:"nowrap",position:"sticky",top:0,zIndex:2,borderBottom:"1px solid var(--border)",cursor:"pointer"},
  groupHeader:     {cursor:"pointer",userSelect:"none"},
  groupHeaderCell: {background:"var(--bg3)",borderTop:"2px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"11px 14px"},
  gs:              {fontSize:12,color:"var(--muted2)"},
  tr:        {borderBottom:"1px solid var(--border)"},
  td:        {padding:"10px 12px",fontSize:13,verticalAlign:"middle"},
  empty:     {textAlign:"center",padding:"60px 20px",color:"var(--muted)"},
};
