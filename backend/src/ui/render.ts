import type { Identity } from "../identity";
import { LANE_HELPERS_SRC, TIME_HELPERS_SRC } from "./client-helpers";

/**
 * Node-free UI: a single self-contained HTML page with inline CSS (responsive,
 * light/dark) and a vanilla-JS client that drives the JSON API. Served by the
 * Worker behind Cloudflare Access (dev mode stubs identity server-side).
 */
export function renderApp(
  identity: Identity,
  admin: boolean,
  accountId: string,
  gate: { status: string; requested: boolean },
): string {
  const data = JSON.stringify({
    email: identity.email,
    admin,
    accountId,
    status: gate.status,
    requested: gate.requested,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>FlexiTracker</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>FlexiTracker</h1>
  <div id="who"></div>
</header>
<nav id="tabs">
  <button data-tab="week" class="active">Week</button>
  <button data-tab="settings">Settings</button>
  <button data-tab="machines">Machines</button>
  <button data-tab="admin" class="admin-only" hidden>Admin</button>
</nav>
<main id="view">Loading…</main>
<script>window.__FLEXITRACKER__=${data};</script>
<script>${CLIENT}</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function devicePage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>FlexiTracker — ${escHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header><h1>FlexiTracker</h1></header>
<main><div class="gate card"><h2>${escHtml(title)}</h2>${bodyHtml}</div></main>
</body>
</html>`;
}

/**
 * The daemon `login` browser flow lands here (Access-protected, so Google
 * sign-in already happened by the time this renders). A plain HTML form posts
 * back to the same path — no client JS needed for a one-shot approval.
 */
export function renderDeviceApproval(
  label: string,
  cb: string,
  state: string,
  machineId: string | null,
  conflict: { lastSeen: number } | null,
): string {
  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${name}" value="${escHtml(value)}">`;
  const fields =
    hidden("label", label) + hidden("cb", cb) + hidden("state", state) + hidden("machine_id", machineId ?? "");
  // Pre-selected to "work" (the common case), changeable before the user
  // commits. Only takes effect when a Machine is actually created — ignored
  // when "Replace it" reuses an existing Machine's own role.
  const roleFields = `
       <fieldset class="role">
         <legend>Machine type</legend>
         <label><input type="radio" name="role" value="work" checked> Work</label>
         <label><input type="radio" name="role" value="personal"> Personal</label>
       </fieldset>`;
  const body = conflict
    ? `<p>A machine named <b>${escHtml(label)}</b> is already active — last seen ${escHtml(new Date(conflict.lastSeen).toLocaleString())}.</p>
       <p class="muted">Replace it (its daemon will stop being accepted) or create a separate machine instead.</p>
       <form method="post" action="/device/authorize">${fields}${roleFields}
         <p class="muted">Machine type only applies if you create a separate machine — replacing keeps the existing machine's type.</p>
         <button class="act" name="decision" value="replace">Replace it</button>
         <button class="act" name="decision" value="separate">Create a separate machine</button>
       </form>`
    : `<p>Authorize a machine named <b>${escHtml(label)}</b> to send activity data to your account.</p>
       <form method="post" action="/device/authorize">${fields}${roleFields}
         <button class="act" name="decision" value="approve">Approve</button>
       </form>`;
  return devicePage("Authorize machine", body);
}

export function renderDeviceNotActive(status: string): string {
  return devicePage(
    "Account not active",
    `<p>Your account is <b>${escHtml(status)}</b> — ask an administrator to approve it before authorizing a machine.</p>`,
  );
}

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--muted:#666;--line:#ddd;--line2:#cfd3da;
--panel:#f6f8fb;--panel2:#eef1f6;--tick:#aab2be;--tick-strong:#7c8593;--tick-faint:#cdd3dc;--idle:#c9ced6;
--sensor:#2a7ade;--bridged:#1e58a0;--review:#e0a458;--remove:#d05;--pos:#2e9e6b;--neg:#d05;--excluded:#8b95a6;}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8e8e8;--muted:#9aa;--line:#333;--line2:#3a414b;
--panel:#1b1e24;--panel2:#22262e;--tick:#4a525d;--tick-strong:#6b7480;--tick-faint:#333a43;--idle:#3a414b;--pos:#4fc98d;--neg:#ff5c86;--excluded:#7c8698;}}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-bottom:1px solid var(--line)}
header h1{font-size:1.1rem;margin:0}
#who{color:var(--muted);font-size:.85rem}
nav{display:flex;gap:.25rem;padding:.5rem 1rem;border-bottom:1px solid var(--line);flex-wrap:wrap}
nav button{background:none;border:1px solid var(--line);color:var(--fg);padding:.4rem .8rem;border-radius:6px;cursor:pointer}
nav button.active{background:var(--sensor);color:#fff;border-color:var(--sensor)}
main{max-width:900px;margin:0 auto;padding:1rem}
.row{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap}
.card{border:1px solid var(--line);border-radius:10px;padding:.75rem 1rem;margin:.5rem 0}
.day{cursor:pointer}
.day.today{outline:2px solid var(--sensor)}
.balance.pos{color:var(--pos)}.balance.neg{color:var(--neg)}
.muted{color:var(--muted);font-size:.85rem}
.big{font-size:1.4rem;font-weight:600}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:.5rem 0 1rem}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem}
.stat .k{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
.stat .v{font-size:1.25rem;font-weight:650;margin-top:.1rem;font-variant-numeric:tabular-nums}
.stat .v.pos{color:var(--pos)}.stat .v.neg{color:var(--neg)}
.lane{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.55rem .65rem;margin:.4rem 0}
.lane.today{border-color:var(--sensor);box-shadow:inset 0 0 0 1px var(--sensor)}
/* Non-working days recede: a faint neutral wash (over --panel, distinct from the
   --panel2 track), a dashed border as a non-colour cue, and a muted label. */
.lane.off{background-image:linear-gradient(rgba(128,136,150,.09),rgba(128,136,150,.09));border-style:dashed}
.lane.off .dl b{color:var(--muted)}
.lane.today.off{border-style:solid} /* today keeps its emphasis */
.offtag{margin-left:.35rem;padding:0 .28rem;font-size:.6rem;text-transform:uppercase;letter-spacing:.03em;
 color:var(--muted);border:1px solid var(--line2);border-radius:4px;vertical-align:middle}
/* Holiday tag: a filled accent chip, distinct from the outline "off" chip. */
.offtag.holiday{color:var(--bg);background:var(--review);border-color:var(--review)}
.nums .lunch{display:block;font-size:.72rem;color:var(--muted)}
.lane-head{display:grid;grid-template-columns:96px 1fr 118px;gap:.6rem;align-items:center}
.dl{font-size:.8rem;line-height:1.2;cursor:pointer;user-select:none}
.dl b{display:block;font-size:.9rem}.dl .date{color:var(--muted)}
.chev{display:inline-block;font-size:.65rem;color:var(--muted);transition:transform .15s;margin-right:.2rem}
.lane.open .chev{transform:rotate(90deg)}
.nums{text-align:right;font-size:.8rem;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.nums .worked{display:block;font-size:1.05rem;font-weight:650;color:var(--fg)}
.nums .bal{font-weight:600}.nums .bal.pos{color:var(--pos)}.nums .bal.neg{color:var(--neg)}
.tl{cursor:pointer;user-select:none}
.track{position:relative;height:30px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);overflow:hidden;
 background-image:repeating-linear-gradient(90deg,var(--tick-strong) 0 1px,transparent 1px calc(100%/24)),
 repeating-linear-gradient(90deg,var(--tick) 0 1px,transparent 1px calc(100%/48)),
 repeating-linear-gradient(90deg,var(--tick-faint) 0 1px,transparent 1px calc(100%/96));
 background-size:100% 30px,100% 16px,100% 8px;background-position:left center;background-repeat:repeat-x}
.seg{position:absolute;top:5px;height:14px;border-radius:3px;min-width:2px}
.seg.sensor{background:var(--sensor)}
.seg.auto_bridged{background:var(--bridged)}
.seg.manual_added{background-color:var(--sensor);background-image:radial-gradient(rgba(255,255,255,.7) 1px,transparent 1.5px);background-size:5px 5px;background-position:center}
.seg.review{background:repeating-linear-gradient(45deg,rgba(224,164,88,.22) 0 3px,transparent 3px 7px);border:1.5px solid var(--review)}
.seg.removed{background:repeating-linear-gradient(45deg,rgba(139,149,166,.22) 0 3px,transparent 3px 7px);border:1.5px solid var(--excluded)}
.seg.gap{background:rgba(127,135,150,.09)}
.seg.sel{outline:2px solid var(--fg);outline-offset:0;z-index:3}
/* Provisional: the machine went quiet without ever saying it stopped, so this
   period's end is inferred, not measured. Distinct across the whole extent
   (desaturated + hatched), with the right edge fading out rather than ending
   in a hard boundary — it reads "at least until here, then unknown". */
.seg.provisional{opacity:.72;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.45) 0 2px,transparent 2px 6px);
 -webkit-mask-image:linear-gradient(90deg,#000 0,#000 70%,transparent 100%);mask-image:linear-gradient(90deg,#000 0,#000 70%,transparent 100%);
 border-right:none}
.pt.provisional{opacity:.72}
.prov{color:var(--muted);font-size:.75rem;font-style:italic}
.hours{position:relative;height:.85rem;margin-top:2px;font-size:.6rem;color:var(--muted)}
.hours span{position:absolute;transform:translateX(-50%)}
.hours span:first-child{transform:none}.hours span:last-child{transform:translateX(-100%)}
/* Raw per-machine lanes: shown on day-expand, always, one per contributing
   machine — thinner than the main track and never re-rendered from
   corrections (raw events are immutable). */
.mlanes{margin:.5rem 0}
/* Same column template as .lane-head (96px label, 118px trailing column) so
   the shared 1fr timeline column resolves to the IDENTICAL pixel width and
   left offset as the merged track above — otherwise the two tracks' percentage
   positioning (pct()) is each internally consistent but the tracks themselves
   are different widths, so the same instant lands at different x-positions.
   The trailing 118px column is reserved but left empty on purpose. */
.mlane{display:grid;grid-template-columns:96px 1fr 118px;gap:.6rem;align-items:center;margin:.25rem 0}
.mlabel{font-size:.72rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mlane .track{height:18px;cursor:pointer}
.mlane .seg{top:2px;height:14px}
.detail{display:none;margin-top:.6rem;padding-top:.6rem;border-top:1px dashed var(--line2)}
.lane.open .detail{display:block}
.legend{display:flex;flex-wrap:wrap;gap:.15rem .8rem;font-size:.75rem;margin:.1rem 0 .6rem}
.legend span{display:inline-flex;align-items:center;gap:.3rem;color:var(--muted)}
.swatch{width:.8rem;height:.8rem;border-radius:2px;display:inline-block}
.swatch.auto_bridged{background:var(--bridged)}
.swatch.manual_added{background-color:var(--sensor);background-image:radial-gradient(rgba(255,255,255,.7) 1px,transparent 1.4px);background-size:4px 4px;background-position:center}
.swatch.review{background:repeating-linear-gradient(45deg,rgba(224,164,88,.25) 0 3px,transparent 3px 6px);border:1px solid var(--review)}
.swatch.removed{background:repeating-linear-gradient(45deg,rgba(139,149,166,.25) 0 3px,transparent 3px 6px);border:1px solid var(--excluded)}
.swatch.gap{background:rgba(127,135,150,.18);border:1px solid var(--line)}
.pt{width:.7rem;height:.7rem;border-radius:2px;display:inline-block;flex:none;border:1px solid transparent}
.pt.sensor{background:var(--sensor)}
.pt.auto_bridged{background:var(--bridged)}
.pt.manual_added{background-color:var(--sensor);background-image:radial-gradient(rgba(255,255,255,.7) 1px,transparent 1.4px);background-size:4px 4px;background-position:center}
.pt.review{background:repeating-linear-gradient(45deg,rgba(224,164,88,.35) 0 3px,transparent 3px 6px);border-color:var(--review)}
.pt.removed{background:repeating-linear-gradient(45deg,rgba(139,149,166,.35) 0 3px,transparent 3px 6px);border-color:var(--excluded)}
.pt.gap{background:rgba(127,135,150,.18);border-color:var(--line)}
.strip{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;min-height:2.1rem;margin:.2rem 0 .55rem;padding:.4rem .55rem;background:var(--panel);border:1px solid var(--line);border-radius:8px}
.strip .si{display:inline-flex;align-items:center;gap:.4rem;font-size:.85rem;font-variant-numeric:tabular-nums}
.strip .act{margin-left:auto}
.fillday{border-color:var(--sensor);color:var(--sensor)}
.plist{display:flex;flex-direction:column;gap:2px;margin:.3rem 0}
.prow{display:grid;grid-template-columns:.9rem 96px auto 1fr;gap:.5rem;align-items:center;text-align:left;
 background:none;border:1px solid transparent;border-radius:6px;color:var(--fg);padding:.3rem .4rem;cursor:pointer;font-size:.8rem;font-variant-numeric:tabular-nums}
.prow:hover{background:var(--panel)}
.prow.sel{border-color:var(--fg);background:var(--panel)}
.prow.disabled{opacity:.45;cursor:default}
.prow.disabled:hover{background:none}
.prow .pn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adv{margin-top:.4rem}
.adv summary{cursor:pointer;font-size:.85rem;padding:.2rem 0;color:var(--muted)}
@media (max-width:640px){.summary{grid-template-columns:repeat(2,1fr)}
 .lane-head{grid-template-columns:1fr auto;grid-template-areas:"dl nums" "tl tl";row-gap:.45rem}
 .dl{grid-area:dl}.nums{grid-area:nums}.tl{grid-area:tl}
 /* .tl becomes full-width here (no reserved label column), so .mlane must
    match: label above, track below, full width — same left offset (zero)
    as the merged track in this layout. */
 .mlane{grid-template-columns:1fr;grid-template-areas:"mlbl" "mtrk";row-gap:.15rem}
 .mlane .mlabel{grid-area:mlbl}
 .mlane .track{grid-area:mtrk}}
button.act{border:1px solid var(--line);background:none;color:var(--fg);padding:.25rem .5rem;border-radius:5px;cursor:pointer;font-size:.8rem}
button.act:disabled{opacity:.4;cursor:not-allowed}
input,select{background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:5px;padding:.35rem}
label{display:block;margin:.4rem 0 .15rem;font-size:.85rem}
.wdays{display:flex;flex-wrap:wrap;gap:.4rem;margin:.15rem 0 .35rem}
.wd{display:inline-flex;align-items:center;gap:.3rem;margin:0;font-size:.85rem;padding:.3rem .55rem;border:1px solid var(--line);border-radius:6px;cursor:pointer;user-select:none}
/* Settings sections: a heading plus a one-line statement of what it governs. */
.sec{margin:0;font-size:.95rem}
.sechelp{margin:.2rem 0 .6rem;color:var(--muted);font-size:.8rem;line-height:1.4}
.fieldhint{margin:.25rem 0 0;color:var(--muted);font-size:.75rem;line-height:1.4}
/* Office-hours range and hours+minutes durations. Inputs are sized in ch so
   they hold their digits without stretching, and wrap rather than overflow. */
.range,.dur{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin:.15rem 0 .35rem}
.range input{min-height:2.25rem}
.range .sep{color:var(--muted)}
/* Spinners are suppressed: right-aligned digits slide under them and clip (a
   weekly norm of 37h read as "3h"). Hours are not clamped to a day, so the box
   must hold three digits — a weekly norm can reach 168h. */
.dur input::-webkit-outer-spin-button,.dur input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dur input{width:4rem;min-height:2.25rem;text-align:right;appearance:textfield;-moz-appearance:textfield}
.dur .u{color:var(--muted);font-size:.85rem;margin-right:.35rem}
.savebar{display:flex;flex-direction:column;align-items:flex-start;gap:.5rem;margin:.75rem 0}
.saveerr{margin:0;color:var(--neg);font-size:.85rem;line-height:1.4}
code{background:rgba(127,127,127,.15);padding:.15rem .35rem;border-radius:4px;word-break:break-all}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:.35rem;border-bottom:1px solid var(--line);font-size:.85rem}
.gate{max-width:520px;margin:2.5rem auto;text-align:center}
.gate h2{margin:.2rem 0 .5rem}
.gate p{color:var(--muted);line-height:1.5}
.gate textarea{width:100%;min-height:4.5rem;margin:.6rem 0;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:.5rem;font-family:inherit}
.gate .act{padding:.5rem 1rem}
.badge{display:inline-block;padding:0 .4rem;font-size:.7rem;border-radius:4px;border:1px solid var(--line2);color:var(--muted);vertical-align:middle}
.badge.active{color:var(--bg);background:var(--pos);border-color:var(--pos)}
.badge.pending{color:var(--bg);background:var(--review);border-color:var(--review)}
.badge.rejected,.badge.disabled{color:var(--bg);background:var(--neg);border-color:var(--neg)}
.modetoggle{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.modetoggle button{border:none;border-radius:0;background:none;color:var(--fg);padding:.35rem .75rem;cursor:pointer;font-size:.85rem}
.modetoggle button.active{background:var(--sensor);color:#fff}
fieldset.role{border:1px solid var(--line);border-radius:6px;padding:.4rem .6rem;margin:.4rem 0}
fieldset.role legend{font-size:.75rem;color:var(--muted);padding:0 .3rem}
fieldset.role label{display:inline-flex;align-items:center;gap:.3rem;margin:0 .8rem 0 0;font-size:.85rem}
`;

// The client is defined as a plain string so the page stays node-free.
const CLIENT = String.raw`
const S=window.__FLEXITRACKER__;
const view=document.getElementById('view');
document.getElementById('who').textContent=S.email;
let TZ='UTC';
const DAYNAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
// Standalone daemon executables (published per release on the public repo).
// The recommended install is "uv tool install flexitracker"; these are the
// bundled-Python fallback for machines that allow running executables.
const REL='https://github.com/jvuori/flexitracker/releases/latest/download';
const DL={win:REL+'/flexitracker-windows-x86_64.exe',linux:REL+'/flexitracker-linux-x86_64'};
function detectOS(){const p=((navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||navigator.userAgent||'').toLowerCase();
 if(p.indexOf('win')>=0)return'windows';if(p.indexOf('mac')>=0)return'mac';if(p.indexOf('linux')>=0&&p.indexOf('android')<0)return'linux';return'other';}

async function api(path,opts){const r=await fetch('/api'+path,Object.assign({headers:{'content-type':'application/json'}},opts));
 if(!r.ok)throw new Error((await r.json().catch(()=>({error:r.statusText}))).error||r.statusText);
 return r.status===204?null:r.json();}
function hm(ms){const neg=ms<0;ms=Math.abs(ms);const m=Math.round(ms/60000);const h=Math.floor(m/60);const mm=m%60;
 return (neg?'-':'')+(h?h+'h '+String(mm).padStart(2,'0')+'m':mm+'m');}
// Balance-only signed format: '+' for a surplus, '-' for a deficit, no sign for
// zero. Durations keep unsigned hm(); balances use bal() so surplus/deficit read
// at a glance.
function bal(ms){const r=hm(Math.abs(ms));return ms>0?'+'+r:ms<0?'-'+r:r;}
function round30(ms){return Math.round(ms/1800000)*1800000;}
function clock(ts){return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(ts);}
function el(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstChild;}
// Machine labels and registration notes are free-text set by the account
// owner (and viewable by an admin in the admin console) — escape before
// interpolating into an HTML string, unlike the rest of this file's data
// which is server-computed.
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
${TIME_HELPERS_SRC}
${LANE_HELPERS_SRC}

const tabs=document.getElementById('tabs');
tabs.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 for(const x of tabs.children)x.classList.toggle('active',x===b);TABS[b.dataset.tab]();});

let weekOffset=0;
// Which ledger the week view shows — persists across week navigation within
// the session (like weekOffset), resets on a full page reload.
let ledgerMode='work';
const TABS={
 async week(){view.textContent='Loading…';const [st,s,wk]=await Promise.all([api('/status'),api('/settings'),api('/week?offset='+weekOffset+'&ledger='+ledgerMode)]);
  TZ=s.timezone;renderWeek(st,wk);},
 async settings(){renderSettings(await api('/settings'));},
 async machines(){renderMachines(await api('/machines'));},
 async admin(){renderAdmin();},
};

let openDay=null;
let selPeriod=null; // {dayStart, idx} — the currently selected period, if any.
function dayFmt(ts){return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short'}).format(ts);}
function stat(k,v,cls){return '<div class="stat"><div class="k">'+k+'</div><div class="v'+(cls?' '+cls:'')+'">'+v+'</div></div>';}

function renderWeek(st,wk){
 view.innerHTML='';
 const status=st.state==='active'?('🟢 active since '+clock(st.since)+(st.hostname?' on '+st.hostname:'')):
   st.state==='idle'?('⚪ idle since '+clock(st.since)):'— no data';
 view.append(el('<div class="card"><div class="row"><div>'+status+'</div>'+
   '<div class="muted">week of '+dayFmt(wk.weekStart)+'</div></div></div>'));
 const mode=el('<div class="row"><div class="modetoggle">'+
   '<button class="'+(ledgerMode==='work'?'active':'')+'" data-m="work">Work</button>'+
   '<button class="'+(ledgerMode==='personal'?'active':'')+'" data-m="personal">Personal</button>'+
   '</div></div>');
 mode.querySelectorAll('button').forEach(b=>b.onclick=()=>{
  if(ledgerMode===b.dataset.m)return;
  ledgerMode=b.dataset.m;openDay=null;selPeriod=null;TABS.week();
 });
 view.append(mode);
 const endTs=wk.days[wk.days.length-1].dayStart;
 const nav=el('<div class="row"><button class="act" id="prev">← prev</button>'+
   '<div class="big">'+dayFmt(wk.weekStart)+' – '+dayFmt(endTs)+'</div>'+
   '<button class="act" id="next">next →</button></div>');
 view.append(nav);
 // Work mode shows the full norm/lunch/balance summary; personal mode is
 // plain activity only — none of those concepts apply outside the work ledger.
 if(ledgerMode==='work'){
  const lunchMs=wk.days.reduce((n,d)=>n+d.lunchMs,0);
  view.append(el('<div class="summary">'+
    stat('Worked',hm(wk.weeklyWorkedMs))+
    stat('Weekly norm',hm(wk.weeklyNormMs))+
    stat('Lunch',hm(lunchMs))+
    stat('Balance',bal(wk.weeklyBalanceMs),wk.weeklyBalanceMs>=0?'pos':'neg')+'</div>'));
 }else{
  view.append(el('<div class="summary">'+stat('Activity',hm(wk.weeklyWorkedMs))+'</div>'));
 }
 const now=Date.now();
 wk.days.forEach((d,i)=>view.append(dayLane(d,i,now)));
 document.getElementById('prev').onclick=()=>{weekOffset--;openDay=null;TABS.week();};
 document.getElementById('next').onclick=()=>{weekOffset++;openDay=null;TABS.week();};
}

// Human labels and the state-appropriate action(s) for each period type. A
// counting period (sensor/auto_bridged/manual_added) offers Move to other
// side alongside its primary action — moving reclassifies already-counted
// time between ledgers regardless of provenance.
const TYPELABEL={sensor:'measured',auto_bridged:'auto-bridged',manual_added:'added by you',
 review:'excluded (review)',removed:'excluded (removed)',gap:'idle / no activity'};
function actionsFor(t){
 if(t==='sensor'||t==='auto_bridged')return[{label:'Exclude',act:'exclude'},{label:'Move to other side',act:'move'}];
 if(t==='review'||t==='gap')return[{label:'Count as work',act:'count'}];
 if(t==='manual_added')return[{label:'Undo addition',act:'undo'},{label:'Move to other side',act:'move'}];
 if(t==='removed')return[{label:'Restore as work',act:'restore'}];
 return[];
}
// A plain idle gap that runs from or to local midnight (e.g. an overnight
// 00:00–08:00 stretch, or evening idle ending at 24:00) is almost never work, so
// it is not selectable — an accidental tap must not count it. The manual
// exact-times control remains for the rare genuine case.
function canSelect(d,p){
 if(!p||p.type!=='gap')return !!p;
 const dEnd=d.periods.length?d.periods[d.periods.length-1].end:d.dayStart+86400000;
 return p.start!==d.dayStart&&p.end!==dEnd;
}

// overlapsTypes/rawTile/markRawProvisional come from LANE_HELPERS_SRC above.

// Clear every current selection highlight (merged track, mirrored list, and
// every raw per-machine lane) before applying a new one — selection sources
// are mutually exclusive at any moment.
function clearSelection(lane){
 selPeriod=null;
 lane.querySelectorAll('.seg.sel').forEach(s=>s.classList.remove('sel'));
 lane.querySelectorAll('.prow.sel').forEach(r=>r.classList.remove('sel'));
}

// One day = one inline lane: label · full 0–24h timeline+ruler · numbers, with
// an in-place expandable panel. Every period of the day is a selectable object:
// clicking the timeline selects the period under the pointer; a mirrored period
// list offers the same selection; selecting reveals a contextual action strip.
function dayLane(d,i,now){
 const DAY=86400000;
 const pct=ts=>Math.max(0,Math.min(100,((ts-d.dayStart)/DAY)*100));
 let bars='';
 // A provisional period gets its own treatment across its WHOLE extent, not
 // just a marked tail: without a closing event it has no confirmed end at all,
 // and its extent moves as evidence arrives.
 d.periods.forEach((p,idx)=>{bars+='<div class="seg '+p.type+(p.provisional?' provisional':'')+'" data-i="'+idx+'" style="left:'+pct(p.start)+'%;width:'+(pct(p.end)-pct(p.start))+'%"></div>';});
 let hrs='';for(let h=0;h<=24;h++)hrs+='<span style="left:'+(h/24*100)+'%">'+h+'</span>';
 const isToday=now>=d.dayStart&&now<d.dayStart+DAY;
 const isWork=ledgerMode==='work';
 // Zero-norm days (weekends and holidays) recede (see .lane.off) and credit only:
 // signed balance (bal) when there's a credit, a neutral placeholder when zero.
 // Personal mode has no norm at all, so no day ever gets this treatment — every
 // day is styled the same regardless of weekday.
 const zeroNorm=isWork&&(!d.isWorkingDay||d.isHoliday);
 const balCls=d.balanceMs>=0?'pos':'neg';
 const balTxt=(!zeroNorm||d.balanceMs!==0)?bal(d.balanceMs):'—';
 const tag=!isWork?'':d.isHoliday?'<span class="offtag holiday">holiday</span>':(d.isWorkingDay?'':'<span class="offtag">off</span>');
 const nums=isWork
   ?('<span class="worked">'+hm(round30(d.workedMs))+'</span>'+
     (d.lunchMs>0?'<span class="lunch">Lunch '+hm(d.lunchMs)+'</span>':'')+
     '<span class="bal '+balCls+'">'+balTxt+'</span>')
   :'<span class="worked">'+hm(round30(d.workedMs))+'</span>';
 const lane=el('<div class="lane'+(isToday?' today':'')+(zeroNorm?' off':'')+(isWork&&d.isHoliday?' holiday':'')+(d.dayStart===openDay?' open':'')+'">'+
   '<div class="lane-head">'+
   '<div class="dl"><b><span class="chev">▶</span>'+DAYNAMES[i]+'</b><span class="date">'+dayFmt(d.dayStart)+tag+'</span></div>'+
   '<div class="tl"><div class="track">'+bars+'</div><div class="hours">'+hrs+'</div></div>'+
   '<div class="nums">'+nums+'</div>'+
   '</div><div class="detail"></div></div>');
 buildDetail(lane,d);
 const track=lane.querySelector('.track');
 // Selecting a period: highlight its segment on the bar + its row in the list,
 // and render the action strip. Resolving by index keeps tiny segments usable —
 // a click anywhere on the track maps to the period covering that instant.
 const select=idx=>{
  if(!canSelect(d,d.periods[idx]))return; // midnight-touching idle gaps are inert
  clearSelection(lane);
  selPeriod={dayStart:d.dayStart,idx};
  const segEl=track.querySelector('.seg[data-i="'+idx+'"]');if(segEl)segEl.classList.add('sel');
  const rowEl=lane.querySelector('.prow[data-i="'+idx+'"]');if(rowEl)rowEl.classList.add('sel');
  renderStrip(lane.querySelector('.strip'),d,idx);
 };
 lane.__select=select;
 lane.querySelector('.tl').addEventListener('click',e=>{
  if(!lane.classList.contains('open')){lane.classList.add('open');openDay=d.dayStart;}
  const r=track.getBoundingClientRect();const frac=(e.clientX-r.left)/r.width;
  const ts=d.dayStart+Math.max(0,Math.min(0.999999,frac))*DAY;
  const idx=d.periods.findIndex(p=>p.start<=ts&&p.end>ts);
  select(idx<0?d.periods.length-1:idx);
 });
 lane.querySelector('.dl').addEventListener('click',()=>{openDay=lane.classList.toggle('open')?d.dayStart:null;});
 // Re-apply a selection that survived a same-day reload.
 if(selPeriod&&selPeriod.dayStart===d.dayStart&&selPeriod.idx<d.periods.length)select(selPeriod.idx);
 return lane;
}

// Apply one action for the selected period, then re-render the week.
async function actOn(d,p,act){
 // Refuse a still-growing period here too, not only in the strip: its boundaries
 // are still advancing, so a correction built from them is already stale.
 if(p.provisional&&p.growing)return;
 if(act==='count')await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:p.start,end:p.end,ledger:ledgerMode})});
 else if(act==='exclude')await api('/corrections',{method:'POST',body:JSON.stringify({kind:'remove_work',start:p.start,end:p.end,ledger:ledgerMode})});
 else if(act==='undo'||act==='restore')for(const id of (p.correctionIds||[]))await api('/corrections/'+id,{method:'DELETE'});
 else if(act==='move'){
  if(p.type==='manual_added'){
   // A manual addition is already covered by its own add_work — a plain
   // remove_work here would lose to it (add_work always wins), so move it by
   // deleting the addition and re-adding it on the other ledger instead.
   for(const id of (p.correctionIds||[]))await api('/corrections/'+id,{method:'DELETE'});
   const other=ledgerMode==='work'?'personal':'work';
   await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:p.start,end:p.end,ledger:other})});
  }else{
   await api('/corrections/move',{method:'POST',body:JSON.stringify({start:p.start,end:p.end,fromLedger:ledgerMode})});
  }
 }
 reload();
}
// Apply an action for a selection with no correction identity (a raw
// per-machine segment, or a manually-typed range) — always the plain
// add_work/remove_work/move primitives, never the manual_added
// delete-and-recreate special case in actOn: that case is unreachable here
// because overlapsTypes never offers Move on manual_added-only overlap (see
// manual-corrections "Action availability for a selection without
// correction identity"), and a mixed overlap safely moves only its
// sensor/auto_bridged portion via the ordinary remove_work/add_work pair.
async function actOnRange(start,end,act){
 if(act==='count')await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start,end,ledger:ledgerMode})});
 else if(act==='exclude')await api('/corrections',{method:'POST',body:JSON.stringify({kind:'remove_work',start,end,ledger:ledgerMode})});
 else if(act==='move')await api('/corrections/move',{method:'POST',body:JSON.stringify({start,end,fromLedger:ledgerMode})});
 reload();
}
// Render the action strip for a selection without correction identity —
// shared by a raw-lane segment click and the Advanced control.
function renderRangeStrip(strip,d,start,end,label,prov){
 strip.innerHTML='';
 strip.append(el('<span class="si">'+(label?escHtml(label)+' · ':'')+clock(start)+'–'+clock(end)+' · '+hm(end-start)+'</span>'));
 if(prov){
  strip.append(el('<span class="prov">no end recorded — last seen '+clock(prov.lastAlive)+'</span>'));
  if(prov.growing){strip.append(el('<span class="muted">Still in progress — editable once this machine stops reporting.</span>'));return;}
 }
 const acts=[];
 if(overlapsTypes(d,start,end,['gap','review','removed']))acts.push({label:'Count as work',act:'count'});
 if(overlapsTypes(d,start,end,['sensor','auto_bridged'])){acts.push({label:'Exclude',act:'exclude'});acts.push({label:'Move to other side',act:'move'});}
 if(!acts.length){strip.append(el('<span class="muted">Nothing to act on here in the '+ledgerMode+' view.</span>'));return;}
 for(const v of acts){const b=el('<button class="act">'+v.label+'</button>');b.onclick=()=>actOnRange(start,end,v.act);strip.append(b);}
}
// Fill the office day: add work over each review/gap period inside the envelope,
// leaving removed periods (explicit exclusions) untouched. Work-ledger only —
// the personal ledger never exposes an office envelope to fill.
async function fillDay(d){
 const env=d.officeEnvelope;if(!env)return;
 for(const p of d.periods){
  if(p.type!=='review'&&p.type!=='gap')continue;
  const s=Math.max(p.start,env.start),e=Math.min(p.end,env.end);
  if(e>s)await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:s,end:e,ledger:'work'})});
 }
 reload();
}

