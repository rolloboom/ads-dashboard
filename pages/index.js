import { useState, useEffect, useMemo, useCallback } from "react";
import Head from "next/head";

const C = {
  date: 0, time: 1, company: 2, accountId: 3, currency: 4,
  campaign: 5, creo: 6, type: 7, status: 8, budget: 9,
  spendY: 10, spendT: 11, impY: 12, impT: 13, clicksY: 14,
  cpc: 15, conv: 16, policyN: 17, policyD: 18, policyS: 19,
  geo: 20, domain: 21, monthSpend: 22,
};

const n   = v => parseFloat(v) || 0;
const ni  = v => parseInt(v)   || 0;
const fmt2  = v => n(v).toLocaleString("uk-UA", { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmt3  = v => n(v).toFixed(3);
const fmtN  = v => ni(v).toLocaleString("uk-UA");
const fmtDate = d => { const dt = new Date(); dt.setDate(dt.getDate()+d); return dt.toISOString().slice(0,10); };
const unique  = (rows, idx) => [...new Set(rows.map(r=>r[idx]).filter(Boolean))].sort();

const COLS = [
  { label:"Кампанія",         col:C.campaign,   render: r => <Ellipsis v={r[C.campaign]} w={220} /> },
  { label:"Крео",             col:C.creo,       render: r => <Ellipsis v={r[C.creo]} w={150} muted /> },
  { label:"Тип",              col:C.type,       render: r => <Badge v={r[C.type]} color="blue" /> },
  { label:"Статус",           col:C.status,     render: r => <StatusBadge v={r[C.status]} /> },
  { label:"Крутить?",         col:C.status,     render: r => <ServingCell status={r[C.status]} policyS={r[C.policyS]} policyN={r[C.policyN]} /> },
  { label:"Бюджет $",         col:C.budget,     render: r => <Money v={r[C.budget]} /> },
  { label:"Витр. вчора $",    col:C.spendY,     render: r => <Money v={r[C.spendY]} bold /> },
  { label:"Витр. сьогодні $", col:C.spendT,     render: r => <Money v={r[C.spendT]} accent /> },
  { label:"Покази вч.",       col:C.impY,       render: r => <Num v={r[C.impY]} /> },
  { label:"Покази сьог.",     col:C.impT,       render: r => <Num v={r[C.impT]} /> },
  { label:"Кліки вч.",        col:C.clicksY,    render: r => <Num v={r[C.clicksY]} /> },
  { label:"CPC $",            col:C.cpc,        render: r => <Money v={r[C.cpc]} digits={3} /> },
  { label:"Downloads",        col:C.conv,       render: r => <Num v={r[C.conv]} yellow /> },
  { label:"Policy",           col:C.policyN,    render: r => <PolicyCell n={r[C.policyN]} d={r[C.policyD]} /> },
  { label:"Гео",              col:C.geo,        render: r => <Ellipsis v={r[C.geo]} w={160} muted /> },
  { label:"Домен",            col:C.domain,     render: r => <span style={{color:"var(--blue)",fontWeight:500}}>{r[C.domain]||"—"}</span> },
  { label:"Місяць $",         col:C.monthSpend, render: r => <Money v={r[C.monthSpend]} /> },
];

export default function Dashboard() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [updated, setUpdated] = useState(null);

  // collapsed accounts: Set of company names
  const [collapsed, setCollapsed] = useState(new Set());

  // filters
  const [dateFrom, setDateFrom] = useState(fmtDate(-7));
  const [dateTo,   setDateTo]   = useState(fmtDate(0));
  const [company,  setCompany]  = useState("");
  const [status,   setStatus]   = useState("");
  const [policyF,  setPolicyF]  = useState("");
  const [typeF,    setTypeF]    = useState("");
  const [domain,   setDomain]   = useState("");
  const [search,   setSearch]   = useState("");

  // sorting
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(-1);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/data");
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      // Dedup: keep only the latest row per campaign
      const map = {};
      (j.rows || []).forEach(row => {
        const key = String(row[C.company]) + "||" + String(row[C.campaign]);
        const ts  = String(row[C.date]) + " " + String(row[C.time]);
        if (!map[key] || ts > map[key].ts) map[key] = { row, ts };
      });
      setRows(Object.values(map).map(x => x.row));
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

  // Group by company, sorted within each group
  const groups = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const key = String(r[C.company] || "—");
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    const sortFn = sortCol !== null ? (a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      const isNum = [C.budget,C.spendY,C.spendT,C.impY,C.impT,C.clicksY,C.cpc,C.conv,C.policyN,C.monthSpend].includes(sortCol);
      if (isNum) { av = n(av); bv = n(bv); }
      else       { av = String(av||"").toLowerCase(); bv = String(bv||"").toLowerCase(); }
      return av < bv ? sortDir : av > bv ? -sortDir : 0;
    } : null;
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).map(([name, rows]) => ({
      name,
      rows: sortFn ? [...rows].sort(sortFn) : rows,
    }));
  }, [filtered, sortCol, sortDir]);

  // Global KPI
  const kpi = useMemo(() => {
    const spendY   = filtered.reduce((s,r) => s+n(r[C.spendY]),   0);
    const spendT   = filtered.reduce((s,r) => s+n(r[C.spendT]),   0);
    const month    = filtered.reduce((s,r) => s+n(r[C.monthSpend]),0);
    const downloads= filtered.reduce((s,r) => s+n(r[C.conv]),     0);
    const clicks   = filtered.reduce((s,r) => s+ni(r[C.clicksY]), 0);
    const active   = filtered.filter(r => String(r[C.status]).includes("крутить")).length;
    const polIssue = filtered.filter(r => ni(r[C.policyN]) > 0).length;
    const cpa      = downloads > 0 ? spendY/downloads : 0;
    return { spendY, spendT, month, downloads, clicks, active, total:filtered.length, polIssue, cpa };
  }, [filtered]);

  function toggleCollapse(name) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }
  function collapseAll()  { setCollapsed(new Set(groups.map(g=>g.name))); }
  function expandAll()    { setCollapsed(new Set()); }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(-1); }
  }

  function resetFilters() {
    setDateFrom(fmtDate(-7)); setDateTo(fmtDate(0));
    setCompany(""); setStatus(""); setPolicyF(""); setTypeF(""); setDomain(""); setSearch("");
  }

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
              {loading ? "⟳ Завантаження…" : "↺ Оновити"}
            </button>
          </div>
        </header>

        {error && <div style={S.errorBox}>⚠ {error}. Перевір API ключ у Vercel → Environment Variables.</div>}

        {/* KPI */}
        <div style={S.kpiGrid}>
          <KpiCard label="Витрати вчора"    value={"$"+fmt2(kpi.spendY)}  color="accent" sub={`${kpi.total} кампаній`} />
          <KpiCard label="Витрати сьогодні" value={"$"+fmt2(kpi.spendT)}  color="blue"   sub="поточний день" />
          <KpiCard label="Витрати місяця"   value={"$"+fmt2(kpi.month)}   color="purple" sub="цього місяця" />
          <KpiCard label="Активних"         value={kpi.active}            color="green"  sub={`з ${kpi.total} кампаній`} />
          <KpiCard label="Policy проблем"   value={kpi.polIssue}          color={kpi.polIssue>0?"red":"green"} sub="кампаній з проблемами" />
          <KpiCard label="Downloads"        value={fmtN(kpi.downloads)}   color="yellow" sub="конверсій вчора" />
          <KpiCard label="Кліки вчора"      value={fmtN(kpi.clicks)}      color="blue"   sub="" />
          <KpiCard label="CPA"              value={kpi.cpa>0?"$"+fmt2(kpi.cpa):"—"} color="accent" sub="вартість конверсії" />
        </div>

        {/* FILTERS */}
        <div style={S.filterBox}>
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
              <input
                style={{...S.inp,minWidth:220}}
                placeholder="Кампанія, крео, домен…"
                value={search}
                onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&null}
              />
            </FGroup>
            <FGroup label=" ">
              <button style={{...S.btn,background:"var(--bg4)",color:"var(--muted2)",border:"1px solid var(--border)"}} onClick={resetFilters}>
                Скинути
              </button>
            </FGroup>
          </div>
        </div>

        {/* RESULTS + EXPAND/COLLAPSE */}
        <div style={S.resultsBar}>
          <span style={{color:"var(--muted)",fontSize:12}}>
            {loading ? "Завантаження…" : `${filtered.length} кампаній · ${groups.length} акаунтів`}
          </span>
          <div style={{display:"flex",gap:8}}>
            <button style={S.smallBtn} onClick={expandAll}>Розкрити всі</button>
            <button style={S.smallBtn} onClick={collapseAll}>Згорнути всі</button>
            <span style={{color:"var(--muted)",fontSize:11,alignSelf:"center"}}>↑↓ клік по заголовку — сортування</span>
          </div>
        </div>

        {/* TABLE HEADER (sticky, shared across all groups) */}
        {groups.length > 0 && (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {COLS.map((c,i)=>(
                    <th key={i} style={S.th} onClick={()=>handleSort(c.col)}>
                      <span style={{display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                        {c.label}
                        <SortIcon active={sortCol===c.col} dir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <AccountGroup
                    key={group.name}
                    group={group}
                    collapsed={collapsed.has(group.name)}
                    onToggle={()=>toggleCollapse(group.name)}
                    colCount={COLS.length}
                  />
                ))}
              </tbody>
            </table>

            {!loading && filtered.length === 0 && (
              <div style={S.empty}>
                <div style={{fontSize:40,marginBottom:12}}>🔍</div>
                <div>Нічого не знайдено. Спробуй змінити фільтри.</div>
              </div>
            )}
            {loading && rows.length === 0 && (
              <div style={S.empty}>
                <Spinner />
                <div style={{marginTop:12,color:"var(--muted)"}}>Завантаження даних…</div>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}

// ── Account group with collapsible rows
function AccountGroup({ group, collapsed, onToggle, colCount }) {
  const rows      = group.rows;
  const spendY    = rows.reduce((s,r)=>s+n(r[C.spendY]),   0);
  const spendT    = rows.reduce((s,r)=>s+n(r[C.spendT]),   0);
  const conv      = rows.reduce((s,r)=>s+ni(r[C.conv]),    0);
  const active    = rows.filter(r=>String(r[C.status]).includes("крутить")).length;
  const polIssues = rows.filter(r=>ni(r[C.policyN])>0).length;
  const currency  = rows[0]?.[C.currency] || "$";

  return (
    <>
      {/* Group header row */}
      <tr style={S.groupHeader} onClick={onToggle}>
        <td colSpan={colCount} style={S.groupHeaderCell}>
          <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
            {/* Arrow */}
            <span style={{fontSize:13,color:"var(--accent)",transition:"transform .2s",display:"inline-block",transform:collapsed?"rotate(-90deg)":"rotate(0deg)"}}>▼</span>
            {/* Account name */}
            <span style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>{group.name}</span>
            {/* Mini stats */}
            <span style={S.groupStat}>{rows.length} кампаній</span>
            <span style={S.groupStat}>
              <span style={{color:"var(--muted2)"}}>Вчора: </span>
              <span style={{color:"var(--text)",fontWeight:600}}>${fmt2(spendY)}</span>
            </span>
            <span style={S.groupStat}>
              <span style={{color:"var(--muted2)"}}>Сьогодні: </span>
              <span style={{color:"var(--accent)",fontWeight:600}}>${fmt2(spendT)}</span>
            </span>
            <span style={S.groupStat}>
              <span style={{color:"var(--muted2)"}}>Активних: </span>
              <span style={{color:"var(--green)",fontWeight:600}}>{active}</span>
            </span>
            {conv > 0 && (
              <span style={S.groupStat}>
                <span style={{color:"var(--muted2)"}}>Downloads: </span>
                <span style={{color:"var(--yellow)",fontWeight:600}}>{fmtN(conv)}</span>
              </span>
            )}
            {polIssues > 0 && (
              <span style={{...S.groupStat,background:"rgba(239,68,68,.12)",color:"var(--red)",padding:"2px 10px",borderRadius:20,fontWeight:700}}>
                ⚠ Policy: {polIssues}
              </span>
            )}
          </div>
        </td>
      </tr>
      {/* Campaign rows */}
      {!collapsed && rows.map((row, i) => (
        <tr key={i} style={S.tr}>
          {COLS.map((c,j) => <td key={j} style={S.td}>{c.render(row)}</td>)}
        </tr>
      ))}
    </>
  );
}

// ── UI components

function KpiCard({ label, value, color, sub }) {
  const colors = { accent:"var(--accent)", blue:"var(--blue)", purple:"var(--purple)", red:"var(--red)", yellow:"var(--yellow)", green:"var(--green)" };
  return (
    <div style={S.kpiCard}>
      <div style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>{label}</div>
      <div style={{fontSize:28,fontWeight:700,lineHeight:1,color:colors[color]||"var(--text)"}}>{value}</div>
      {sub && <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{sub}</div>}
    </div>
  );
}

function FGroup({ label, children }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".5px"}}>{label}</label>
      {children}
    </div>
  );
}

function Money({ v, bold, accent, digits=2 }) {
  const val = parseFloat(v)||0;
  if (!val) return <span style={{color:"var(--muted)",textAlign:"right",display:"block"}}>—</span>;
  const color = accent ? "var(--accent)" : bold ? "var(--text)" : "var(--muted2)";
  return <span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color}}>${digits===3?fmt3(val):fmt2(val)}</span>;
}

