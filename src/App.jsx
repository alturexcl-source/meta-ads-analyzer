import { useState, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════
   CONSTANTS & HELPERS
═══════════════════════════════════════════════════════ */
const API_VER = "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VER}`;
const CLAUDE = "https://api.anthropic.com/v1/messages";

const PALETTE = {
  bg: "#080810",
  surface: "#0e0e1c",
  card: "#13132a",
  border: "#1e1e3a",
  accent: "#00e5ff",
  green: "#00ff88",
  yellow: "#ffd60a",
  red: "#ff4d6d",
  purple: "#b388ff",
  text: "#e8e8f0",
  muted: "#6b6b8a",
};

const C = ["#00e5ff","#00ff88","#b388ff","#ffd60a","#ff4d6d","#ff9f1c","#7b2fff","#00cfcf"];

async function metaGet(path, token, params = {}) {
  const u = new URL(`${GRAPH}${path}`);
  u.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u);
  const j = await r.json();
  if (j.error) throw new Error(`Meta API: ${j.error.message}`);
  return j;
}

function ga(arr = [], type) {
  return parseFloat((arr || []).find(a => a.action_type === type)?.value || 0);
}

function parseIns(ins = {}) {
  const a = ins.actions || [], av = ins.action_values || [];
  const spend = +ins.spend || 0, imp = +ins.impressions || 0;
  const clicks = +ins.clicks || 0;
  const v3 = ga(a, "video_view");
  const tp = ga(a, "video_thruplay_watched");
  const purch = ga(a, "purchase") || ga(a, "omni_purchase");
  const leads = ga(a, "lead");
  const addToCart = ga(a, "add_to_cart");
  const initCheckout = ga(a, "initiate_checkout");
  const purchVal = parseFloat(
    (av.find(x => ["purchase","omni_purchase"].includes(x.action_type)))?.value || 0
  );
  return {
    spend, imp, clicks,
    reach: +ins.reach || 0,
    freq: +ins.frequency || 0,
    ctr: +ins.ctr || 0,
    cpm: +ins.cpm || 0,
    cpc: +ins.cpc || 0,
    v3, tp, purch, leads, addToCart, initCheckout, purchVal,
    cpa: purch > 0 ? spend / purch : 0,
    roas: spend > 0 && purchVal > 0 ? purchVal / spend : 0,
    hookRate: imp > 0 ? (v3 / imp) * 100 : 0,
    holdRate: v3 > 0 ? (tp / v3) * 100 : 0,
  };
}