// The expandable panel: summary, legend, contextual action strip, whole-day
// fill, a mirrored selectable period list, and an advanced exact-times control.
function buildDetail(lane,d){
 const c=lane.querySelector('.detail');
 const isWork=ledgerMode==='work';
 c.append(el('<div class="row"><span class="muted">'+
   (isWork?('Total '+hm(d.grossMs)+' · Lunch '+hm(d.lunchMs)+' · Worked '+hm(d.workedMs)):('Activity '+hm(d.grossMs)))+
   '</span></div>'));
 // Personal mode never produces auto_bridged/review periods (no office-hours
 // concept), so their swatches would just be noise there.
 c.append(el('<div class="legend"><span><i class="swatch" style="background:var(--sensor)"></i>measured</span>'+
   (isWork?'<span><i class="swatch auto_bridged"></i>auto-bridged</span>':'')+
   '<span><i class="swatch manual_added"></i>added by you</span>'+
   (isWork?'<span><i class="swatch review"></i>excluded (review)</span>':'')+
   '<span><i class="swatch removed"></i>excluded (removed)</span>'+
   '<span><i class="swatch gap"></i>idle</span></div>'));
 c.append(el('<div class="strip"></div>'));
 // Raw per-machine lanes: always shown, one per machine that contributed any
 // activity that day (even just one machine) — literal sensor activity only,
 // no bridging, no corrections. Clicking a segment seeds the same strip above
 // with that segment's own [start,end]; it never changes based on
 // corrections, since corrections only ever target the merged lane above.
 const activity=d.machineActivity||[];
 if(activity.length){
  const mlanes=el('<div class="mlanes"></div>');
  const pct=ts=>Math.max(0,Math.min(100,((ts-d.dayStart)/86400000)*100));
  activity.forEach(ma=>{
   const segs=markRawProvisional(rawTile(ma.active,d.dayStart),ma.provisional);
   const row=el('<div class="mlane"><div class="mlabel">'+escHtml(ma.label||'Unnamed machine')+'</div><div class="track"></div></div>');
   const track=row.querySelector('.track');
   segs.forEach((s,idx)=>{
    track.appendChild(el('<div class="seg '+(s.type==='active'?'sensor':'gap')+(s.provisional?' provisional':'')+
      '" data-i="'+idx+'" style="left:'+pct(s.start)+'%;width:'+(pct(s.end)-pct(s.start))+'%"></div>'));
   });
   track.addEventListener('click',e=>{
    const r=track.getBoundingClientRect();const frac=(e.clientX-r.left)/r.width;
    const ts=d.dayStart+Math.max(0,Math.min(0.999999,frac))*86400000;
    const idx=segs.findIndex(s=>s.start<=ts&&s.end>ts);
    if(idx<0)return;
    const s=segs[idx];
    // Same rule as the merged track: a gap touching local midnight is inert.
    if(s.type==='gap'&&(s.start===d.dayStart||s.end===d.dayStart+86400000))return;
    clearSelection(lane);
    track.querySelectorAll('.seg')[idx].classList.add('sel');
    renderRangeStrip(lane.querySelector('.strip'),d,s.start,s.end,ma.label,
      s.provisional?{growing:s.growing,lastAlive:s.lastAlive}:null);
   });
   mlanes.append(row);
  });
  c.append(mlanes);
 }
 const dayacts=el('<div class="row"></div>');
 // Both day-level actions are work-ledger-only concepts: the office envelope
 // (fill) and the norm (holiday) don't exist in personal mode.
 if(isWork&&d.officeEnvelope){
  const b=el('<button class="act fillday">Mark whole day as work</button>');
  b.onclick=()=>fillDay(d);
  dayacts.append(b);
 }
 // Day-level holiday toggle: a full-day marker that zeroes the norm (credit-only).
 // Only offered on working days — a non-working day is already off, so there is
 // nothing to relieve. (A day already marked can still be cleared, defensively.)
 if(isWork&&(d.isWorkingDay||d.isHoliday)){
  const hb=el('<button class="act holiday">'+(d.isHoliday?'Clear holiday':'Mark as holiday')+'</button>');
  hb.onclick=async()=>{
   if(d.isHoliday)for(const id of (d.holidayCorrectionIds||[]))await api('/corrections/'+id,{method:'DELETE'});
   else await api('/corrections',{method:'POST',body:JSON.stringify({kind:'holiday',start:d.dayStart,end:d.dayStart+86400000})});
   reload();
  };
  dayacts.append(hb);
 }
 if(dayacts.childElementCount)c.append(dayacts);
 // Mirrored period list — the accessible / precision selection path.
 const list=el('<div class="plist"></div>');
 d.periods.forEach((p,idx)=>{
  const dis=!canSelect(d,p); // overnight idle gaps are not selectable
  const row=el('<button class="prow'+(dis?' disabled':'')+'" data-i="'+idx+'"'+(dis?' disabled':'')+'><span class="pt '+p.type+(p.provisional?' provisional':'')+'"></span>'+
    '<span class="pr">'+clock(p.start)+(p.provisional?'–?':'–'+clock(p.end))+'</span>'+
    '<span class="pd muted">'+hm(p.end-p.start)+'</span>'+
    '<span class="pn muted">'+TYPELABEL[p.type]+(p.provisional?', last seen '+clock(p.lastAlive):'')+'</span></button>');
  if(!dis)row.onclick=()=>lane.__select(idx);
  list.append(row);
 });
 c.append(list);
 // Advanced: exact times, for a boundary no existing period or raw segment offers.
 const adv=el('<details class="adv"><summary class="muted">Advanced: enter exact times</summary>'+
   '<div class="row"><label>From<input type="time" class="cs" value="12:00"></label>'+
   '<label>To<input type="time" class="ce" value="13:00"></label>'+
   '<button class="act add">Add work</button><button class="act rm">Mark private</button>'+
   '<button class="act mv">Move to other side</button></div></details>');
 c.append(adv);
 const toTs=inp=>{const[h,m]=inp.value.split(':').map(Number);return d.dayStart+((h*60+m)*60000);};
 const cs=adv.querySelector('.cs'),ce=adv.querySelector('.ce'),addb=adv.querySelector('.add'),rm=adv.querySelector('.rm'),mv=adv.querySelector('.mv');
 // Disable each button when the entered range would be a no-op (also covers an
 // inverted range and an empty day/weekend): "Add work" only adds currently
 // non-work time (a gap, reviewable, or previously-removed period); "Mark
 // private"/"Move" only act on counted sensor/auto-bridged time — never on
 // manual_added alone, since a plain remove_work has no effect there (see
 // manual-corrections "Action availability for a selection without
 // correction identity"). A mixed range still enables them and only its
 // sensor/auto-bridged portion is affected.
 const overlaps=types=>overlapsTypes(d,toTs(cs),toTs(ce),types);
 // A disabled button keeps a title so hovering explains why it is greyed out.
 const sync=()=>{
  const canAdd=overlaps(['gap','review','removed']),canRm=overlaps(['sensor','auto_bridged']);
  addb.disabled=!canAdd;rm.disabled=!canRm;mv.disabled=!canRm;
  addb.title=canAdd?'':'Nothing to add in this range — it is already counted as work. Add work only fills a gap, a reviewable break, or a previously removed period.';
  rm.title=canRm?'':'Nothing to remove in this range — it has no counted work. Mark private only excludes measured or auto-bridged time.';
  mv.title=canRm?'':'Nothing to move in this range — it has no counted work in the current view.';
 };
 cs.addEventListener('input',sync);ce.addEventListener('input',sync);sync();
 addb.onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:toTs(cs),end:toTs(ce),ledger:ledgerMode})});reload();};
 rm.onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'remove_work',start:toTs(cs),end:toTs(ce),ledger:ledgerMode})});reload();};
 mv.onclick=async()=>{await api('/corrections/move',{method:'POST',body:JSON.stringify({start:toTs(cs),end:toTs(ce),fromLedger:ledgerMode})});reload();};
}

