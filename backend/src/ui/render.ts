import type { Identity } from "../identity";

/**
 * Node-free UI: a single self-contained HTML page with inline CSS (responsive,
 * light/dark) and a vanilla-JS client that drives the JSON API. Served by the
 * Worker behind Cloudflare Access (dev mode stubs identity server-side).
 */
export function renderApp(identity: Identity, admin: boolean, accountId: string): string {
  const data = JSON.stringify({ email: identity.email, admin, accountId });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>flexi-worker</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>flexi-worker</h1>
  <div id="who"></div>
</header>
<nav id="tabs">
  <button data-tab="week" class="active">Week</button>
  <button data-tab="settings">Settings</button>
  <button data-tab="machines">Machines</button>
  <button data-tab="admin" class="admin-only" hidden>Admin</button>
</nav>
<main id="view">Loading…</main>
<script>window.__FLEXI__=${data};</script>
<script>${CLIENT}</script>
</body>
</html>`;
}

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--muted:#666;--line:#ddd;--line2:#cfd3da;
--panel:#f6f8fb;--panel2:#eef1f6;--tick:#aab2be;--tick-strong:#7c8593;--tick-faint:#cdd3dc;--idle:#c9ced6;
--sensor:#2a7ade;--bridged:#5bb98b;--manual:#a970ff;--review:#e0a458;--remove:#d05;--pos:#2e9e6b;--neg:#d05;}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8e8e8;--muted:#9aa;--line:#333;--line2:#3a414b;
--panel:#1b1e24;--panel2:#22262e;--tick:#4a525d;--tick-strong:#6b7480;--tick-faint:#333a43;--idle:#3a414b;--pos:#4fc98d;--neg:#ff5c86;}}
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
.balance.pos{color:var(--bridged)}.balance.neg{color:var(--remove)}
.muted{color:var(--muted);font-size:.85rem}
.big{font-size:1.4rem;font-weight:600}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:.5rem 0 1rem}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem}
.stat .k{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
.stat .v{font-size:1.25rem;font-weight:650;margin-top:.1rem;font-variant-numeric:tabular-nums}
.stat .v.pos{color:var(--pos)}.stat .v.neg{color:var(--neg)}
.lane{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:.55rem .65rem;margin:.4rem 0}
.lane.today{border-color:var(--sensor);box-shadow:inset 0 0 0 1px var(--sensor)}
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
 background-size:100% 30px,100% 16px,100% 8px;background-position:left bottom;background-repeat:repeat-x}
.seg{position:absolute;top:5px;height:14px;border-radius:3px;min-width:2px}
.seg.sensor{background:var(--sensor)}
.seg.auto_bridged{background:repeating-linear-gradient(45deg,var(--bridged) 0 5px,transparent 5px 10px),var(--idle)}
.seg.manual_added{background:var(--manual)}
.seg.review{background:var(--review);opacity:.5}
.hours{display:flex;justify-content:space-between;margin-top:2px;font-size:.6rem;color:var(--muted)}
.hours span{transform:translateX(-50%)}.hours span:first-child{transform:none}.hours span:last-child{transform:none}
.detail{display:none;margin-top:.6rem;padding-top:.6rem;border-top:1px dashed var(--line2)}
.lane.open .detail{display:block}
.legend{display:flex;flex-wrap:wrap;gap:.15rem .8rem;font-size:.75rem;margin:.1rem 0 .6rem}
.legend span{display:inline-flex;align-items:center;gap:.3rem;color:var(--muted)}
.swatch{width:.8rem;height:.8rem;border-radius:2px;display:inline-block}
.swatch.auto_bridged{background:repeating-linear-gradient(45deg,var(--bridged) 0 3px,transparent 3px 6px),var(--idle)}
@media (max-width:640px){.summary{grid-template-columns:repeat(2,1fr)}
 .lane-head{grid-template-columns:1fr auto;grid-template-areas:"dl nums" "tl tl";row-gap:.45rem}
 .dl{grid-area:dl}.nums{grid-area:nums}.tl{grid-area:tl}}
button.act{border:1px solid var(--line);background:none;color:var(--fg);padding:.25rem .5rem;border-radius:5px;cursor:pointer;font-size:.8rem}
input,select{background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:5px;padding:.35rem}
label{display:block;margin:.4rem 0 .15rem;font-size:.85rem}
code{background:rgba(127,127,127,.15);padding:.15rem .35rem;border-radius:4px;word-break:break-all}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:.35rem;border-bottom:1px solid var(--line);font-size:.85rem}
`;

// The client is defined as a plain string so the page stays node-free.
const CLIENT = String.raw`
const S=window.__FLEXI__;
const view=document.getElementById('view');
document.getElementById('who').textContent=S.email;
if(S.admin){for(const el of document.querySelectorAll('.admin-only')){el.hidden=false;}}
let TZ='UTC';
const DAYNAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

async function api(path,opts){const r=await fetch('/api'+path,Object.assign({headers:{'content-type':'application/json'}},opts));
 if(!r.ok)throw new Error((await r.json().catch(()=>({error:r.statusText}))).error||r.statusText);
 return r.status===204?null:r.json();}
function hm(ms){const neg=ms<0;ms=Math.abs(ms);const m=Math.round(ms/60000);const h=Math.floor(m/60);
 return (neg?'-':'')+h+'h '+String(m%60).padStart(2,'0')+'m';}
function round30(ms){return Math.round(ms/1800000)*1800000;}
function clock(ts){return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(ts);}
function el(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstChild;}

const tabs=document.getElementById('tabs');
tabs.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 for(const x of tabs.children)x.classList.toggle('active',x===b);TABS[b.dataset.tab]();});

let weekOffset=0;
const TABS={
 async week(){view.textContent='Loading…';const [st,s,wk]=await Promise.all([api('/status'),api('/settings'),api('/week?offset='+weekOffset)]);
  TZ=s.timezone;renderWeek(st,wk);},
 async settings(){renderSettings(await api('/settings'));},
 async machines(){renderMachines(await api('/machines'));},
 async admin(){renderAdmin(await api('/admin/accounts'));},
};

let openDay=null;
function dayFmt(ts){return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short'}).format(ts);}
function stat(k,v,cls){return '<div class="stat"><div class="k">'+k+'</div><div class="v'+(cls?' '+cls:'')+'">'+v+'</div></div>';}

function renderWeek(st,wk){
 view.innerHTML='';
 const status=st.state==='active'?('🟢 active since '+clock(st.since)+(st.hostname?' on '+st.hostname:'')):
   st.state==='idle'?('⚪ idle since '+clock(st.since)):'— no data';
 view.append(el('<div class="card"><div class="row"><div>'+status+'</div>'+
   '<div class="muted">week of '+dayFmt(wk.weekStart)+'</div></div></div>'));
 const endTs=wk.days[wk.days.length-1].dayStart;
 const nav=el('<div class="row"><button class="act" id="prev">← prev</button>'+
   '<div class="big">'+dayFmt(wk.weekStart)+' – '+dayFmt(endTs)+'</div>'+
   '<button class="act" id="next">next →</button></div>');
 view.append(nav);
 const lunchMs=wk.days.reduce((n,d)=>n+d.lunchMs,0);
 view.append(el('<div class="summary">'+
   stat('Worked',hm(wk.weeklyWorkedMs))+
   stat('Weekly norm',hm(wk.weeklyNormMs))+
   stat('Lunch',hm(lunchMs))+
   stat('Balance',hm(wk.weeklyBalanceMs),wk.weeklyBalanceMs>=0?'pos':'neg')+'</div>'));
 const now=Date.now();
 wk.days.forEach((d,i)=>view.append(dayLane(d,i,now)));
 document.getElementById('prev').onclick=()=>{weekOffset--;openDay=null;TABS.week();};
 document.getElementById('next').onclick=()=>{weekOffset++;openDay=null;TABS.week();};
}

// One day = one inline lane: label · full 0–24h timeline+ruler · numbers,
// with an in-place expandable correction panel (no separate day route).
function dayLane(d,i,now){
 const DAY=86400000;
 const pct=ts=>Math.max(0,Math.min(100,((ts-d.dayStart)/DAY)*100));
 const seg=(s,e,cls)=>'<div class="seg '+cls+'" style="left:'+pct(s)+'%;width:'+(pct(e)-pct(s))+'%"></div>';
 let bars='';
 for(const g of d.reviewableGaps)bars+=seg(g.start,g.end,'review');
 for(const sp of d.spans)bars+=seg(sp.start,sp.end,sp.provenance);
 let hrs='';for(let h=0;h<=24;h++)hrs+='<span>'+h+'</span>';
 const balCls=d.balanceMs>=0?'pos':'neg';
 const isToday=now>=d.dayStart&&now<d.dayStart+DAY;
 const lane=el('<div class="lane'+(isToday?' today':'')+(d.dayStart===openDay?' open':'')+'">'+
   '<div class="lane-head">'+
   '<div class="dl"><b><span class="chev">▶</span>'+DAYNAMES[i]+'</b><span class="date">'+dayFmt(d.dayStart)+'</span></div>'+
   '<div class="tl"><div class="track">'+bars+'</div><div class="hours">'+hrs+'</div></div>'+
   '<div class="nums"><span class="worked">'+hm(round30(d.workedMs))+'</span>'+
     '<span class="bal '+balCls+'">'+(d.isWorkingDay?hm(d.balanceMs):'—')+'</span></div>'+
   '</div><div class="detail"></div></div>');
 buildDetail(lane.querySelector('.detail'),d);
 const toggle=()=>{openDay=lane.classList.toggle('open')?d.dayStart:null;};
 lane.querySelector('.tl').addEventListener('click',toggle);
 lane.querySelector('.dl').addEventListener('click',toggle);
 return lane;
}

// Editing controls for a day, rendered inside its lane's .detail panel.
function buildDetail(c,d){
 c.append(el('<div class="row"><span class="muted">gross '+hm(d.grossMs)+' · lunch −'+hm(d.lunchMs)+' · worked '+hm(d.workedMs)+'</span></div>'));
 c.append(el('<div class="legend"><span><i class="swatch" style="background:var(--sensor)"></i>measured</span>'+
   '<span><i class="swatch auto_bridged"></i>auto-bridged</span>'+
   '<span><i class="swatch" style="background:var(--manual)"></i>manual</span>'+
   '<span><i class="swatch" style="background:var(--review);opacity:.6"></i>excluded (review)</span></div>'));
 if(d.reviewableGaps.length===0 && d.spans.length===0)c.append(el('<div class="muted">No activity.</div>'));
 for(const g of d.reviewableGaps){
  const r=el('<div class="row"><span>Excluded '+clock(g.start)+'–'+clock(g.end)+' ('+hm(g.end-g.start)+')</span>'+
    '<button class="act">Include as work</button></div>');
  r.querySelector('button').onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:g.start,end:g.end,note:'reviewed'})});reload();};
  c.append(r);
 }
 const form=el('<div class="card"><b>Correct this day</b>'+
   '<div class="row"><label>From<input type="time" class="cs" value="12:00"></label>'+
   '<label>To<input type="time" class="ce" value="13:00"></label>'+
   '<button class="act add">Add work</button><button class="act rm">Mark private</button></div></div>');
 c.append(form);
 const toTs=inp=>{const[h,m]=inp.value.split(':').map(Number);return d.dayStart+((h*60+m)*60000);};
 form.querySelector('.add').onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:toTs(form.querySelector('.cs')),end:toTs(form.querySelector('.ce'))})});reload();};
 form.querySelector('.rm').onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'remove_work',start:toTs(form.querySelector('.cs')),end:toTs(form.querySelector('.ce'))})});reload();};
}
// Re-fetch and re-render the week in place; dayLane reopens the expanded day.
async function reload(){const [st,wk]=await Promise.all([api('/status'),api('/week?offset='+weekOffset)]);renderWeek(st,wk);}

function renderSettings(s){
 view.innerHTML='<h2>Settings</h2>';
 const tzGuess=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const f=el('<div class="card"></div>');
 const field=(k,label,val,type)=>{f.append(el('<label>'+label+'</label>'));const i=el('<input id="s_'+k+'" type="'+(type||'number')+'" value="'+val+'">');f.append(i);};
 field('timezone','Timezone',s.timezone,'text');
 f.querySelector('#s_timezone').placeholder=tzGuess;
 field('workdayStartMin','Workday start (min from midnight)',s.workdayStartMin);
 field('workdayEndMin','Workday end (min)',s.workdayEndMin);
 field('dailyNormMin','Daily norm (min)',s.dailyNormMin);
 field('weeklyNormMin','Weekly norm (min)',s.weeklyNormMin);
 field('privateLeaveThresholdSec','Private-leave threshold (sec)',s.privateLeaveThresholdSec);
 field('lunchDeductMin','Lunch deduction (min)',s.lunchDeductMin);
 field('lunchThresholdMin','Lunch applies over (min)',s.lunchThresholdMin);
 const save=el('<button class="act" style="margin-top:.75rem">Save</button>');
 save.onclick=async()=>{const patch={};for(const k of ['timezone','workdayStartMin','workdayEndMin','dailyNormMin','weeklyNormMin','privateLeaveThresholdSec','lunchDeductMin','lunchThresholdMin']){const v=document.getElementById('s_'+k).value;patch[k]=k==='timezone'?v:Number(v);}await api('/settings',{method:'PUT',body:JSON.stringify(patch)});save.textContent='Saved ✓';};
 f.append(save);view.append(f);
}

function renderMachines(m){
 view.innerHTML='<h2>Machines</h2>';
 const add=el('<div class="card"><div class="row"><input id="label" placeholder="Machine label (e.g. Laptop)"><button class="act" id="issue">+ Add machine</button></div><div id="cmd"></div></div>');
 view.append(add);
 document.getElementById('issue').onclick=async()=>{const label=document.getElementById('label').value||null;const k=await api('/machines',{method:'POST',body:JSON.stringify({label})});
  const cmd=document.getElementById('cmd');
  cmd.innerHTML='<p class="muted">Copy this key now — it is shown only once:</p><code id="keyval">'+k.access_key+'</code> <button class="act" id="copykey">Copy</button><p class="muted">Run: <code>flexi-worker --account-key=&lt;key&gt;</code></p>';
  document.getElementById('copykey').onclick=async()=>{try{await navigator.clipboard.writeText(k.access_key);document.getElementById('copykey').textContent='Copied ✓';}catch{const r=document.createRange();r.selectNode(document.getElementById('keyval'));getSelection().removeAllRanges();getSelection().addRange(r);}};};
 const t=el('<table><tr><th>Label</th><th>Machine</th><th>Last seen</th><th>Key</th><th></th></tr></table>');
 const seen={};for(const mc of m.machines)seen[mc.machine_id]=mc;
 for(const k of m.keys){const mc=seen[k.machine_id];
  const tr=el('<tr><td>'+(k.label||'—')+'</td><td class="muted">'+(mc&&mc.hostname?mc.hostname:k.machine_id.slice(0,8))+'</td>'+
   '<td class="muted">'+(mc?new Date(mc.last_seen).toLocaleString():'never')+'</td>'+
   '<td>'+(k.revoked_at?'<span class="muted">revoked</span>':'active')+'</td><td></td></tr>');
  if(!k.revoked_at){const b=el('<button class="act">Revoke</button>');b.onclick=async()=>{await api('/machines/'+k.access_key+'/revoke',{method:'POST'});TABS.machines();};tr.lastChild.append(b);}
  t.append(tr);}
 view.append(t);
}

async function renderAdmin(accts){
 view.innerHTML='<h2>Admin · registered accounts</h2>';
 const t=el('<table><tr><th>Email</th><th>Account</th><th>Created</th><th></th></tr></table>');
 for(const a of accts){
  const tr=el('<tr><td>'+a.email+'</td><td class="muted">'+a.account_id.slice(0,8)+'</td><td class="muted">'+new Date(a.created_at).toLocaleDateString()+'</td><td></td></tr>');
  const b=el('<button class="act">Keys</button>');
  b.onclick=()=>renderAdminKeys(a);
  tr.lastChild.append(b);
  t.append(tr);
 }
 view.append(t);
 const audit=await api('/admin/audit');
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
  const tr=el('<tr><td>'+(k.label||'—')+'</td><td class="muted">'+k.machine_id.slice(0,8)+'</td><td>'+(k.revoked_at?'<span class="muted">revoked</span>':'active')+'</td><td></td></tr>');
  if(!k.revoked_at){const b=el('<button class="act">Revoke</button>');b.onclick=async()=>{await api('/admin/accounts/'+a.account_id+'/keys/'+k.access_key+'/revoke',{method:'POST'});renderAdminKeys(a);};tr.lastChild.append(b);}
  t.append(tr);
 }
 view.append(t);
 document.getElementById('back').onclick=()=>TABS.admin();
}

TABS.week();
`;