function Num({ v, yellow }) {
  const val = parseInt(v)||0;
  if (!val) return <span style={{color:"var(--muted)",textAlign:"right",display:"block"}}>0</span>;
  return <span style={{display:"block",textAlign:"right",fontVariantNumeric:"tabular-nums",color:yellow?"var(--yellow)":undefined}}>{fmtN(val)}</span>;
}

function Ellipsis({ v, w, muted }) {
  const s = String(v||"—");
  return <span title={s} style={{display:"block",maxWidth:w,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:muted?"var(--muted2)":undefined}}>{s}</span>;
}

function Badge({ v, color }) {
  const bg  = { blue:"rgba(59,130,246,.15)", green:"rgba(16,185,129,.15)", yellow:"rgba(245,158,11,.15)", red:"rgba(239,68,68,.15)", muted:"rgba(100,116,139,.15)" };
  const col = { blue:"var(--blue)", green:"var(--green)", yellow:"var(--yellow)", red:"var(--red)", muted:"var(--muted)" };
  return <span style={{background:bg[color]||bg.muted,color:col[color]||col.muted,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{v||"—"}</span>;
}

function StatusBadge({ v }) {
  const s = String(v||"");
  let color = "muted";
  if (s.includes("крутить") && !s.includes("обмеж")) color = "green";
  else if (s.includes("обмежена"))  color = "yellow";
  else if (s.includes("Призупинено")||s.includes("Видалена")) color = "red";
  else if (s.includes("модерації")) color = "blue";
  return <Badge v={s} color={color} />;
}

function PolicyCell({ n: cnt, d }) {
  const count = parseInt(cnt)||0;
  if (!count) return <span style={{color:"var(--green)"}}>✓ OK</span>;
  const isBad = String(d).includes("Дизапрув");
  return <span title={String(d)} style={{color:isBad?"var(--red)":"var(--yellow)",fontWeight:600,cursor:"help"}}>⚠ {count}</span>;
}

function ServingCell({ status, policyS, policyN }) {
  const s = String(status||"");
  if (parseInt(policyN)>0 && String(policyS).includes("ТАК"))
    return <span style={{color:"var(--red)",fontWeight:700}}>🔴 Policy!</span>;
  if (s.includes("крутить") && !s.includes("обмеж"))
    return <span style={{color:"var(--green)",fontWeight:600}}>✓ Так</span>;
  if (s.includes("обмежена"))
    return <span style={{color:"var(--yellow)",fontWeight:600}}>⚡ Обмежена</span>;
  if (s.includes("Пауза"))
    return <span style={{color:"var(--muted)"}}>⏸ Пауза</span>;
  if (s.includes("Призупинено"))
    return <span style={{color:"var(--red)"}}>🚫 Стоп</span>;
  return <span style={{color:"var(--muted)"}}>—</span>;
}

function SortIcon({ active, dir }) {
  if (!active) return <span style={{opacity:.25,fontSize:10}}>↕</span>;
  return <span style={{opacity:1,fontSize:10,color:"var(--accent)"}}>{dir===1?"↑":"↓"}</span>;
}

function Spinner() {
  return <div style={{width:36,height:36,border:"3px solid var(--bg4)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto"}} />;
}

const S = {
  page:      { padding:"20px 24px 60px", maxWidth:1900, margin:"0 auto" },
  header:    { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:12 },
  logo:      { width:40, height:40, background:"rgba(0,229,180,.12)", border:"1px solid rgba(0,229,180,.2)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 },
  btn:       { background:"var(--accent)", color:"var(--bg)", border:"none", borderRadius:8, padding:"9px 18px", fontWeight:700, cursor:"pointer", fontSize:13 },
  smallBtn:  { background:"var(--bg3)", color:"var(--muted2)", border:"1px solid var(--border)", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12 },
  errorBox:  { background:"rgba(239,68,68,.1)", border:"1px solid var(--red)", borderRadius:8, padding:"12px 16px", color:"var(--red)", marginBottom:20, fontSize:13 },
  kpiGrid:   { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))", gap:12, marginBottom:20 },
  kpiCard:   { background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:"var(--r)", padding:"16px 18px" },
  filterBox: { background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:"var(--r)", padding:"16px", marginBottom:16 },
  filterRow: { display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end" },
  inp:       { background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:7, padding:"7px 10px", fontSize:13, outline:"none", minWidth:140 },
  sel:       { background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:7, padding:"7px 10px", fontSize:13, outline:"none", minWidth:150, cursor:"pointer" },
  resultsBar:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 },
  tableWrap: { overflowX:"auto", borderRadius:"var(--r)", border:"1px solid var(--border)" },
  table:     { width:"100%", borderCollapse:"collapse" },
  th:        { background:"#0b0e16", color:"var(--accent)", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:".5px", padding:"11px 12px", textAlign:"left", whiteSpace:"nowrap", position:"sticky", top:0, zIndex:2, borderBottom:"1px solid var(--border)", cursor:"pointer" },
  groupHeader:     { cursor:"pointer", userSelect:"none" },
  groupHeaderCell: { background:"var(--bg3)", borderTop:"2px solid var(--border)", borderBottom:"1px solid var(--border)", padding:"11px 14px" },
  groupStat:       { fontSize:12, color:"var(--muted2)" },
  tr:        { borderBottom:"1px solid var(--border)" },
  td:        { padding:"10px 12px", fontSize:13, verticalAlign:"middle" },
  empty:     { textAlign:"center", padding:"60px 20px", color:"var(--muted)" },
};