// Render the contextual action strip for the selected period (or a hint).
function renderStrip(strip,d,idx){
 strip.innerHTML='';
 const p=d.periods[idx];
 if(!p){strip.append(el('<span class="muted">Tap a period on the timeline to edit it.</span>'));return;}
 const acts=actionsFor(p.type);
 strip.append(el('<span class="si"><span class="pt '+p.type+(p.provisional?' provisional':'')+'"></span>'+clock(p.start)+'–'+clock(p.end)+
   ' · '+hm(p.end-p.start)+' · '+TYPELABEL[p.type]+'</span>'));
 if(p.provisional){
  // Say what is actually known: active at least until lastAlive, then unknown.
  strip.append(el('<span class="prov">no end recorded — last seen '+clock(p.lastAlive)+'</span>'));
 }
 // Actions are withheld while the period is still GROWING, not merely while it
 // is provisional. A correction anchored to an edge that is still advancing is
 // not the correction the user meant — but a machine that never returns leaves
 // a permanently provisional period, and withholding forever would make it
 // impossible to fix.
 if(p.provisional&&p.growing){
  strip.append(el('<span class="muted">Still in progress — editable once this machine stops reporting.</span>'));
  return;
 }
 for(const v of acts){const b=el('<button class="act">'+v.label+'</button>');b.onclick=()=>actOn(d,p,v.act);strip.append(b);}
}
// Re-fetch and re-render the week in place; dayLane reopens the expanded day.
// Selection is dropped — the partition changes after any correction.
async function reload(){selPeriod=null;const [st,wk]=await Promise.all([api('/status'),api('/week?offset='+weekOffset+'&ledger='+ledgerMode)]);renderWeek(st,wk);}