const fm = {
  $: v => `$${(+v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  pct: v => `${(+v).toFixed(2)}%`,
  n: v => (+v).toLocaleString("es-AR"),
  x: v => `${(+v).toFixed(2)}x`,
  short: v => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  },
};

/* ═══════════════════════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════════════════════ */
const S = {
  card: { background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: "18px 22px" },
  btn: (accent = PALETTE.accent) => ({
    background: "transparent", border: `1px solid ${accent}`, color: accent,
    padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
    fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", transition: "all .2s",
  }),
  btnFill: (accent = PALETTE.accent) => ({
    background: accent, border: "none", color: "#000",
    padding: "11px 24px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
    fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", transition: "all .15s",
  }),
  input: {
    background: "#0e0e1c", border: `1px solid ${PALETTE.border}`, color: PALETTE.text,
    padding: "11px 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, width: "100%",
    boxSizing: "border-box", outline: "none",
  },
  label: { color: PALETTE.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6, display: "block" },
  tag: (c = PALETTE.accent) => ({
    display: "inline-block", background: `${c}18`, color: c, border: `1px solid ${c}44`,
    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
  }),
};

function KPI({ label, value, sub, color = PALETTE.accent, mini }) {
  return (
    <div style={{ ...S.card, flex: 1, minWidth: mini ? 120 : 150 }}>
      <div style={{ ...S.label }}>{label}</div>
      <div style={{ color: PALETTE.text, fontSize: mini ? 20 : 26, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color, fontSize: 11, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function Loader({ text = "Cargando..." }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 40 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${PALETTE.border}`, borderTop: `3px solid ${PALETTE.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: PALETTE.muted, fontSize: 13 }}>{text}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const TTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1a30", border: `1px solid ${PALETTE.border}`, padding: "10px 14px", borderRadius: 8, fontSize: 12 }}>
      <div style={{ color: PALETTE.muted, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          <span style={{ color: PALETTE.muted }}>{p.name}: </span>
          {typeof p.value === "number" ? (p.value < 1 ? fm.pct(p.value * 100) : p.value >= 1000 ? fm.short(p.value) : p.value.toFixed(2)) : p.value}
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SETUP SCREEN
═══════════════════════════════════════════════════════ */
function SetupScreen({ onConnect }) {
  const [token, setToken] = useState("");
  const [accId, setAccId] = useState("");
  const [datePreset, setDatePreset] = useState("last_30d");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0); // 0=form, 1=guide

  const connect = async () => {
    if (!token.trim() || !accId.trim()) { setErr("Completá todos los campos."); return; }
    setLoading(true); setErr("");
    try { await onConnect(token.trim(), accId.trim(), datePreset); }
    catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const DATE_OPTS = [
    { v: "last_7d", l: "Últimos 7 días" }, { v: "last_14d", l: "Últimos 14 días" },
    { v: "last_30d", l: "Últimos 30 días" }, { v: "last_90d", l: "Últimos 90 días" },
    { v: "this_month", l: "Este mes" }, { v: "last_month", l: "Mes pasado" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: PALETTE.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        input:focus{border-color:#00e5ff !important}
        select:focus{border-color:#00e5ff !important; outline:none}
        select option{background:#0e0e1c}
        a{color:#00e5ff}
        .btn-hover:hover{opacity:.85; transform:translateY(-1px)}
      `}</style>
      <div style={{ width: "100%", maxWidth: 520 }}>
        {/* Logo */}
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", color: PALETTE.accent, marginBottom: 8 }}>META ADS</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: PALETTE.text, lineHeight: 1 }}>AI Analyzer</div>
          <div style={{ color: PALETTE.muted, fontSize: 14, marginTop: 10 }}>Media buyer + estratega creativo con IA</div>
        </div>

        <div style={S.card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {["Conectar","Cómo obtener token"].map((t,i) => (
              <button key={i} onClick={() => setStep(i)} style={{ ...S.btn(i===step ? PALETTE.accent : PALETTE.border), flex: 1 }}>{t}</button>
            ))}
          </div>

          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={S.label}>ACCESS TOKEN <span style={{ color: PALETTE.accent }}>*</span></label>
                <input style={S.input} type="password" placeholder="EAAxxxxxxx..." value={token} onChange={e => setToken(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>AD ACCOUNT ID <span style={{ color: PALETTE.accent }}>*</span></label>
                <input style={S.input} placeholder="act_1234567890 o solo el número" value={accId} onChange={e => setAccId(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>PERÍODO</label>
                <select style={{ ...S.input }} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
                  {DATE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              {err && <div style={{ background: `${PALETTE.red}18`, border: `1px solid ${PALETTE.red}44`, color: PALETTE.red, padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>{err}</div>}
              <button className="btn-hover" onClick={connect} disabled={loading} style={{ ...S.btnFill(), marginTop: 4 }}>
                {loading ? "Conectando..." : "→ Conectar y Analizar"}
              </button>
            </div>
          )}

          {step === 1 && (
            <div style={{ fontSize: 13, color: PALETTE.muted, lineHeight: 1.8 }}>
              <div style={{ color: PALETTE.text, fontWeight: 700, marginBottom: 12 }}>Pasos para obtener tu token:</div>
              {[
                <>Andá a <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer">Meta Graph API Explorer</a></>,
                "Seleccioná tu app (o creá una en developers.facebook.com)",
                <>Clickeá <b style={{ color: PALETTE.text }}>"Generate Access Token"</b></>,
                <>Activá los permisos: <span style={S.tag(PALETTE.accent)}>ads_read</span> <span style={S.tag(PALETTE.purple)}>ads_management</span></>,
                "Copiá el token generado",
                <>Tu Ad Account ID lo encontrás en <a href="https://business.facebook.com/adsmanager" target="_blank" rel="noreferrer">Ads Manager</a> → URL o configuración de cuenta</>,
              ].map((s,i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  <div style={{ minWidth: 22, height: 22, background: `${PALETTE.accent}22`, color: PALETTE.accent, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{i+1}</div>
                  <div>{s}</div>
                </div>
              ))}
              <div style={{ marginTop: 16, padding: "10px 14px", background: `${PALETTE.yellow}10`, border: `1px solid ${PALETTE.yellow}33`, borderRadius: 8, color: PALETTE.yellow, fontSize: 12 }}>
                ⚡ Para uso continuo, creá un System User Token en Business Manager con permisos de ads_read — no expira.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   OVERVIEW TAB
═══════════════════════════════════════════════════════ */
function OverviewTab({ campaigns, summary, datePreset }) {
  const topN = 10;
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, topN);
  const roasSorted = [...campaigns].filter(c => c.roas > 0).sort((a, b) => b.roas - a.roas).slice(0, topN);
  
  const chartData = sorted.map(c => ({
    name: c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name,
    Gasto: +c.spend.toFixed(2),
    CTR: +c.ctr.toFixed(3),
    CPM: +c.cpm.toFixed(2),
  }));

  const radarData = [
    { metric: "CTR", value: summary.ctr },
    { metric: "Hook Rate", value: summary.hookRate },
    { metric: "Hold Rate", value: summary.holdRate },
    { metric: "ROAS", value: Math.min(summary.roas * 10, 100) },
    { metric: "Freq OK", value: Math.max(0, 100 - (summary.freq * 10)) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Spend by campaign */}
      <div style={S.card}>
        <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 16 }}>GASTO POR CAMPAÑA</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 60 }}>
            <CartesianGrid stroke={PALETTE.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: PALETTE.muted, fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: PALETTE.muted, fontSize: 10 }} tickFormatter={v => `$${fm.short(v)}`} />
            <Tooltip content={<TTip />} />
            <Bar dataKey="Gasto" fill={PALETTE.accent} radius={[4,4,0,0]}>
              {chartData.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* ROAS chart */}
        <div style={{ ...S.card, flex: 2, minWidth: 300 }}>
          <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 16 }}>ROAS POR CAMPAÑA</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={roasSorted.map(c => ({ name: c.name.slice(0,20), ROAS: +c.roas.toFixed(2) }))} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid stroke={PALETTE.border} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: PALETTE.muted, fontSize: 10 }} />
              <Tooltip content={<TTip />} />
              <Bar dataKey="ROAS" radius={[0,4,4,0]}>
                {roasSorted.map((c, i) => <Cell key={i} fill={c.roas >= 2 ? PALETTE.green : c.roas >= 1 ? PALETTE.yellow : PALETTE.red} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar */}
        <div style={{ ...S.card, flex: 1, minWidth: 220 }}>
          <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 16 }}>SALUD GLOBAL</div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={PALETTE.border} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
              <Radar dataKey="value" stroke={PALETTE.accent} fill={PALETTE.accent} fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign table */}
      <div style={S.card}>
        <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 16 }}>DETALLE DE CAMPAÑAS</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                {["Campaña","Estado","Gasto","Impres.","CTR","CPM","CPC","Compras","ROAS","CPA","Hook%","Hold%"].map(h => (
                  <th key={h} style={{ color: PALETTE.muted, fontWeight: 600, padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...campaigns].sort((a,b) => b.spend - a.spend).map((c, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.border}22`, transition: "background .15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#ffffff08"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "9px 10px", color: PALETTE.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                  <td style={{ padding: "9px 10px" }}><span style={S.tag(c.status === "ACTIVE" ? PALETTE.green : PALETTE.muted)}>{c.status === "ACTIVE" ? "Activa" : c.status}</span></td>
                  <td style={{ padding: "9px 10px", color: PALETTE.text, fontFamily: "DM Mono, monospace" }}>{fm.$(c.spend)}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.muted, fontFamily: "DM Mono, monospace" }}>{fm.short(c.imp)}</td>
                  <td style={{ padding: "9px 10px", color: c.ctr > 1.5 ? PALETTE.green : c.ctr > 0.8 ? PALETTE.yellow : PALETTE.red, fontFamily: "DM Mono, monospace" }}>{fm.pct(c.ctr)}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.muted, fontFamily: "DM Mono, monospace" }}>{fm.$(c.cpm)}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.muted, fontFamily: "DM Mono, monospace" }}>{fm.$(c.cpc)}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.text, fontFamily: "DM Mono, monospace" }}>{fm.n(c.purch) || "—"}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "DM Mono, monospace", color: c.roas >= 2 ? PALETTE.green : c.roas >= 1 ? PALETTE.yellow : c.roas > 0 ? PALETTE.red : PALETTE.muted }}>{c.roas > 0 ? fm.x(c.roas) : "—"}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.muted, fontFamily: "DM Mono, monospace" }}>{c.cpa > 0 ? fm.$(c.cpa) : "—"}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "DM Mono, monospace", color: c.hookRate > 30 ? PALETTE.green : c.hookRate > 15 ? PALETTE.yellow : PALETTE.muted }}>{c.hookRate > 0 ? fm.pct(c.hookRate) : "—"}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "DM Mono, monospace", color: c.holdRate > 40 ? PALETTE.green : c.holdRate > 20 ? PALETTE.yellow : PALETTE.muted }}>{c.holdRate > 0 ? fm.pct(c.holdRate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CREATIVOS TAB
═══════════════════════════════════════════════════════ */
function CreativosTab({ ads }) {
  const [sort, setSort] = useState("spend");
  const [filterMin, setFilterMin] = useState(0);

  const filtered = useMemo(() =>
    [...ads].filter(a => a.spend >= filterMin).sort((a, b) => b[sort] - a[sort])
  , [ads, sort, filterMin]);

  const scatterData = ads.filter(a => a.spend > 5 && a.hookRate > 0).map(a => ({
    x: +a.hookRate.toFixed(2), y: +a.holdRate.toFixed(2), z: a.spend, name: a.name,
  }));

  const topHook = [...ads].filter(a => a.hookRate > 0).sort((a,b) => b.hookRate - a.hookRate).slice(0, 5);
  const topRoas = [...ads].filter(a => a.roas > 0).sort((a,b) => b.roas - a.roas).slice(0, 5);

  const SORT_OPTS = [
    { v: "spend", l: "Gasto" },{ v: "roas", l: "ROAS" },{ v: "cpa", l: "CPA" },
    { v: "hookRate", l: "Hook Rate" },{ v: "holdRate", l: "Hold Rate" },{ v: "ctr", l: "CTR" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top performers side by side */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ ...S.card, flex: 1, minWidth: 280 }}>
          <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14 }}>🎣 MEJORES HOOK RATES</div>
          {topHook.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ color: PALETTE.accent, fontFamily: "DM Mono, monospace", fontSize: 11, minWidth: 40 }}>{fm.pct(a.hookRate)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: PALETTE.text, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div style={{ color: PALETTE.muted, fontSize: 10 }}>{a.campaignName.slice(0,30)}</div>
              </div>
              <div style={{ color: PALETTE.muted, fontSize: 10, fontFamily: "DM Mono, monospace" }}>{fm.$(a.spend)}</div>
            </div>
          ))}
        </div>
        <div style={{ ...S.card, flex: 1, minWidth: 280 }}>
          <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 14 }}>💰 MEJORES ROAS</div>
          {topRoas.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ color: PALETTE.green, fontFamily: "DM Mono, monospace", fontSize: 11, minWidth: 40 }}>{fm.x(a.roas)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: PALETTE.text, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div style={{ color: PALETTE.muted, fontSize: 10 }}>{a.campaignName.slice(0,30)}</div>
              </div>
              <div style={{ color: PALETTE.muted, fontSize: 10, fontFamily: "DM Mono, monospace" }}>{fm.$(a.spend)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hook vs Hold scatter */}
      {scatterData.length > 1 && (
        <div style={S.card}>
          <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>HOOK RATE vs HOLD RATE</div>
          <div style={{ color: PALETTE.muted, fontSize: 11, marginBottom: 16 }}>Tamaño del punto = gasto. Objetivo: arriba a la derecha.</div>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={PALETTE.border} strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Hook Rate" unit="%" tick={{ fill: PALETTE.muted, fontSize: 10 }} label={{ value: "Hook Rate (%)", position: "insideBottom", offset: -2, fill: PALETTE.muted, fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name="Hold Rate" unit="%" tick={{ fill: PALETTE.muted, fontSize: 10 }} label={{ value: "Hold Rate (%)", angle: -90, position: "insideLeft", fill: PALETTE.muted, fontSize: 10 }} />
              <ZAxis type="number" dataKey="z" range={[30, 300]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: "#1a1a30", border: `1px solid ${PALETTE.border}`, padding: "10px 14px", borderRadius: 8, fontSize: 11 }}>
                    <div style={{ color: PALETTE.text, marginBottom: 4, maxWidth: 200 }}>{d.name}</div>
                    <div style={{ color: PALETTE.accent }}>Hook: {d.x}% | Hold: {d.y}%</div>
                    <div style={{ color: PALETTE.muted }}>Gasto: {fm.$(d.z)}</div>
                  </div>
                );
              }} />
              <Scatter data={scatterData} fill={PALETTE.accent} fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Full ads table */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div style={{ color: PALETTE.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>TODOS LOS ADS ({filtered.length})</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ color: PALETTE.muted, fontSize: 11 }}>Min. gasto: $</div>
            <input type="number" value={filterMin} onChange={e => setFilterMin(+e.target.value)} style={{ ...S.input, width: 70, padding: "6px 10px", fontSize: 12 }} />
            <div style={{ color: PALETTE.muted, fontSize: 11, marginLeft: 8 }}>Ordenar:</div>
            <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...S.input, width: "auto", padding: "6px 10px", fontSize: 12 }}>
              {SORT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                {["Ad","Campaña","Tipo","Gasto","CTR","CPM","Hook%","Hold%","Compras","ROAS","CPA"].map(h => (
                  <th key={h} style={{ color: PALETTE.muted, fontWeight: 600, padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.border}22` }}
                  onMouseEnter={e => e.currentTarget.style.background = "#ffffff08"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "9px 10px", color: PALETTE.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.muted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.campaignName}>{a.campaignName.slice(0,22)}</td>
                  <td style={{ padding: "9px 10px" }}><span style={S.tag(PALETTE.purple)}>{a.creativeType}</span></td>
                  <td style={{ padding: "9px 10px", color: PALETTE.text, fontFamily: "DM Mono, monospace" }}>{fm.$(a.spend)}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "DM Mono, monospace", color: a.ctr > 1.5 ? PALETTE.green : a.ctr > 0.8 ? PALETTE.yellow : PALETTE.red }}>{fm.pct(a.ctr)}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.muted, fontFamily: "DM Mono, monospace" }}>{fm.$(a.cpm)}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "DM Mono, monospace", color: a.hookRate > 30 ? PALETTE.green : a.hookRate > 15 ? PALETTE.yellow : PALETTE.muted }}>{a.hookRate > 0 ? fm.pct(a.hookRate) : "—"}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "DM Mono, monospace", color: a.holdRate > 40 ? PALETTE.green : a.holdRate > 20 ? PALETTE.yellow : PALETTE.muted }}>{a.holdRate > 0 ? fm.pct(a.holdRate) : "—"}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.text, fontFamily: "DM Mono, monospace" }}>{a.purch || "—"}</td>
                  <td style={{ padding: "9px 10px", fontFamily: "DM Mono, monospace", color: a.roas >= 2 ? PALETTE.green : a.roas >= 1 ? PALETTE.yellow : a.roas > 0 ? PALETTE.red : PALETTE.muted }}>{a.roas > 0 ? fm.x(a.roas) : "—"}</td>
                  <td style={{ padding: "9px 10px", color: PALETTE.muted, fontFamily: "DM Mono, monospace" }}>{a.cpa > 0 ? fm.$(a.cpa) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   AI ANALYSIS TAB
═══════════════════════════════════════════════════════ */
function AITab({ campaigns, ads, summary, accInfo, datePreset }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setLoading(true); setErr(""); setText("");
    try {
      const topAds = [...ads].sort((a,b) => b.roas - a.roas || b.purch - a.purch).slice(0, 15);
      const botAds = [...ads].filter(a => a.spend > 10).sort((a,b) => (a.roas || 0) - (b.roas || 0) || b.spend - a.spend).slice(0, 8);
      
      const adBlock = (list) => list.map(a =>
        `• ${a.name} [${a.creativeType}] | Campaña: ${a.campaignName.slice(0,40)} | AdSet: ${a.adsetName.slice(0,40)}\n  Gasto:${fm.$(a.spend)} CTR:${fm.pct(a.ctr)} CPM:${fm.$(a.cpm)} CPC:${fm.$(a.cpc)} Compras:${a.purch||0} ROAS:${fm.x(a.roas)} CPA:${a.cpa>0?fm.$(a.cpa):"N/A"} Hook:${fm.pct(a.hookRate)} Hold:${fm.pct(a.holdRate)} ThruPlay:${fm.n(a.tp)}`
      ).join("\n");

      const prompt = `Sos un senior media buyer y estratega creativo con 10+ años de experiencia en Meta Ads (Facebook/Instagram). Sos directo, accionable y te basás 100% en datos.

CUENTA: ${accInfo?.name || "—"} | Moneda: ${accInfo?.currency || "—"} | Período: ${datePreset}

━━━ RESUMEN GLOBAL ━━━
Gasto total: ${fm.$(summary.spend)} | Impresiones: ${fm.n(summary.imp)} | Alcance: ${fm.n(summary.reach)}
CTR promedio: ${fm.pct(summary.ctr)} | CPM promedio: ${fm.$(summary.cpm)} | ROAS promedio: ${fm.x(summary.roas)}
CPA promedio: ${summary.cpa > 0 ? fm.$(summary.cpa) : "N/A"} | Compras totales: ${fm.n(summary.purch)} | Leads totales: ${fm.n(summary.leads)}
Hook Rate global: ${fm.pct(summary.hookRate)} | Hold Rate global: ${fm.pct(summary.holdRate)}

━━━ CAMPAÑAS ━━━
${campaigns.map(c => `• ${c.name} | ${c.objective} | ${c.status}\n  Gasto:${fm.$(c.spend)} CTR:${fm.pct(c.ctr)} CPM:${fm.$(c.cpm)} ROAS:${fm.x(c.roas)} CPA:${c.cpa>0?fm.$(c.cpa):"N/A"} Hook:${fm.pct(c.hookRate)} Hold:${fm.pct(c.holdRate)}`).join("\n")}

━━━ TOP ${topAds.length} ADS (mejores performers) ━━━
${adBlock(topAds)}

━━━ PEORES ${botAds.length} ADS (con gasto significativo) ━━━
${adBlock(botAds)}

---

Analizá todo esto como el mejor media buyer del mundo y respondé en español con estas secciones:

## 🎯 RESUMEN EJECUTIVO
(Estado general de la cuenta en 2-3 párrafos. ¿Está siendo rentable? ¿Qué es lo más urgente?)

## 📊 ANÁLISIS DE CAMPAÑAS
(Qué campañas están ganando y por qué. Qué campañas están quemando plata y por qué. Sé específico con los números.)

## 🎬 ANÁLISIS DE CREATIVOS — QUÉ ESTÁ FUNCIONANDO
Basándote en los NOMBRES de los ads y sus métricas, identificá patrones en:
- **Hooks/aperturas** que generan el mejor hook rate
- **Formatos** (imagen vs video, carrusel, etc.) y su rendimiento
- **Mensajes y copy** que convierten mejor
- **Ángulos de venta** que funcionan (urgencia, beneficio, problema-solución, etc.)

## 👥 ANÁLISIS DE AUDIENCIAS Y BUYERS
(¿Qué adsets/audiencias tienen mejor performance? ¿Qué tipo de buyer responde mejor?)

## 📉 DIAGNÓSTICO DE LO QUE NO FUNCIONA
(Por qué están fallando los peores ads. ¿Es el hook? ¿El CPM es muy alto? ¿El CTR es pésimo? ¿La audiencia está saturada?)

## 🚀 ITERACIONES CREATIVAS PARA TESTEAR
Sugerí 6-8 nuevos creativos específicos para testear. Para cada uno indicá:
- **Nombre sugerido** (con nomenclatura descriptiva)
- **Formato** (video 15s/30s, imagen estática, carrusel, story, etc.)
- **Hook propuesto** (primeros 3 segundos o primera línea del copy)
- **Ángulo de venta** y propuesta de valor central
- **Audiencia objetivo** (tipo de buyer al que apunta)
- **Por qué debería funcionar** (basate en los datos actuales)

## ⚡ ACCIONES INMEDIATAS (esta semana)
(5 acciones concretas y prioritarias: qué pausar HOY, qué escalar HOY, qué testear, qué cambiar en la estructura)`;

      const res = await fetch(CLAUDE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const out = (data.content || []).map(b => b.text || "").join("\n");
      setText(out || "Sin respuesta de la IA.");
    } catch(e) {
      setErr("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Render markdown-ish text
  const renderText = (t) => {
    if (!t) return null;
    return t.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <div key={i} style={{ color: PALETTE.accent, fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${PALETTE.border}` }}>{line.replace("## ", "")}</div>;
      if (line.startsWith("### ")) return <div key={i} style={{ color: PALETTE.text, fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 6 }}>{line.replace("### ", "")}</div>;
      if (line.startsWith("- **") || line.startsWith("* **")) {
        const parts = line.replace(/^[-*]\s+/, "").split("**");
        return (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, paddingLeft: 12 }}>
            <span style={{ color: PALETTE.accent, marginTop: 1 }}>›</span>
            <div style={{ color: PALETTE.muted, fontSize: 13, lineHeight: 1.6 }}>
              {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: PALETTE.text }}>{p}</strong> : p)}
            </div>
          </div>
        );
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 12 }}>
          <span style={{ color: PALETTE.accent, marginTop: 1 }}>›</span>
          <div style={{ color: PALETTE.muted, fontSize: 13, lineHeight: 1.6 }}>{line.replace(/^[-*]\s+/, "")}</div>
        </div>;
      }
      if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
      const boldParts = line.split("**");
      return (
        <div key={i} style={{ color: PALETTE.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 2 }}>
          {boldParts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: PALETTE.text }}>{p}</strong> : p)}
        </div>
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ color: PALETTE.text, fontWeight: 700, fontSize: 15 }}>Análisis IA: Media Buyer + Estratega Creativo</div>
            <div style={{ color: PALETTE.muted, fontSize: 12, marginTop: 4 }}>Envía todos los datos de campañas y ads a Claude para un análisis profundo y accionable</div>
          </div>
          <button className="btn-hover" onClick={run} disabled={loading} style={S.btnFill()}>
            {loading ? "Analizando..." : "⚡ Analizar con IA"}
          </button>
        </div>
      </div>

      {loading && (
        <div style={S.card}>
          <Loader text="Claude está analizando tu cuenta como un senior media buyer..." />
        </div>
      )}

      {err && (
        <div style={{ ...S.card, borderColor: `${PALETTE.red}44`, background: `${PALETTE.red}08` }}>
          <div style={{ color: PALETTE.red, fontSize: 13 }}>{err}</div>
        </div>
      )}

      {text && (
        <div style={S.card}>
          {renderText(text)}
        </div>
      )}

      {!text && !loading && (
        <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
          <div style={{ color: PALETTE.muted, fontSize: 14 }}>Hacé clic en "Analizar con IA" para obtener el análisis completo</div>
          <div style={{ color: PALETTE.muted, fontSize: 12, marginTop: 8 }}>Analiza campañas, creativos, audiencias, hooks, formatos y sugiere iteraciones</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════ */
export default function MetaAnalyzer() {
  const [page, setPage] = useState("setup");
  const [tab, setTab] = useState("overview");
  const [campaigns, setCampaigns] = useState([]);
  const [ads, setAds] = useState([]);
  const [accInfo, setAccInfo] = useState(null);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [tokenRef] = useState({ v: "" });

  const summary = useMemo(() => {
    const s = campaigns.reduce((acc, c) => ({
      spend: acc.spend + c.spend, imp: acc.imp + c.imp, clicks: acc.clicks + c.clicks,
      reach: acc.reach + c.reach, purch: acc.purch + c.purch, leads: acc.leads + c.leads,
      purchVal: acc.purchVal + c.purchVal, v3: acc.v3 + c.v3, tp: acc.tp + c.tp,
    }), { spend:0, imp:0, clicks:0, reach:0, purch:0, leads:0, purchVal:0, v3:0, tp:0 });
    return {
      ...s,
      ctr: s.imp > 0 ? (s.clicks / s.imp) * 100 : 0,
      cpm: s.imp > 0 ? (s.spend / s.imp) * 1000 : 0,
      cpa: s.purch > 0 ? s.spend / s.purch : 0,
      roas: s.spend > 0 && s.purchVal > 0 ? s.purchVal / s.spend : 0,
      hookRate: s.imp > 0 ? (s.v3 / s.imp) * 100 : 0,
      holdRate: s.v3 > 0 ? (s.tp / s.v3) * 100 : 0,
    };
  }, [campaigns]);

  const handleConnect = async (token, rawAccId, dp) => {
    tokenRef.v = token;
    const actId = rawAccId.startsWith("act_") ? rawAccId : `act_${rawAccId}`;
    setDatePreset(dp);

    const acct = await metaGet(`/${actId}`, token, { fields: "name,currency,account_status,timezone_name" });
    setAccInfo({ ...acct, actId });

    const insFields = "spend,impressions,clicks,reach,frequency,ctr,cpm,cpc,actions,action_values,cost_per_action_type";

    const campRes = await metaGet(`/${actId}/campaigns`, token, {
      fields: `name,status,objective,insights.date_preset(${dp}){${insFields}}`,
      limit: 200,
    });
    const campData = (campRes.data || []).map(c => ({
      id: c.id, name: c.name, status: c.status, objective: c.objective || "",
      ...parseIns((c.insights?.data || [])[0]),
    }));
    setCampaigns(campData);

    const adRes = await metaGet(`/${actId}/ads`, token, {
      fields: `name,status,adset_name,campaign{name},creative{name,object_type},insights.date_preset(${dp}){${insFields}}`,
      limit: 500,
    });
    const adData = (adRes.data || []).map(ad => ({
      id: ad.id, name: ad.name, status: ad.status,
      adsetName: ad.adset_name || "",
      campaignName: ad.campaign?.name || "",
      creativeType: ad.creative?.object_type || "—",
      ...parseIns((ad.insights?.data || [])[0]),
    }));
    setAds(adData);
    setPage("dashboard");
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const campRows = campaigns.map(c => ({
      "Campaña": c.name, "Estado": c.status, "Objetivo": c.objective,
      "Gasto": c.spend, "Impresiones": c.imp, "Alcance": c.reach, "Frecuencia": +c.freq.toFixed(2),
      "CTR (%)": +c.ctr.toFixed(3), "CPM": +c.cpm.toFixed(2), "CPC": +c.cpc.toFixed(2),
      "Compras": c.purch, "Leads": c.leads, "Valor Compras": c.purchVal,
      "ROAS": +c.roas.toFixed(2), "CPA": +c.cpa.toFixed(2),
      "Hook Rate (%)": +c.hookRate.toFixed(2), "Hold Rate (%)": +c.holdRate.toFixed(2), "ThruPlay": c.tp,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(campRows), "Campañas");
    const adRows = ads.map(a => ({
      "Ad": a.name, "Estado": a.status, "Tipo Creativo": a.creativeType,
      "Campaña": a.campaignName, "AdSet": a.adsetName,
      "Gasto": a.spend, "Impresiones": a.imp, "Clics": a.clicks,
      "CTR (%)": +a.ctr.toFixed(3), "CPM": +a.cpm.toFixed(2), "CPC": +a.cpc.toFixed(2),
      "Compras": a.purch, "Leads": a.leads, "Valor Compras": a.purchVal,
      "ROAS": +a.roas.toFixed(2), "CPA": +a.cpa.toFixed(2),
      "Hook Rate (%)": +a.hookRate.toFixed(2), "Hold Rate (%)": +a.holdRate.toFixed(2), "ThruPlay": a.tp,
      "Add to Cart": a.addToCart, "Init Checkout": a.initCheckout,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(adRows), "Ads - Creativos");
    
    // Summary sheet
    const sumRows = [
      { Métrica: "Gasto Total", Valor: summary.spend },
      { Métrica: "Impresiones", Valor: summary.imp },
      { Métrica: "Alcance", Valor: summary.reach },
      { Métrica: "Clics", Valor: summary.clicks },
      { Métrica: "CTR (%)", Valor: +summary.ctr.toFixed(3) },
      { Métrica: "CPM", Valor: +summary.cpm.toFixed(2) },
      { Métrica: "Compras", Valor: summary.purch },
      { Métrica: "Leads", Valor: summary.leads },
      { Métrica: "ROAS", Valor: +summary.roas.toFixed(2) },
      { Métrica: "CPA", Valor: +summary.cpa.toFixed(2) },
      { Métrica: "Hook Rate (%)", Valor: +summary.hookRate.toFixed(2) },
      { Métrica: "Hold Rate (%)", Valor: +summary.holdRate.toFixed(2) },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sumRows), "Resumen");
    XLSX.writeFile(wb, `meta_ads_${accInfo?.name?.replace(/\s/g,"_") || "cuenta"}_${dp || datePreset}.xlsx`);
  };

  if (page === "setup") return <SetupScreen onConnect={handleConnect} />;

  const TABS = [
    { id: "overview", label: "📊 Overview" },
    { id: "creativos", label: "🎬 Creativos" },
    { id: "ai", label: "🤖 Análisis IA" },
  ];

  const KPIs = [
    { label: "GASTO TOTAL", value: fm.$(summary.spend), color: PALETTE.accent },
    { label: "ROAS", value: summary.roas > 0 ? fm.x(summary.roas) : "—", color: summary.roas >= 2 ? PALETTE.green : summary.roas >= 1 ? PALETTE.yellow : PALETTE.red },
    { label: "CPA", value: summary.cpa > 0 ? fm.$(summary.cpa) : "—", color: PALETTE.purple },
    { label: "CTR", value: fm.pct(summary.ctr), color: summary.ctr > 1.5 ? PALETTE.green : PALETTE.yellow },
    { label: "CPM", value: fm.$(summary.cpm), color: PALETTE.muted },
    { label: "COMPRAS", value: fm.n(summary.purch), color: PALETTE.green },
    { label: "HOOK RATE", value: fm.pct(summary.hookRate), color: PALETTE.accent },
    { label: "HOLD RATE", value: fm.pct(summary.holdRate), color: PALETTE.purple },
  ];

  return (
    <div style={{ minHeight: "100vh", background: PALETTE.bg, color: PALETTE.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        select { background: #0e0e1c; color: #e8e8f0; border: 1px solid #1e1e3a; border-radius: 8px; }
        select option { background: #0e0e1c; }
        input:focus, select:focus { outline: none; border-color: #00e5ff !important; }
        .btn-hover:hover { opacity: 0.85; transform: translateY(-1px); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e1e3a; border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${PALETTE.border}`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: PALETTE.bg, zIndex: 100, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: PALETTE.accent, fontWeight: 700, letterSpacing: "0.15em" }}>META ADS AI ANALYZER</div>
            <div style={{ fontSize: 13, color: PALETTE.muted }}>{accInfo?.name} · {datePreset.replace("last_","Últimos ").replace("d"," días").replace("this_month","Este mes").replace("last_month","Mes pasado")}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ ...S.tag(PALETTE.green), fontSize: 10 }}>{campaigns.length} campañas</span>
          <span style={{ ...S.tag(PALETTE.purple), fontSize: 10 }}>{ads.length} ads</span>
          <button className="btn-hover" onClick={exportExcel} style={S.btn(PALETTE.green)}>⬇ Exportar Excel</button>
          <button className="btn-hover" onClick={() => setPage("setup")} style={S.btn(PALETTE.muted)}>← Reconectar</button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
        {/* KPI row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {KPIs.map(k => <KPI key={k.label} {...k} mini />)}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${PALETTE.border}`, paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "transparent", border: "none", color: tab === t.id ? PALETTE.accent : PALETTE.muted,
              padding: "10px 18px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              borderBottom: `2px solid ${tab === t.id ? PALETTE.accent : "transparent"}`,
              marginBottom: -1, transition: "all .15s",
            }}>{t.label}</button>
          ))}
        </div>

        {tab === "overview" && <OverviewTab campaigns={campaigns} summary={summary} datePreset={datePreset} />}
        {tab === "creativos" && <CreativosTab ads={ads} />}
        {tab === "ai" && <AITab campaigns={campaigns} ads={ads} summary={summary} accInfo={accInfo} datePreset={datePreset} />}
      </div>
    </div>
  );
}
