import { useState, useEffect, useMemo, useCallback } from "react";
import Head from "next/head";

const C = {
  date: 0, time: 1, company: 2, accountId: 3, currency: 4,
  campaign: 5, creo: 6, type: 7, status: 8, budget: 9,
  spendY: 10, spendT: 11, impY: 12, impT: 13, clicksY: 14,
  cpc: 15, conv: 16, policyN: 17, policyD: 18, policyS: 19,
  geo: 20, domain: 21, monthSpend: 22,
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
  { label:"Downloads",        col:C.conv,       render: r => <Num v={r[C.conv]} yellow /> },
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
  { label:"Крутить?",         col:C.status,     render: r => <ServingCell status={r[C.status]} policyS={r[C.policyS]} policyN={r[C.policyN]} /> },
  { label:"Бюджет $",         col:C.budget,     render: r => <Money v={r[C.budget]} /> },
  { label:"Витрати сьогодні $",col:C.spendT,    render: r => <Money v={r[C.spendT]} accent /> },
  { label:"Покази сьогодні",  col:C.impT,       render: r => <Num v={r[C.impT]} /> },
  { label:"Policy",           col:C.policyN,    render: r => <PolicyCell n={r[C.policyN]} d={r[C.policyD]} /> },
  { label:"Крутить попри policy?", col:C.policyS, render: r => <ServingCell status={r[C.status]} policyS={r[C.policyS]} policyN={r[C.policyN]} /> },
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
  const [tab,      setTab]      = useState("today"); // "today" | "yesterday"
  const [collapsed,setCollapsed]= useState(new Set());

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
      const r = await fetch("/api/data");
      const j = await r.json();
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

  const groups = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const key = String(r[C.company]||"—");
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    const isNum = col => [C.budget,C.spendY,C.spendT,C.impY,C.impT,C.clicksY,C.cpc,C.conv,C.policyN,C.monthSpend].includes(col);
    const sortFn = sortCol !== null ? (a,b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (isNum(sortCol)) { av = n(av); bv = n(bv); }
      else { av = String(av||"").toLowerCase(); bv = String(bv||"").toLowerCase(); }
      return av < bv ? sortDir : av > bv ? -sortDir : 0;
    } : null;
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,rows])=>({
      name, rows: sortFn ? [...rows].sort(sortFn) : rows,
    }));
  }, [filtered, sortCol, sortDir, tab]);

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
    const month  = filtered.reduce((s,r)=>s+n(r[C.monthSpend]),0);
    const pol    = filtered.filter(r=>ni(r[C.policyN])>0).length;
    const active = filtered.filter(r=>String(r[C.status]).includes("крутить")).length;
    const paused = filtered.filter(r=>String(r[C.status]).includes("Пауза")).length;
    return { spend, imp, month, pol, active, paused, total: filtered.length };
  }, [filtered]);

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

  function toggleCollapse(name) {
    setCollapsed(prev=>{ const s=new Set(prev); s.has(name)?s.delete(name):s.add(name); return s; });
  }
  function collapseAll(){ setCollapsed(new Set(groups.map(g=>g.name))); }
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
        </div>

        {/* KPI — TODAY */}
        {tab==="today" && (
          <div style={S.kpiGrid}>
            <KpiCard label="Витрати сьогодні" value={"$"+fmt2(kpiT.spend)}  color="accent" sub="поточний день" />
            <KpiCard label="Покази сьогодні"  value={fmtN(kpiT.imp)}        color="blue"   sub="impressions" />
            <KpiCard label="Витрати місяця"   value={"$"+fmt2(kpiT.month)}  color="purple" sub="цього місяця" />
            <KpiCard label="Активних"         value={kpiT.active}           color="green"  sub={`з ${kpiT.total} кампаній`} />
            <KpiCard label="На паузі"         value={kpiT.paused}           color="muted"  sub="кампаній" />
            <KpiCard label="Policy проблем"   value={kpiT.pol}              color={kpiT.pol>0?"red":"green"} sub="кампаній" />
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
            <KpiCard label="Policy проблем" value={kpiY.pol}                                 color={kpiY.pol>0?"red":"green"} sub="кампаній" />
          </div>
        )}

        {/* CHART */}
        {chartData.length>1 && (
          <div style={S.chartBox}>
            <div style={{fontSize:12,color:"var(--muted)",marginBottom:12,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>
              {tab==="today"?"Витрати сьогодні по днях ($)":"Витрати вчора по днях ($)"}
            </div>
            <SpendChart data={chartData} />
          </div>
        )}

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
              <input style={{...S.inp,minWidth:200}} placeholder="Кампанія, крео, домен…" value={search} onChange={e=>setSearch(e.target.value)} />
            </FGroup>
            <FGroup label=" ">
              <button style={{...S.btn,background:"var(--bg4)",color:"var(--muted2)",border:"1px solid var(--border)"}} onClick={resetFilters}>Скинути</button>
            </FGroup>
          </div>
        </div>

        {/* RESULTS BAR */}
        <div style={S.resultsBar}>
          <span style={{color:"var(--muted)",fontSize:12}}>
            {loading?"Завантаження…":`${filtered.length} кампаній · ${groups.length} акаунтів`}
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button style={S.smallBtn} onClick={expandAll}>Розкрити всі</button>
            <button style={S.smallBtn} onClick={collapseAll}>Згорнути всі</button>
            <span style={{color:"var(--muted)",fontSize:11}}>↑↓ клік по заголовку</span>
          </div>
        </div>

        {/* TABLE */}
        {groups.length>0 && (
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
                </tr>
              </thead>
              <tbody>
                {groups.map(g=>(
                  <AccountGroup key={g.name} group={g} tab={tab}
                    collapsed={collapsed.has(g.name)} onToggle={()=>toggleCollapse(g.name)}
                    colCount={COLS.length} />
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

function AccountGroup({ group, tab, collapsed, onToggle, colCount }) {
  const rows   = group.rows;
  const spendY = rows.reduce((s,r)=>s+n(r[C.spendY]),   0);
  const spendT = rows.reduce((s,r)=>s+n(r[C.spendT]),   0);
  const impY   = rows.reduce((s,r)=>s+ni(r[C.impY]),    0);
  const impT   = rows.reduce((s,r)=>s+ni(r[C.impT]),    0);
  const clicks = rows.reduce((s,r)=>s+ni(r[C.clicksY]), 0);
  const conv   = rows.reduce((s,r)=>s+ni(r[C.conv]),    0);
  const budget = rows.reduce((s,r)=>s+n(r[C.budget]),   0);
  const month  = rows.reduce((s,r)=>s+n(r[C.monthSpend]),0);
  const pol    = rows.filter(r=>ni(r[C.policyN])>0).length;
  const active = rows.filter(r=>String(r[C.status]).includes("крутить")).length;
  const ctr    = impY>0?(clicks/impY)*100:0;
  const cpc    = clicks>0?spendY/clicks:0;
  const cpm    = impY>0?(spendY/impY)*1000:0;
  const ctrT   = impT>0?0:0; // today has no clicks data

  // Arrow toggle cell (first col)
  const arrowCell = (
    <td style={{...S.td, paddingLeft:14, whiteSpace:"nowrap", cursor:"pointer"}} onClick={onToggle}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,color:"var(--accent)",display:"inline-block",transform:collapsed?"rotate(-90deg)":"rotate(0deg)",transition:"transform .2s"}}>▼</span>
        <span style={{fontWeight:700,fontSize:13,color:"var(--text)"}}>{group.name}</span>
        <span style={{fontSize:11,color:"var(--muted)",marginLeft:2}}>{rows.length} кам.</span>
      </div>
    </td>
  );

  // Summary row for YESTERDAY tab
  if (tab==="yesterday") {
    return (
      <>
        <tr style={{...S.tr, background:"var(--bg3)", cursor:"pointer"}} onClick={onToggle}>
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
          <td style={S.td}></td>{/* гео */}
          <td style={S.td}></td>{/* домен */}
        </tr>
        {!collapsed&&rows.map((row,i)=>(
          <tr key={i} style={S.tr}>
            {COLS_YESTERDAY.map((c,j)=><td key={j} style={S.td}>{c.render(row)}</td>)}
          </tr>
        ))}
      </>
    );
  }

  // Summary row for TODAY tab
  return (
    <>
      <tr style={{...S.tr, background:"var(--bg3)", cursor:"pointer"}} onClick={onToggle}>
        {arrowCell}
        <td style={S.td}></td>{/* крео */}
        <td style={S.td}></td>{/* тип */}
        <td style={S.td}>
          <span style={{fontSize:11,color:"var(--green)"}}>{active} актив.</span>
        </td>
        <td style={S.td}>{/* крутить */}</td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>${fmt2(budget)}</span></td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",fontWeight:700,color:"var(--accent)",fontVariantNumeric:"tabular-nums"}}>${fmt2(spendT)}</span></td>
        <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>{fmtN(impT)}</span></td>
        <td style={S.td}>
          {pol>0
            ? <span style={{color:"var(--red)",fontWeight:700}}>⚠ {pol}</span>
            : <span style={{color:"var(--green)"}}>✓</span>}
        </td>
        <td style={S.td}></td>{/* крутить попри */}
        <td style={S.td}></td>{/* гео */}
        <td style={S.td}></td>{/* домен */}
        <td style={S.td}><span style={{display:"block",textAlign:"right",color:"var(--muted2)",fontVariantNumeric:"tabular-nums"}}>${fmt2(month)}</span></td>
      </tr>
      {!collapsed&&rows.map((row,i)=>(
        <tr key={i} style={S.tr}>
          {COLS_TODAY.map((c,j)=><td key={j} style={S.td}>{c.render(row)}</td>)}
        </tr>
      ))}
    </>
  );
}

// ── Chart
function SpendChart({ data }) {
  const [hover,setHover]=useState(null);
  const W=100,H=100,PAD={top:8,right:6,bottom:24,left:44};
  const iW=W-PAD.left-PAD.right, iH=H-PAD.top-PAD.bottom;
  const max=Math.max(...data.map(d=>d.spend),0.01);
  const bW=iW/data.length, gap=Math.max(0.5,bW*.15);
  const ticks=[0,max*.5,max].map(v=>({ y:PAD.top+iH-(v/max)*iH, label:"$"+(v>=1000?(v/1000).toFixed(1)+"k":fmt2(v)) }));
  return (
    <div style={{position:"relative",width:"100%",overflowX:"auto"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:Math.max(400,data.length*18),height:150,display:"block"}} preserveAspectRatio="none">
        {ticks.map((t,i)=>(
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W-PAD.right} y2={t.y} stroke="#1e2535" strokeWidth=".4"/>
            <text x={PAD.left-2} y={t.y+1.2} textAnchor="end" fontSize="3" fill="#64748b">{t.label}</text>
          </g>
        ))}
        {data.map((d,i)=>{
          const bh=Math.max(.4,(d.spend/max)*iH);
          const x=PAD.left+i*bW+gap/2, y=PAD.top+iH-bh;
          const isH=hover===i;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bW-gap} height={bh}
                fill={isH?"var(--accent)":"rgba(0,229,180,.45)"} rx=".6"
                onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
                style={{cursor:"pointer",transition:"fill .1s"}}
              />
              {i%Math.ceil(data.length/10)===0&&(
                <text x={x+(bW-gap)/2} y={H-PAD.bottom+4} textAnchor="middle" fontSize="2.8" fill="#64748b"
                  transform={`rotate(-35,${x+(bW-gap)/2},${H-PAD.bottom+4})`}>{d.date.slice(5)}</text>
              )}
              {isH&&(
                <g>
                  <rect x={Math.min(x-8,W-PAD.right-26)} y={y-11} width={26} height={9} rx="1.2" fill="#0f1219" stroke="#1e2535" strokeWidth=".4"/>
                  <text x={Math.min(x-8,W-PAD.right-26)+13} y={y-5} textAnchor="middle" fontSize="3" fill="var(--accent)" fontWeight="bold">${fmt2(d.spend)}</text>
                  <text x={Math.min(x-8,W-PAD.right-26)+13} y={y-1.5} textAnchor="middle" fontSize="2.4" fill="#64748b">{d.date.slice(5)}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── UI atoms
function KpiCard({label,value,color,sub}){
  const colors={accent:"var(--accent)",blue:"var(--blue)",purple:"var(--purple)",red:"var(--red)",yellow:"var(--yellow)",green:"var(--green)",muted:"var(--muted)"};
  return(
    <div style={S.kpiCard}>
      <div style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>{label}</div>
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
function ServingCell({status,policyS,policyN}){
  const s=String(status||"");
  if(parseInt(policyN)>0&&String(policyS).includes("ТАК")) return <span style={{color:"var(--red)",fontWeight:700}}>🔴 Policy!</span>;
  if(s.includes("крутить")&&!s.includes("обмеж")) return <span style={{color:"var(--green)",fontWeight:600}}>✓ Так</span>;
  if(s.includes("обмежена")) return <span style={{color:"var(--yellow)",fontWeight:600}}>⚡ Обмежена</span>;
  if(s.includes("Пауза")) return <span style={{color:"var(--muted)"}}>⏸ Пауза</span>;
  if(s.includes("Призупинено")) return <span style={{color:"var(--red)"}}>🚫 Стоп</span>;
  return <span style={{color:"var(--muted)"}}>—</span>;
}
function SortIcon({active,dir}){
  if(!active) return <span style={{opacity:.25,fontSize:10}}>↕</span>;
  return <span style={{opacity:1,fontSize:10,color:"var(--accent)"}}>{dir===1?"↑":"↓"}</span>;
}
function Spinner(){
  return <div style={{width:36,height:36,border:"3px solid var(--bg4)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto"}}/>;
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