function opt(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}

// Settings form. Every control carries its own unit, so no field asks the user
// to convert into the stored representation (minutes since midnight, minutes,
// seconds). Each builder registers a reader; the save handler collects from
// those readers, so there is no key list to keep in step with the render list.
function renderSettings(s){
 view.innerHTML='<h2>Settings</h2>';
 const readers=[];

 // A titled card stating what its settings govern. The split is when-vs-how-much:
 // office hours decide how activity is interpreted, norms decide what is owed.
 const section=(title,explain)=>{const c=el('<div class="card"></div>');
  c.append(el('<h3 class="sec">'+title+'</h3>'));
  if(explain)c.append(el('<p class="sechelp">'+explain+'</p>'));
  view.append(c);return c;};
 const hint=(box,text)=>box.append(el('<p class="fieldhint">'+text+'</p>'));

 // Full IANA list, with UTC and the detected zone lifted into a Suggested group
 // so the likely answer needs no scrolling. Option values are bare identifiers —
 // the '(current location)' marking is display text and never reaches the patch.
 const zoneField=(box,key,label,val)=>{
  box.append(el('<label>'+label+'</label>'));
  const sel=document.createElement('select');
  const here=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sug=document.createElement('optgroup');sug.label='Suggested';
  sug.append(opt('UTC','UTC'));
  if(here&&here!=='UTC')sug.append(opt(here,here+' (current location)'));
  sel.append(sug);
  const all=document.createElement('optgroup');all.label='All timezones';
  for(const z of Intl.supportedValuesOf('timeZone'))all.append(opt(z,z));
  sel.append(all);
  // The account's stored zone, never the detected one: the control must not
  // display a value the account does not hold. Resolves to the Suggested
  // duplicate when they match, since value= binds the first matching option.
  sel.value=val;
  box.append(sel);
  readers.push(()=>({[key]:sel.value}));
 };

 // Office hours as one range — the two bounds are meaningless apart.
 const timeRangeField=(box,label,startKey,endKey,startVal,endVal)=>{
  box.append(el('<label>'+label+'</label>'));
  const row=el('<div class="range"></div>');
  const a=el('<input type="time">');a.value=minToHHMM(startVal);
  const b=el('<input type="time">');b.value=minToHHMM(endVal);
  row.append(a,el('<span class="sep">–</span>'),b);
  box.append(row);
  readers.push(()=>({[startKey]:hhmmToMin(a.value),[endKey]:hhmmToMin(b.value)}));
 };

 // Hours + minutes. Not <input type="time">: a duration is not a time of day
 // and routinely exceeds 24h (a weekly norm is 37h30m). scale converts to the
 // stored unit — 1 for the minute fields, 60 for the seconds-stored threshold.
 const durationField=(box,key,label,val,scale)=>{
  const sc=scale||1;
  box.append(el('<label>'+label+'</label>'));
  const cur=minToHM(val/sc);
  const row=el('<div class="dur"></div>');
  const h=el('<input type="number" min="0" inputmode="numeric">');h.value=cur.h;
  const m=el('<input type="number" min="0" max="59" inputmode="numeric">');m.value=cur.m;
  row.append(h,el('<span class="u">h</span>'),m,el('<span class="u">m</span>'));
  box.append(row);
  readers.push(()=>({[key]:hmToMin(h.value,m.value)*sc}));
 };

 // Working days: seven weekdays (Mon–Sun), default Mon–Fri. Unchecked days are
 // non-working (norm 0, credit-only). Collected into workingWeekdays on save.
 const weekdayField=(box,label,val)=>{
  box.append(el('<label>'+label+'</label>'));
  const wd=el('<div class="wdays"></div>');
  DAYNAMES.forEach((name,i)=>wd.append(el('<label class="wd"><input type="checkbox" id="wd_'+i+'"'+(val.includes(i)?' checked':'')+'>'+name+'</label>')));
  box.append(wd);
  readers.push(()=>({workingWeekdays:DAYNAMES.map((_,i)=>i).filter(i=>document.getElementById('wd_'+i).checked)}));
 };

 const gen=section('General','');
 zoneField(gen,'timezone','Timezone',s.timezone);

 const off=section('Office hours','When you are normally at work. Used to decide how gaps and activity are interpreted — not how much you are expected to work.');
 timeRangeField(off,'Office hours','workdayStartMin','workdayEndMin',s.workdayStartMin,s.workdayEndMin);
 durationField(off,'privateLeaveThresholdSec','Private-leave threshold',s.privateLeaveThresholdSec,60);
 hint(off,'Gaps inside office hours at or above this count as private leave instead of being bridged.');

 const norms=section('Norms','How much work is expected, and what is deducted from it.');
 weekdayField(norms,'Working days',s.workingWeekdays);
 durationField(norms,'dailyNormMin','Daily norm',s.dailyNormMin,1);
 durationField(norms,'weeklyNormMin','Weekly norm',s.weeklyNormMin,1);
 durationField(norms,'lunchDeductMin','Lunch deduction',s.lunchDeductMin,1);
 durationField(norms,'lunchThresholdMin','Lunch applies over',s.lunchThresholdMin,1);

 const foot=el('<div class="savebar"></div>');
 const save=el('<button class="act">Save</button>');
 const err=el('<p class="saveerr" hidden></p>');
 // The server rejects an incoherent combination fail-fast; show why, or a
 // rejected save would look like nothing happened.
 save.onclick=async()=>{
  const patch=Object.assign({},...readers.map(r=>r()));
  err.hidden=true;save.textContent='Saving…';
  try{await api('/settings',{method:'PUT',body:JSON.stringify(patch)});save.textContent='Saved ✓';}
  catch(e){save.textContent='Save';err.textContent=e.message;err.hidden=false;}
 };
 foot.append(save,err);view.append(foot);
}

