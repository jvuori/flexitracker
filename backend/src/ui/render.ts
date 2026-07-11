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
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--muted:#666;--line:#ddd;
--sensor:#2a7ade;--bridged:#5bb98b;--manual:#a970ff;--review:#e0a458;--remove:#d05;}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8e8e8;--muted:#9aa;--line:#333;}}
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
.timeline{position:relative;height:34px;background:var(--line);border-radius:6px;overflow:hidden;margin:.5rem 0}
.seg{position:absolute;top:0;height:100%}
.seg.sensor{background:var(--sensor)}.seg.auto_bridged{background:var(--bridged)}
.seg.manual_added{background:var(--manual)}.seg.review{background:var(--review);opacity:.6}
.legend span{display:inline-flex;align-items:center;gap:.3rem;margin-right:.75rem;font-size:.8rem}
.swatch{width:.8rem;height:.8rem;border-radius:2px;display:inline-block}
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

function renderWeek(st,wk){
 const start=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short'}).format(wk.weekStart);
 view.innerHTML='';
 const status=st.state==='active'?('🟢 active since '+clock(st.since)+(st.hostname?' on '+st.hostname:'')):
   st.state==='idle'?('⚪ idle since '+clock(st.since)):'— no data';
 view.append(el('<div class="card"><div class="row"><div>'+status+'</div>'+
   '<div class="muted">week of '+start+'</div></div></div>'));
 const nav=el('<div class="row"><button class="act" id="prev">← prev</button>'+
   '<div class="big">'+hm(wk.weeklyWorkedMs)+' <span class="muted">/ '+hm(wk.weeklyNormMs)+'</span></div>'+
   '<button class="act" id="next">next →</button></div>');
 view.append(nav);
 const bal=el('<div class="row"><span class="muted">weekly balance</span><span class="big balance '+
   (wk.weeklyBalanceMs>=0?'pos':'neg')+'">'+hm(wk.weeklyBalanceMs)+'</span></div>');
 view.append(bal);
 wk.days.forEach((d,i)=>{
  const c=el('<div class="card day"><div class="row"><b>'+DAYNAMES[i]+'</b>'+
    '<span>'+hm(d.workedMs)+' <span class="muted">('+hm(round30(d.workedMs))+')</span></span>'+
    '<span class="balance '+(d.balanceMs>=0?'pos':'neg')+'">'+(d.isWorkingDay?hm(d.balanceMs):'—')+'</span>'+
    '</div></div>');
  c.addEventListener('click',()=>renderDay(d));
  view.append(c);
 });
 document.getElementById('prev').onclick=()=>{weekOffset--;TABS.week();};
 document.getElementById('next').onclick=()=>{weekOffset++;TABS.week();};
}

function renderDay(d){
 const win={start:d.dayStart,end:d.dayStart+86400000};
 const lo=6*3600000,hi=22*3600000;const span=hi-lo;
 const pct=ts=>Math.max(0,Math.min(100,((ts-d.dayStart-lo)/span)*100));
 const seg=(s,e,cls)=>'<div class="seg '+cls+'" style="left:'+pct(s)+'%;width:'+(pct(e)-pct(s))+'%"></div>';
 let bars='';
 for(const g of d.reviewableGaps)bars+=seg(g.start,g.end,'review');
 for(const sp of d.spans)bars+=seg(sp.start,sp.end,sp.provenance);
 view.innerHTML='';
 view.append(el('<button class="act" id="back">← week</button>'));
 view.append(el('<h2>'+new Intl.DateTimeFormat('en-GB',{timeZone:TZ,weekday:'long',day:'2-digit',month:'short'}).format(d.dayStart)+'</h2>'));
 view.append(el('<div class="row"><span class="big">'+hm(d.workedMs)+'</span><span class="muted">gross '+hm(d.grossMs)+' · lunch −'+hm(d.lunchMs)+'</span></div>'));
 view.append(el('<div class="timeline">'+bars+'</div>'));
 view.append(el('<div class="legend"><span><i class="swatch" style="background:var(--sensor)"></i>measured</span>'+
   '<span><i class="swatch" style="background:var(--bridged)"></i>auto-bridged</span>'+
   '<span><i class="swatch" style="background:var(--manual)"></i>manual</span>'+
   '<span><i class="swatch" style="background:var(--review)"></i>excluded (review)</span></div>'));

 // Reviewable gaps → include; spans → mark private.
 const actions=el('<div class="card"></div>');
 if(d.reviewableGaps.length===0 && d.spans.length===0)actions.append(el('<div class="muted">No activity.</div>'));
 for(const g of d.reviewableGaps){
  const r=el('<div class="row"><span>Excluded '+clock(g.start)+'–'+clock(g.end)+' ('+hm(g.end-g.start)+')</span>'+
    '<button class="act">Include as work</button></div>');
  r.querySelector('button').onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:g.start,end:g.end,note:'reviewed'})});TABS.week();};
  actions.append(r);
 }
 view.append(actions);

 // Manual add/remove within the day.
 const form=el('<div class="card"><b>Correct this day</b>'+
   '<div class="row"><label>From<input type="time" id="cs" value="12:00"></label>'+
   '<label>To<input type="time" id="ce" value="13:00"></label>'+
   '<button class="act" id="add">Add work</button><button class="act" id="rm">Mark private</button></div></div>');
 view.append(form);
 const toTs=id=>{const[h,m]=document.getElementById(id).value.split(':').map(Number);return d.dayStart+((h*60+m)*60000);};
 document.getElementById('add').onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:toTs('cs'),end:toTs('ce')})});renderReload(d.dayStart);};
 document.getElementById('rm').onclick=async()=>{await api('/corrections',{method:'POST',body:JSON.stringify({kind:'remove_work',start:toTs('cs'),end:toTs('ce')})});renderReload(d.dayStart);};
 document.getElementById('back').onclick=()=>TABS.week();
}
async function renderReload(dayStart){const wk=await api('/week?offset='+weekOffset);const d=wk.days.find(x=>x.dayStart===dayStart)||wk.days[0];renderDay(d);}

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
  document.getElementById('cmd').innerHTML='<p class="muted">Run on the machine:</p><code>flexi-worker --account-key='+k.access_key+'</code>';TABS.machines();};
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
