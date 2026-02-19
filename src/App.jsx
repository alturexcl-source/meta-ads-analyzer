import { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import * as XLSX from "xlsx";

const API_VER = "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VER}`;

const PALETTE = {
  bg: "#080810", surface: "#0e0e1c", card: "#13132a", border: "#1e1e3a",
  accent: "#00e5ff", green: "#00ff88", yellow: "#ffd60a", red: "#ff4d6d",
  purple: "#b388ff", text: "#e8e8f0", muted: "#6b6b8a",
};
const C = ["#00e5ff","#00ff88","#b388ff","#ffd60a","#ff4d6d","#ff9f1c","#7b2fff","#00cfcf"];

const DATE_OPTS = [
  { v: "last_7d", l: "Últimos 7 días" }, { v: "last_14d", l: "Últimos 14 días" },
  { v: "last_30d", l: "Últimos 30 días" }, { v: "last_90d", l: "Últimos 90 días" },
  { v: "this_month", l: "Este mes" }, { v: "last_month", l: "Mes pasado" },
];

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
  const spend = +ins.spend || 0, imp = +ins.impressions || 0, clicks = +ins.clicks || 0;
  const v3 = ga(a, "video_view"), tp = ga(a, "video_thruplay_watched");
  const purch = ga(a, "purchase") || ga(a, "omni_purchase");
  const leads = ga(a, "lead");
  const addToCart = ga(a, "add_to_cart"), initCheckout = ga(a, "initiate_checkout");
  const purchVal = parseFloat((av.find(x => ["purchase","omni_purchase"].includes(x.action_type)))?.value || 0);
  return {
    spend, imp, clicks, reach: +ins.reach || 0, freq: +ins.frequency || 0,
    ctr: +ins.ctr || 0, cpm: +ins.cpm || 0, cpc: +ins.cpc || 0,
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
  short: v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(1)}K` : String(v),
};

const S = {
  card: { background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: "18px 22px" },
  btn: (c = PALETTE.accent) => ({ background: "transparent", border: `1px solid ${c}`, color: c, padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all .2s" }),
  btnFill: (c = PALETTE.accent) => ({ background: c, border: "none", color: "#000", padding: "11px 24px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }),
  input: { background: "#0e0e1c", border: `1px solid ${PALETTE.border}`, color: PALETTE.text, padding: "11px 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" },
  label: { color: PALETTE.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6, display: "block" },
  tag: (c = PALETTE.accent) => ({ display: "inline-block", background: `${c}18`, color: c, border: `1px solid ${c}44`, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }),
};

function KPI({ label, value, color = PALETTE.accent }) {
  return (
    <div style={{ ...S.card, flex: 1, minWidth: 120 }}>
      <div style={S.label}>{label}</div>
      <div style={{ color: PALETTE.text, fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      <div style={{ height: 2, background: color, marginTop: 8, borderRadius: 2, opacity: 0.5 }} />
    </div>
  );
}

function Loader({ text = "Cargando..." }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 40 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${PALETTE.border}`, borderTop: `3px solid ${PALETTE.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: PALETTE.muted, fontSize: 13 }}>{text}</div>
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
          {typeof p.value === "number" ? (p.value >= 1000 ? fm.short(p.value) : p.value.toFixed(2)) : p.value}
        </div>
      ))}
    </div>
  );
};

function CreativeThumb({ ad, size = 48 }) {
  const [err, setErr] = useState(false);
  const thumb = ad.thumbnailUrl || ad.imageUrl;
  const icon = ad.creativeType === "VIDEO" ? "🎬" : ad.creativeType === "CAROUSEL" ? "🎠" : "🖼";
  if (!thumb || err) {
    return (
      <div style={{ width: size, height: size, background: PALETTE.border, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, flexShrink: 0 }}>
        {icon}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <img src={thumb} alt="" onError={() => setErr(true)}
        style={{ width: size, height: size, objectFit: "cover", borderRadius: 6, border: `1px solid ${PALETTE.border}`, display: "block" }} />
      {ad.creativeType === "VIDEO" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#00000055", borderRadius: 6 }}>
          <div style={{ width: 0, height: 0, borderLeft: `${size*0.3}px solid white`, borderTop: `${size*0.18}px solid transparent`, borderBottom: `${size*0.18}px solid transparent` }} />
        </div>
      )}
    </div>
  );
}

function AdModal({ ad, onClose }) {
  const isVideo = ad.creativeType === "VIDEO";
  const hasThumb = ad.thumbnailUrl || ad.imageUrl;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000bb", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...S.card, maxWidth: 600, width: "100%", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, color: PALETTE.text, fontSize: 15 }}>{ad.name}</div>
            <div style={{ color: PALETTE.muted, fontSize: 12, marginTop: 3 }}>{ad.campaignName} › {ad.adsetName}</div>
          </div>
          <button onClick={onClose} style={{ ...S.btn(PALETTE.muted), padding: "4px 10px", fontSize: 12, flexShrink: 0, marginLeft: 12 }}>✕</button>
        </div>

        {/* Media: video embed or image */}
        {isVideo && ad.videoId ? (
          <div style={{ marginBottom: 16, borderRadius: 8, overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
            <iframe
              src={`https://www.facebook.com/video/embed?video_id=${ad.videoId}`}
              style={{ width: "100%", height: "100%", border: "none" }}
              allowFullScreen
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            />
          </div>
        ) : hasThumb ? (
          <img src={ad.imageUrl || ad.thumbnailUrl} alt=""
            style={{ width: "100%", borderRadius: 8, marginBottom: 16, border: `1px solid ${PALETTE.border}`, maxHeight: 380, objectFit: "contain", background: "#000", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: 160, background: PALETTE.border, borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>
            {isVideo ? "🎬" : "🖼"}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <span style={S.tag(PALETTE.purple)}>{ad.creativeType}</span>
          {ad.status === "ACTIVE" && <span style={{ ...S.tag(PALETTE.green), marginLeft: 6 }}>Activo</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            ["Gasto", fm.$(ad.spend), PALETTE.text],
            ["ROAS", ad.roas > 0 ? fm.x(ad.roas) : "—", ad.roas >= 2 ? PALETTE.green : ad.roas >= 1 ? PALETTE.yellow : ad.roas > 0 ? PALETTE.red : PALETTE.muted],
            ["CPA", ad.cpa > 0 ? fm.$(ad.cpa) : "—", PALETTE.purple],
            ["CTR", fm.pct(ad.ctr), ad.ctr > 1.5 ? PALETTE.green : ad.ctr > 0.8 ? PALETTE.yellow : PALETTE.red],
            ["CPM", fm.$(ad.cpm), PALETTE.muted],
            ["CPC", fm.$(ad.cpc), PALETTE.muted],
            ["Hook Rate", ad.hookRate > 0 ? fm.pct(ad.hookRate) : "—", ad.hookRate > 30 ? PALETTE.green : ad.hookRate > 15 ? PALETTE.yellow : PALETTE.muted],
            ["Hold Rate", ad.holdRate > 0 ? fm.pct(ad.holdRate) : "—", ad.holdRate > 40 ? PALETTE.green : ad.holdRate > 20 ? PALETTE.yellow : PALETTE.muted],
            ["Compras", String(ad.purch || "—"), PALETTE.green],
            ["Leads", String(ad.leads || "—"), PALETTE.accent],
            ["Add to Cart", String(ad.addToCart || "—"), PALETTE.yellow],
            ["ThruPlay", fm.n(ad.tp), PALETTE.muted],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: "#0e0e1c", padding: "10px 12px", borderRadius: 8 }}>
              <div style={S.label}>{label}</div>
              <div style={{ color, fontWeight: 700, fontSize: 13, fontFamily: "DM Mono,monospace" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SetupScreen({ onConnect }) {
  const [token, setToken] = useState("");
  const [accId, setAccId] = useState("");
  const [datePreset, setDatePreset] = useState("last_30d");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);

  const connect = async () => {
    if (!token.trim() || !accId.trim()) { setErr("Completá todos los campos."); return; }
    setLoading(true); setErr("");
    try { await onConnect(token.trim(), accId.trim(), datePreset); }
    catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: PALETTE.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        input:focus,select:focus{border-color:#00e5ff !important;outline:none}
        select option{background:#0e0e1c} a{color:#00e5ff}
        .bhov:hover{opacity:.85;transform:translateY(-1px)}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-thumb{background:#1e1e3a;border-radius:3px}
      `}</style>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", color: PALETTE.accent, marginBottom: 8 }}>META ADS</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: PALETTE.text }}>AI Analyzer</div>
          <div style={{ color: PALETTE.muted, fontSize: 14, marginTop: 8 }}>Media buyer + estratega creativo con IA</div>
        </div>
        <div style={S.card}>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {["Conectar", "Cómo obtener token"].map((t, i) => (
              <button key={i} onClick={() => setStep(i)} style={{ ...S.btn(i === step ? PALETTE.accent : PALETTE.border), flex: 1 }}>{t}</button>
            ))}
          </div>
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={S.label}>ACCESS TOKEN *</label>
                <input style={S.input} type="password" placeholder="EAAxxxxxxx..." value={token} onChange={e => setToken(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>AD ACCOUNT ID *</label>
                <input style={S.input} placeholder="act_1234567890 o solo el número" value={accId} onChange={e => setAccId(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>PERÍODO INICIAL</label>
                <select style={{ ...S.input }} value={datePreset} onChange={e => setDatePreset(e.target.value)}>
                  {DATE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              {err && <div style={{ background: `${PALETTE.red}18`, border: `1px solid ${PALETTE.red}44`, color: PALETTE.red, padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>{err}</div>}
              <button className="bhov" onClick={connect} disabled={loading} style={S.btnFill()}>
                {loading ? "Conectando..." : "→ Conectar y Analizar"}
              </button>
            </div>
          )}
          {step === 1 && (
            <div style={{ fontSize: 13, color: PALETTE.muted, lineHeight: 1.8 }}>
              <div style={{ color: PALETTE.text, fontWeight: 700, marginBottom: 12 }}>Pasos para obtener tu token:</div>
              {[
                <span>Andá a <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer">Graph API Explorer</a></span>,
                "Seleccioná tu app de Meta",
                "Clickeá Generate Access Token",
                <span>Activá: <span style={S.tag(PALETTE.accent)}>ads_read</span> <span style={S.tag(PALETTE.purple)}>ads_management</span></span>,
                <span>El Ad Account ID está en la URL del Ads Manager: <code style={{ color: PALETTE.accent }}>?act=XXXXXXXXXX</code></span>,
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ minWidth: 22, height: 22, background: `${PALETTE.accent}22`, color: PALETTE.accent, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{i + 1}</div>
                  <div>{s}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ campaigns }) {
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 10);
  const roasSorted = [...campaigns].filter(c => c.roas > 0).sort((a, b) => b.roas - a.roas).slice(0, 10);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={S.card}>
        <div style={S.label}>GASTO POR CAMPAÑA</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={sorted.map(c => ({ name: c.name.slice(0,22), Gasto: +c.spend.toFixed(2) }))} margin={{ left: 0, right: 10, bottom: 60 }}>
            <CartesianGrid stroke={PALETTE.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: PALETTE.muted, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: PALETTE.muted, fontSize: 10 }} tickFormatter={v => `$${fm.short(v)}`} />
            <Tooltip content={<TTip />} />
            <Bar dataKey="Gasto" radius={[4,4,0,0]}>
              {sorted.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ ...S.card, flex: 2, minWidth: 280 }}>
          <div style={S.label}>ROAS POR CAMPAÑA</div>
          <ResponsiveContainer width="100%" height={200}>
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
        <div style={{ ...S.card, flex: 1, minWidth: 220 }}>
          <div style={S.label}>RADAR DE SALUD</div>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={[
              { m: "CTR", v: Math.min(campaigns.reduce((a,c)=>a+c.ctr,0)/campaigns.length*20,100) },
              { m: "Hook", v: Math.min(campaigns.reduce((a,c)=>a+c.hookRate,0)/campaigns.length*2,100) },
              { m: "ROAS", v: Math.min(campaigns.filter(c=>c.roas>0).reduce((a,c)=>a+c.roas,0)/(campaigns.filter(c=>c.roas>0).length||1)*15,100) },
              { m: "Freq OK", v: Math.max(0,100-(campaigns.reduce((a,c)=>a+c.freq,0)/campaigns.length)*15) },
            ]}>
              <PolarGrid stroke={PALETTE.border} />
              <PolarAngleAxis dataKey="m" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
              <Radar dataKey="v" stroke={PALETTE.accent} fill={PALETTE.accent} fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={S.card}>
        <div style={S.label}>DETALLE DE CAMPAÑAS</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                {["Campaña","Estado","Objetivo","Gasto","Impres.","CTR","CPM","CPC","Compras","ROAS","CPA","Hook%","Hold%"].map(h => (
                  <th key={h} style={{ color: PALETTE.muted, fontWeight: 600, padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...campaigns].sort((a,b)=>b.spend-a.spend).map((c, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.border}22` }}
                  onMouseEnter={e=>e.currentTarget.style.background="#ffffff08"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"9px 10px",color:PALETTE.text,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.name}</td>
                  <td style={{ padding:"9px 10px" }}><span style={S.tag(c.status==="ACTIVE"?PALETTE.green:PALETTE.muted)}>{c.status==="ACTIVE"?"Activa":c.status}</span></td>
                  <td style={{ padding:"9px 10px",color:PALETTE.muted,fontSize:11 }}>{c.objective}</td>
                  <td style={{ padding:"9px 10px",color:PALETTE.text,fontFamily:"DM Mono,monospace" }}>{fm.$(c.spend)}</td>
                  <td style={{ padding:"9px 10px",color:PALETTE.muted,fontFamily:"DM Mono,monospace" }}>{fm.short(c.imp)}</td>
                  <td style={{ padding:"9px 10px",fontFamily:"DM Mono,monospace",color:c.ctr>1.5?PALETTE.green:c.ctr>0.8?PALETTE.yellow:PALETTE.red }}>{fm.pct(c.ctr)}</td>
                  <td style={{ padding:"9px 10px",color:PALETTE.muted,fontFamily:"DM Mono,monospace" }}>{fm.$(c.cpm)}</td>
                  <td style={{ padding:"9px 10px",color:PALETTE.muted,fontFamily:"DM Mono,monospace" }}>{fm.$(c.cpc)}</td>
                  <td style={{ padding:"9px 10px",color:PALETTE.text,fontFamily:"DM Mono,monospace" }}>{c.purch||"—"}</td>
                  <td style={{ padding:"9px 10px",fontFamily:"DM Mono,monospace",color:c.roas>=2?PALETTE.green:c.roas>=1?PALETTE.yellow:c.roas>0?PALETTE.red:PALETTE.muted }}>{c.roas>0?fm.x(c.roas):"—"}</td>
                  <td style={{ padding:"9px 10px",color:PALETTE.muted,fontFamily:"DM Mono,monospace" }}>{c.cpa>0?fm.$(c.cpa):"—"}</td>
                  <td style={{ padding:"9px 10px",fontFamily:"DM Mono,monospace",color:c.hookRate>30?PALETTE.green:c.hookRate>15?PALETTE.yellow:PALETTE.muted }}>{c.hookRate>0?fm.pct(c.hookRate):"—"}</td>
                  <td style={{ padding:"9px 10px",fontFamily:"DM Mono,monospace",color:c.holdRate>40?PALETTE.green:c.holdRate>20?PALETTE.yellow:PALETTE.muted }}>{c.holdRate>0?fm.pct(c.holdRate):"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CreativosTab({ ads }) {
  const [sort, setSort] = useState("spend");
  const [filterMin, setFilterMin] = useState(0);
  const [selectedAd, setSelectedAd] = useState(null);
  const filtered = [...ads].filter(a => a.spend >= filterMin).sort((a, b) => b[sort] - a[sort]);
  const SORT_OPTS = [{v:"spend",l:"Gasto"},{v:"roas",l:"ROAS"},{v:"cpa",l:"CPA"},{v:"hookRate",l:"Hook Rate"},{v:"holdRate",l:"Hold Rate"},{v:"ctr",l:"CTR"}];
  const scatterData = ads.filter(a => a.spend > 5 && a.hookRate > 0).map(a => ({ x: +a.hookRate.toFixed(2), y: +a.holdRate.toFixed(2), z: a.spend, name: a.name }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[
          { title: "🎣 MEJORES HOOK RATES", list: [...ads].filter(a=>a.hookRate>0).sort((a,b)=>b.hookRate-a.hookRate).slice(0,5), metric: a=>fm.pct(a.hookRate), color: PALETTE.accent },
          { title: "💰 MEJORES ROAS", list: [...ads].filter(a=>a.roas>0).sort((a,b)=>b.roas-a.roas).slice(0,5), metric: a=>fm.x(a.roas), color: PALETTE.green },
        ].map(({ title, list, metric, color }) => (
          <div key={title} style={{ ...S.card, flex: 1, minWidth: 280 }}>
            <div style={{ ...S.label, marginBottom: 14 }}>{title}</div>
            {list.map((a, i) => (
              <div key={i} onClick={() => setSelectedAd(a)} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10,cursor:"pointer",padding:"6px 8px",borderRadius:8 }}
                onMouseEnter={e=>e.currentTarget.style.background="#ffffff08"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <CreativeThumb ad={a} size={44} />
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ color:PALETTE.text,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{a.name}</div>
                  <div style={{ color:PALETTE.muted,fontSize:10 }}>{a.campaignName}</div>
                  <div style={{ color:PALETTE.muted,fontSize:10 }}>📁 {a.adsetName}</div>
                </div>
                <div style={{ color,fontFamily:"DM Mono,monospace",fontSize:13,fontWeight:700,flexShrink:0 }}>{metric(a)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {scatterData.length > 1 && (
        <div style={S.card}>
          <div style={S.label}>HOOK RATE vs HOLD RATE — tamaño = gasto</div>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top:5,right:20,left:0,bottom:5 }}>
              <CartesianGrid stroke={PALETTE.border} strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Hook" unit="%" tick={{ fill:PALETTE.muted,fontSize:10 }} />
              <YAxis type="number" dataKey="y" name="Hold" unit="%" tick={{ fill:PALETTE.muted,fontSize:10 }} />
              <ZAxis type="number" dataKey="z" range={[30,300]} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return <div style={{ background:"#1a1a30",border:`1px solid ${PALETTE.border}`,padding:"10px 14px",borderRadius:8,fontSize:11 }}>
                  <div style={{ color:PALETTE.text,maxWidth:200,marginBottom:4 }}>{d.name}</div>
                  <div style={{ color:PALETTE.accent }}>Hook: {d.x}% | Hold: {d.y}%</div>
                  <div style={{ color:PALETTE.muted }}>Gasto: {fm.$(d.z)}</div>
                </div>;
              }} />
              <Scatter data={scatterData} fill={PALETTE.accent} fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={S.card}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10 }}>
          <div style={S.label}>TODOS LOS ADS ({filtered.length}) — clic para ver creativo</div>
          <div style={{ display:"flex",gap:10,alignItems:"center" }}>
            <span style={{ color:PALETTE.muted,fontSize:11 }}>Min. $</span>
            <input type="number" value={filterMin} onChange={e=>setFilterMin(+e.target.value)} style={{ ...S.input,width:70,padding:"6px 10px",fontSize:12 }} />
            <span style={{ color:PALETTE.muted,fontSize:11 }}>Ordenar:</span>
            <select value={sort} onChange={e=>setSort(e.target.value)} style={{ ...S.input,width:"auto",padding:"6px 10px",fontSize:12 }}>
              {SORT_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${PALETTE.border}` }}>
                {["","Ad","Conjunto","Campaña","Tipo","Gasto","CTR","CPM","Hook%","Hold%","Compras","ROAS","CPA"].map(h=>(
                  <th key={h} style={{ color:PALETTE.muted,fontWeight:600,padding:"8px 10px",textAlign:"left",whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${PALETTE.border}22`,cursor:"pointer" }}
                  onClick={()=>setSelectedAd(a)}
                  onMouseEnter={e=>e.currentTarget.style.background="#ffffff08"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"8px 10px" }}><CreativeThumb ad={a} size={44} /></td>
                  <td style={{ padding:"8px 10px",color:PALETTE.text,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{a.name}</td>
                  <td style={{ padding:"8px 10px",color:PALETTE.muted,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{a.adsetName}</td>
                  <td style={{ padding:"8px 10px",color:PALETTE.muted,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{a.campaignName}</td>
                  <td style={{ padding:"8px 10px" }}><span style={S.tag(PALETTE.purple)}>{a.creativeType}</span></td>
                  <td style={{ padding:"8px 10px",color:PALETTE.text,fontFamily:"DM Mono,monospace" }}>{fm.$(a.spend)}</td>
                  <td style={{ padding:"8px 10px",fontFamily:"DM Mono,monospace",color:a.ctr>1.5?PALETTE.green:a.ctr>0.8?PALETTE.yellow:PALETTE.red }}>{fm.pct(a.ctr)}</td>
                  <td style={{ padding:"8px 10px",color:PALETTE.muted,fontFamily:"DM Mono,monospace" }}>{fm.$(a.cpm)}</td>
                  <td style={{ padding:"8px 10px",fontFamily:"DM Mono,monospace",color:a.hookRate>30?PALETTE.green:a.hookRate>15?PALETTE.yellow:PALETTE.muted }}>{a.hookRate>0?fm.pct(a.hookRate):"—"}</td>
                  <td style={{ padding:"8px 10px",fontFamily:"DM Mono,monospace",color:a.holdRate>40?PALETTE.green:a.holdRate>20?PALETTE.yellow:PALETTE.muted }}>{a.holdRate>0?fm.pct(a.holdRate):"—"}</td>
                  <td style={{ padding:"8px 10px",color:PALETTE.text,fontFamily:"DM Mono,monospace" }}>{a.purch||"—"}</td>
                  <td style={{ padding:"8px 10px",fontFamily:"DM Mono,monospace",color:a.roas>=2?PALETTE.green:a.roas>=1?PALETTE.yellow:a.roas>0?PALETTE.red:PALETTE.muted }}>{a.roas>0?fm.x(a.roas):"—"}</td>
                  <td style={{ padding:"8px 10px",color:PALETTE.muted,fontFamily:"DM Mono,monospace" }}>{a.cpa>0?fm.$(a.cpa):"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedAd && <AdModal ad={selectedAd} onClose={() => setSelectedAd(null)} />}
    </div>
  );
}

function AITab({ campaigns, ads, summary, accInfo, datePreset }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setLoading(true); setErr(""); setText("");
    try {
      const topAds = [...ads].sort((a,b)=>b.roas-a.roas||b.purch-a.purch).slice(0,15);
      const botAds = [...ads].filter(a=>a.spend>10).sort((a,b)=>(a.roas||0)-(b.roas||0)).slice(0,8);
      const adBlock = list => list.map(a =>
        `• ${a.name} [${a.creativeType}]\n  Campaña: ${a.campaignName} | Conjunto: ${a.adsetName}\n  Gasto:${fm.$(a.spend)} CTR:${fm.pct(a.ctr)} ROAS:${fm.x(a.roas)} CPA:${a.cpa>0?fm.$(a.cpa):"N/A"} Compras:${a.purch||0} Hook:${fm.pct(a.hookRate)} Hold:${fm.pct(a.holdRate)}`
      ).join("\n");

      const prompt = `Sos un senior media buyer y estratega creativo con 10+ años en Meta Ads. Sos directo y 100% basado en datos.

CUENTA: ${accInfo?.name} | Período: ${datePreset}
Gasto: ${fm.$(summary.spend)} | ROAS: ${fm.x(summary.roas)} | CPA: ${summary.cpa>0?fm.$(summary.cpa):"N/A"} | CTR: ${fm.pct(summary.ctr)} | Compras: ${summary.purch} | Hook Rate: ${fm.pct(summary.hookRate)}

CAMPAÑAS:
${campaigns.map(c=>`• ${c.name} | ${c.objective} | Gasto:${fm.$(c.spend)} ROAS:${fm.x(c.roas)} CTR:${fm.pct(c.ctr)} Hook:${fm.pct(c.hookRate)}`).join("\n")}

TOP PERFORMERS:
${adBlock(topAds)}

PEORES:
${adBlock(botAds)}

Analizá en español con estas secciones:
## 🎯 RESUMEN EJECUTIVO
## 📊 ANÁLISIS DE CAMPAÑAS
## 🎬 QUÉ ESTÁ FUNCIONANDO EN CREATIVOS
## 👥 AUDIENCIAS / CONJUNTOS
## 📉 DIAGNÓSTICO DE LO QUE NO FUNCIONA
## 🚀 ITERACIONES CREATIVAS (6-8 con: nombre, formato, hook, ángulo, audiencia, por qué funciona)
## ⚡ ACCIONES INMEDIATAS (5 concretas esta semana)`;

      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const out = (data.content || []).map(b => b.text || "").join("\n");
      if (!out) throw new Error(data.error?.message || "Sin respuesta");
      setText(out);
    } catch(e) { setErr("Error: " + e.message); }
    finally { setLoading(false); }
  };

  const renderText = t => t.split("\n").map((line, i) => {
    if (line.startsWith("## ")) return <div key={i} style={{ color:PALETTE.accent,fontSize:15,fontWeight:700,marginTop:24,marginBottom:10,paddingBottom:6,borderBottom:`1px solid ${PALETTE.border}` }}>{line.replace("## ","")}</div>;
    if (line.startsWith("- ")||line.startsWith("• ")) {
      const parts = line.replace(/^[-•]\s+/,"").split("**");
      return <div key={i} style={{ display:"flex",gap:8,marginBottom:5,paddingLeft:12 }}>
        <span style={{ color:PALETTE.accent }}>›</span>
        <div style={{ color:PALETTE.muted,fontSize:13,lineHeight:1.6 }}>{parts.map((p,j)=>j%2===1?<strong key={j} style={{ color:PALETTE.text }}>{p}</strong>:p)}</div>
      </div>;
    }
    if (!line.trim()) return <div key={i} style={{ height:8 }} />;
    const parts = line.split("**");
    return <div key={i} style={{ color:PALETTE.muted,fontSize:13,lineHeight:1.7,marginBottom:2 }}>
      {parts.map((p,j)=>j%2===1?<strong key={j} style={{ color:PALETTE.text }}>{p}</strong>:p)}
    </div>;
  });

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      <div style={S.card}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12 }}>
          <div>
            <div style={{ color:PALETTE.text,fontWeight:700,fontSize:15 }}>Análisis IA: Media Buyer + Estratega Creativo</div>
            <div style={{ color:PALETTE.muted,fontSize:12,marginTop:4 }}>Análisis profundo de campañas, creativos, audiencias e iteraciones</div>
          </div>
          <button className="bhov" onClick={run} disabled={loading} style={S.btnFill()}>
            {loading?"Analizando...":"⚡ Analizar con IA"}
          </button>
        </div>
      </div>
      {loading && <div style={S.card}><Loader text="Analizando tu cuenta como senior media buyer..." /></div>}
      {err && <div style={{ ...S.card,borderColor:`${PALETTE.red}44` }}><div style={{ color:PALETTE.red,fontSize:13 }}>{err}</div></div>}
      {text && <div style={S.card}>{renderText(text)}</div>}
      {!text && !loading && (
        <div style={{ ...S.card,textAlign:"center",padding:48 }}>
          <div style={{ fontSize:32,marginBottom:12 }}>🤖</div>
          <div style={{ color:PALETTE.muted,fontSize:14 }}>Hacé clic en "Analizar con IA" para el análisis completo</div>
        </div>
      )}
    </div>
  );
}

export default function MetaAnalyzer() {
  const [page, setPage] = useState("setup");
  const [tab, setTab] = useState("overview");
  const [campaigns, setCampaigns] = useState([]);
  const [ads, setAds] = useState([]);
  const [accInfo, setAccInfo] = useState(null);
  const [datePreset, setDatePreset] = useState("last_30d");
  const [savedToken, setSavedToken] = useState("");
  const [savedActId, setSavedActId] = useState("");
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  const summary = useMemo(() => {
    const s = campaigns.reduce((acc,c)=>({
      spend:acc.spend+c.spend,imp:acc.imp+c.imp,clicks:acc.clicks+c.clicks,
      purch:acc.purch+c.purch,leads:acc.leads+c.leads,purchVal:acc.purchVal+c.purchVal,
      v3:acc.v3+c.v3,tp:acc.tp+c.tp,
    }),{spend:0,imp:0,clicks:0,purch:0,leads:0,purchVal:0,v3:0,tp:0});
    return {...s,
      ctr:s.imp>0?(s.clicks/s.imp)*100:0,
      cpm:s.imp>0?(s.spend/s.imp)*1000:0,
      cpa:s.purch>0?s.spend/s.purch:0,
      roas:s.spend>0&&s.purchVal>0?s.purchVal/s.spend:0,
      hookRate:s.imp>0?(s.v3/s.imp)*100:0,
      holdRate:s.v3>0?(s.tp/s.v3)*100:0,
    };
  }, [campaigns]);

  const loadData = useCallback(async (tkn, aid, dp) => {
    const insF = "spend,impressions,clicks,reach,frequency,ctr,cpm,cpc,actions,action_values";
    const campRes = await metaGet(`/${aid}/campaigns`, tkn, {
      fields: `name,status,objective,insights.date_preset(${dp}){${insF}}`, limit: 200,
    });
    setCampaigns((campRes.data||[]).map(c=>({
      id:c.id,name:c.name,status:c.status,objective:c.objective||"",
      ...parseIns((c.insights?.data||[])[0]),
    })));
    const adRes = await metaGet(`/${aid}/ads`, tkn, {
      fields: `name,status,adset_name,campaign{name},creative{name,object_type,thumbnail_url,image_url,video_id},insights.date_preset(${dp}){${insF}}`,
      limit: 500,
    });
    setAds((adRes.data||[]).map(ad=>({
      id:ad.id,name:ad.name,status:ad.status,
      adsetName:ad.adset_name||"",
      campaignName:ad.campaign?.name||"",
      creativeType:ad.creative?.object_type||"—",
      thumbnailUrl:ad.creative?.thumbnail_url||"",
      imageUrl:ad.creative?.image_url||"",
      videoId:ad.creative?.video_id||"",
      ...parseIns((ad.insights?.data||[])[0]),
    })));
  }, []);

  const handleConnect = async (tkn, rawAccId, dp) => {
    const aid = rawAccId.startsWith("act_") ? rawAccId : `act_${rawAccId}`;
    const acct = await metaGet(`/${aid}`, tkn, { fields: "name,currency,account_status" });
    setAccInfo({ ...acct, aid });
    setSavedToken(tkn);
    setSavedActId(aid);
    setDatePreset(dp);
    await loadData(tkn, aid, dp);
    setPage("dashboard");
  };

  const handlePeriodChange = async (newDp) => {
    setDatePreset(newDp);
    setLoadingPeriod(true);
    try { await loadData(savedToken, savedActId, newDp); }
    catch(e) { console.error(e); }
    finally { setLoadingPeriod(false); }
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(campaigns.map(c=>({
      "Campaña":c.name,"Estado":c.status,"Objetivo":c.objective,
      "Gasto":c.spend,"Impresiones":c.imp,"CTR(%)":+c.ctr.toFixed(3),"CPM":+c.cpm.toFixed(2),
      "Compras":c.purch,"ROAS":+c.roas.toFixed(2),"CPA":+c.cpa.toFixed(2),
      "Hook Rate(%)":+c.hookRate.toFixed(2),"Hold Rate(%)":+c.holdRate.toFixed(2),
    }))), "Campañas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ads.map(a=>({
      "Ad":a.name,"Campaña":a.campaignName,"Conjunto":a.adsetName,"Tipo":a.creativeType,
      "Gasto":a.spend,"CTR(%)":+a.ctr.toFixed(3),"CPM":+a.cpm.toFixed(2),
      "Compras":a.purch,"ROAS":+a.roas.toFixed(2),"CPA":+a.cpa.toFixed(2),
      "Hook Rate(%)":+a.hookRate.toFixed(2),"Hold Rate(%)":+a.holdRate.toFixed(2),
    }))), "Creativos");
    XLSX.writeFile(wb, `meta_ads_${accInfo?.name?.replace(/\s/g,"_")||"cuenta"}_${datePreset}.xlsx`);
  };

  if (page === "setup") return <SetupScreen onConnect={handleConnect} />;

  const KPIS = [
    {label:"GASTO TOTAL",value:fm.$(summary.spend),color:PALETTE.accent},
    {label:"ROAS",value:summary.roas>0?fm.x(summary.roas):"—",color:summary.roas>=2?PALETTE.green:PALETTE.yellow},
    {label:"CPA",value:summary.cpa>0?fm.$(summary.cpa):"—",color:PALETTE.purple},
    {label:"CTR",value:fm.pct(summary.ctr),color:summary.ctr>1.5?PALETTE.green:PALETTE.yellow},
    {label:"CPM",value:fm.$(summary.cpm),color:PALETTE.muted},
    {label:"COMPRAS",value:fm.n(summary.purch),color:PALETTE.green},
    {label:"HOOK RATE",value:fm.pct(summary.hookRate),color:PALETTE.accent},
    {label:"HOLD RATE",value:fm.pct(summary.holdRate),color:PALETTE.purple},
  ];

  return (
    <div style={{ minHeight:"100vh",background:PALETTE.bg,color:PALETTE.text,fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        select{background:#0e0e1c;color:#e8e8f0;border:1px solid #1e1e3a;border-radius:8px}
        select option{background:#0e0e1c}
        input:focus,select:focus{outline:none;border-color:#00e5ff !important}
        .bhov:hover{opacity:.85;transform:translateY(-1px)}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-thumb{background:#1e1e3a;border-radius:3px}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{ borderBottom:`1px solid ${PALETTE.border}`,padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:PALETTE.bg,zIndex:100,flexWrap:"wrap",gap:10 }}>
        <div>
          <div style={{ fontSize:11,color:PALETTE.accent,fontWeight:700,letterSpacing:"0.15em" }}>META ADS AI ANALYZER</div>
          <div style={{ fontSize:12,color:PALETTE.muted }}>{accInfo?.name}</div>
        </div>

        {/* Period selector inline in header */}
        <div style={{ display:"flex",alignItems:"center",gap:8,background:PALETTE.card,border:`1px solid ${PALETTE.border}`,borderRadius:10,padding:"7px 14px" }}>
          <span style={{ fontSize:13 }}>📅</span>
          <select value={datePreset} onChange={e=>handlePeriodChange(e.target.value)} disabled={loadingPeriod}
            style={{ background:"transparent",border:"none",color:PALETTE.text,fontSize:13,fontWeight:600,cursor:"pointer",outline:"none",padding:0,minWidth:140 }}>
            {DATE_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          {loadingPeriod && <div style={{ width:14,height:14,border:`2px solid ${PALETTE.border}`,borderTop:`2px solid ${PALETTE.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0 }} />}
        </div>

        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          <span style={S.tag(PALETTE.green)}>{campaigns.length} campañas</span>
          <span style={S.tag(PALETTE.purple)}>{ads.length} ads</span>
          <button className="bhov" onClick={exportExcel} style={S.btn(PALETTE.green)}>⬇ Excel</button>
          <button className="bhov" onClick={()=>setPage("setup")} style={S.btn(PALETTE.muted)}>← Reconectar</button>
        </div>
      </div>

      <div style={{ padding:"20px 24px",maxWidth:1400,margin:"0 auto" }}>
        <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginBottom:20 }}>
          {KPIS.map(k=><KPI key={k.label} {...k} />)}
        </div>
        <div style={{ display:"flex",gap:4,marginBottom:20,borderBottom:`1px solid ${PALETTE.border}` }}>
          {[{id:"overview",l:"📊 Overview"},{id:"creativos",l:"🎬 Creativos"},{id:"ai",l:"🤖 Análisis IA"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:"transparent",border:"none",color:tab===t.id?PALETTE.accent:PALETTE.muted,padding:"10px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600,borderBottom:`2px solid ${tab===t.id?PALETTE.accent:"transparent"}`,marginBottom:-1,transition:"all .15s" }}>{t.l}</button>
          ))}
        </div>
        {tab==="overview" && <OverviewTab campaigns={campaigns} />}
        {tab==="creativos" && <CreativosTab ads={ads} />}
        {tab==="ai" && <AITab campaigns={campaigns} ads={ads} summary={summary} accInfo={accInfo} datePreset={datePreset} />}
      </div>
    </div>
  );
}