// Build the OS-detected setup instructions: install, log in (browser, no key
// to copy — the recommended path), verify, auto-start. A collapsed fallback
// below offers 'login --key' with a key minted on demand, for headless or
// scripted machines. Doesn't need a key up front — unlike the old
// download-then-configure flow, 'login' mints its own via the device-authorize
// page, so this renders unconditionally rather than behind an "Add machine"
// click (Machines tab is no longer the required onboarding entry point).
function renderInstallSteps(box){
 const os=detectOS();
 const standalone=os==='windows'
   ?'<a class="act" href="'+DL.win+'">standalone .exe</a>'
   :os==='linux'
   ?'<a class="act" href="'+DL.linux+'">standalone binary</a>'
   :os==='mac'
   ?''
   :'<a class="act" href="'+DL.win+'">Windows .exe</a> <a class="act" href="'+DL.linux+'">Linux binary</a>';
 const install='uv tool install flexitracker';
 const login='flexitracker login';
 const copy=(btn,src,txt)=>{const b=box.querySelector(btn);b.onclick=async()=>{try{await navigator.clipboard.writeText(txt);b.textContent='Copied ✓';}catch{const r=document.createRange();r.selectNode(box.querySelector(src));getSelection().removeAllRanges();getSelection().addRange(r);}};};
 box.innerHTML=
  '<p><b>1. Install</b> — recommended (no admin, works where .exe is blocked):</p>'+
  '<div class="row"><code id="instcmd">'+install+'</code> <button class="act" id="copyinst">Copy</button></div>'+
  (standalone
    ?'<p class="muted">Or, on a machine that allows executables, download a '+standalone+' (it bundles Python — no uv needed).</p>'
    :'<p class="muted">macOS builds aren\'t available yet — use Windows or Linux.</p>')+
  '<p><b>2. Log in</b> — opens your browser to authorize; you never see or copy a key:</p>'+
  '<div class="row"><code id="logincmd">'+login+'</code> <button class="act" id="copylogin">Copy</button></div>'+
  '<p><b>3. Verify</b> — confirms connectivity, sends no time data:</p><code>flexitracker test</code>'+
  '<p class="muted">It then auto-starts on login. Full per-OS steps (and the unsigned-app prompt): '+
  '<a href="https://github.com/jvuori/flexitracker/blob/master/daemon-py/install/README.md" target="_blank" rel="noopener">install guide</a>.</p>'+
  '<details class="adv"><summary class="muted">Headless or scripted machine? Authorize with a pasted key instead</summary>'+
  '<div class="row"><input id="mlabel" placeholder="Machine label (e.g. Work laptop)"></div>'+
  '<fieldset class="role"><legend>Machine type</legend>'+
  '<label><input type="radio" name="mrole" value="work" checked> Work</label>'+
  '<label><input type="radio" name="mrole" value="personal"> Personal</label>'+
  '</fieldset>'+
  '<div class="row"><button class="act" id="issue">Get a key</button></div>'+
  '<div id="manualcmd"></div></details>';
 copy('#copyinst','#instcmd',install);
 copy('#copylogin','#logincmd',login);
 box.querySelector('#issue').onclick=async()=>{
  const label=box.querySelector('#mlabel').value||null;
  const role=box.querySelector('input[name="mrole"]:checked').value;
  const k=await api('/machines',{method:'POST',body:JSON.stringify({label,role})});
  const cfg='flexitracker login --key '+k.access_key;
  const out=box.querySelector('#manualcmd');
  out.innerHTML='<p class="muted">Copy this key now — it is shown only once.</p>'+
   '<div class="row"><code id="cfgcmd">'+cfg+'</code> <button class="act" id="copycfg">Copy</button></div>';
  const b=out.querySelector('#copycfg');
  b.onclick=async()=>{try{await navigator.clipboard.writeText(cfg);b.textContent='Copied ✓';}catch{const r=document.createRange();r.selectNode(out.querySelector('#cfgcmd'));getSelection().removeAllRanges();getSelection().addRange(r);}};
 };
}

function renderMachines(m){
 view.innerHTML='<h2>Machines</h2>';
 view.append(el('<p class="muted">Install the daemon and run <code>flexitracker login</code> to authorize it — no visit here required. This tab is for viewing, renaming, and revoking machines you\'ve already set up.</p>'));
 const setup=el('<div class="card"></div>');
 view.append(setup);
 renderInstallSteps(setup);

 // One row per Machine (not per key): merge the registry's durable Machine
 // labels, the DO's per-machine hostname/last-seen, and each Machine's
 // current key. A Machine predating this feature (minted via the old "Add
 // machine" flow, no registry Machine row yet) still shows, keyed by its
 // key's machine_id/label.
 const doSeen={};for(const mc of m.machines)doSeen[mc.machine_id]=mc;
 const keysByMachine={};for(const k of m.keys){(keysByMachine[k.machine_id]??=[]).push(k);}
 const rows=new Map();
 for(const rm of (m.registryMachines||[]))rows.set(rm.machine_id,{machine_id:rm.machine_id,label:rm.label,role:rm.role||'work'});
 for(const k of m.keys){if(!rows.has(k.machine_id))rows.set(k.machine_id,{machine_id:k.machine_id,label:k.label,role:'work'});}

 view.append(el('<h3>Your machines</h3>'));
 if(!rows.size){view.append(el('<p class="muted">No machines yet — follow the steps above.</p>'));return;}
 const t=el('<table><tr><th>Label</th><th>Type</th><th>Hostname</th><th>Last seen</th><th>Key</th><th></th></tr></table>');
 for(const row of rows.values()){
  const mc=doSeen[row.machine_id];
  const keys=(keysByMachine[row.machine_id]||[]).slice().sort((a,b)=>b.created_at-a.created_at);
  const activeKey=keys.find(k=>!k.revoked_at);
  const tr=el('<tr><td>'+escHtml(row.label||'—')+'</td><td></td><td class="muted">'+(mc&&mc.hostname?escHtml(mc.hostname):'—')+'</td>'+
   '<td class="muted">'+(mc?new Date(mc.last_seen).toLocaleString():'never')+'</td>'+
   '<td>'+(activeKey?'active':'<span class="muted">revoked</span>')+'</td><td></td></tr>');
  const roleCell=tr.children[1];
  const roleBtn=el('<button class="act">'+(row.role==='personal'?'Personal':'Work')+'</button>');
  roleBtn.onclick=async()=>{
   const next=row.role==='personal'?'work':'personal';
   await api('/machines/'+row.machine_id+'/role',{method:'POST',body:JSON.stringify({role:next})});
   TABS.machines();
  };
  roleCell.append(roleBtn);
  const cell=tr.lastChild;
  const rn=el('<button class="act">Rename</button>');
  rn.onclick=async()=>{
   const next=prompt('Rename machine',row.label||'');
   if(!next)return;
   await api('/machines/'+row.machine_id+'/rename',{method:'POST',body:JSON.stringify({label:next})});
   TABS.machines();
  };
  cell.append(rn);
  if(activeKey){
   const b=el('<button class="act" style="margin-left:.35rem">Revoke</button>');
   b.onclick=async()=>{await api('/machines/'+activeKey.access_key+'/revoke',{method:'POST'});TABS.machines();};
   cell.append(b);
  }
  t.append(tr);}
 view.append(t);
}

async function renderAdmin(){
 view.innerHTML='<h2>Admin</h2>';
 const [regs,users,audit]=await Promise.all([api('/admin/registrations'),api('/admin/users'),api('/admin/audit')]);

 // Pending registration requests: approve or reject.
 view.append(el('<h3>Access requests'+(regs.length?' ('+regs.length+')':'')+'</h3>'));
 if(!regs.length)view.append(el('<p class="muted">No pending requests.</p>'));
 else{
  const rt=el('<table><tr><th>Email</th><th>Requested</th><th>Note</th><th></th></tr></table>');
  for(const a of regs){
   const when=a.requested_at?new Date(a.requested_at).toLocaleString():'—';
   const tr=el('<tr><td>'+a.email+'</td><td class="muted">'+when+'</td><td class="muted">'+escHtml(a.note||'')+'</td><td></td></tr>');
   const ap=el('<button class="act">Approve</button>');
   ap.onclick=async()=>{await api('/admin/registrations/'+a.account_id+'/approve',{method:'POST'});renderAdmin();};
   const rj=el('<button class="act" style="margin-left:.35rem">Reject</button>');
   rj.onclick=async()=>{if(confirm('Reject '+a.email+'?')){await api('/admin/registrations/'+a.account_id+'/reject',{method:'POST'});renderAdmin();}};
   tr.lastChild.append(ap);tr.lastChild.append(rj);
   rt.append(tr);
  }
  view.append(rt);
 }

 // All users with status + machine count; kick-out / re-enable, and key drilldown.
 view.append(el('<h3>Users</h3>'));
 const t=el('<table><tr><th>Email</th><th>Status</th><th>Machines</th><th>Created</th><th></th></tr></table>');
 for(const a of users){
  const tr=el('<tr><td>'+a.email+'</td><td><span class="badge '+a.status+'">'+a.status+'</span></td>'+
    '<td class="muted">'+a.machine_count+'</td>'+
    '<td class="muted">'+new Date(a.created_at).toLocaleDateString()+'</td><td></td></tr>');
  const cell=tr.lastChild;
  const keysb=el('<button class="act">Keys</button>');keysb.onclick=()=>renderAdminKeys(a);cell.append(keysb);
  const isSelf=a.account_id===S.accountId;
  if(a.status==='active'&&!isSelf){
   const d=el('<button class="act" style="margin-left:.35rem">Disable</button>');
   d.onclick=async()=>{if(confirm('Disable '+a.email+'? This revokes all their machine keys.')){await api('/admin/users/'+a.account_id+'/disable',{method:'POST'});renderAdmin();}};
   cell.append(d);
  } else if(a.status==='disabled'||a.status==='rejected'){
   const e2=el('<button class="act" style="margin-left:.35rem">Enable</button>');
   e2.onclick=async()=>{await api('/admin/users/'+a.account_id+'/enable',{method:'POST'});renderAdmin();};
   cell.append(e2);
  }
  t.append(tr);
 }
 view.append(t);

 if(audit.length){
  view.append(el('<h3>Audit log</h3>'));
  const at=el('<table><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th></tr></table>');
  for(const e of audit)at.append(el('<tr><td class="muted">'+new Date(e.at).toLocaleString()+'</td><td>'+e.admin_email+'</td><td>'+e.action+'</td><td class="muted">'+(e.target||'')+'</td></tr>'));
  view.append(at);
 }
}

async function renderAdminKeys(a){
 const keys=await api('/admin/accounts/'+a.account_id+'/keys');
 view.innerHTML='<h2>Admin · '+a.email+'</h2>';
 view.append(el('<button class="act" id="back">← accounts</button>'));
 const t=el('<table><tr><th>Label</th><th>Machine</th><th>Status</th><th></th></tr></table>');
 for(const k of keys){
  const tr=el('<tr><td>'+escHtml(k.label||'—')+'</td><td class="muted">'+k.machine_id.slice(0,8)+'</td><td>'+(k.revoked_at?'<span class="muted">revoked</span>':'active')+'</td><td></td></tr>');
  if(!k.revoked_at){const b=el('<button class="act">Revoke</button>');b.onclick=async()=>{await api('/admin/accounts/'+a.account_id+'/keys/'+k.access_key+'/revoke',{method:'POST'});renderAdminKeys(a);};tr.lastChild.append(b);}
  t.append(tr);
 }
 view.append(t);
 document.getElementById('back').onclick=()=>TABS.admin();
}

// ---- registration gate: shown until an admin has approved the account -------
function gateCard(title,bodyHtml){
 view.innerHTML='';
 const c=el('<div class="gate card"><h2>'+title+'</h2>'+bodyHtml+'</div>');
 view.append(c);return c;
}
function renderWaiting(){
 gateCard('Waiting for approval',
  '<p>Thanks, '+S.email+'. Your request to use FlexiTracker has been received and is '+
  'awaiting an administrator\'s review. You\'ll be able to sign in to the full app '+
  'once it is approved — check back later.</p>');
}
function renderGate(){
 // nav has display:flex, which beats the [hidden] attribute — hide it outright.
 document.getElementById('tabs').style.display='none';
 if(S.status==='pending'&&!S.requested){
  const c=gateCard('Request access',
   '<p>Welcome, '+S.email+'. FlexiTracker is invitation-only: request access below and '+
   'an administrator will review it before you can start.</p>'+
   '<textarea id="note" placeholder="Optional: a note for the admin (who you are / why)"></textarea>'+
   '<button class="act" id="req">Request access</button>');
  c.querySelector('#req').onclick=async()=>{
   const note=c.querySelector('#note').value||null;
   c.querySelector('#req').disabled=true;
   await api('/register',{method:'POST',body:JSON.stringify({note:note})});
   S.requested=true;renderWaiting();
  };
 } else if(S.status==='pending'){renderWaiting();}
 else if(S.status==='rejected'){gateCard('Access declined','<p>Your access request was not approved. If you believe this is a mistake, contact the administrator.</p>');}
 else if(S.status==='disabled'){gateCard('Account disabled','<p>Your FlexiTracker account has been disabled. Contact the administrator if you need it restored.</p>');}
 else {renderWaiting();}
}

function init(){
 if(S.status!=='active'){renderGate();return;}
 if(S.admin){for(const el of document.querySelectorAll('.admin-only')){el.hidden=false;}}
 TABS.week();
}
init();
`;
