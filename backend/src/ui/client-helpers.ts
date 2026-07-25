// Pure conversion helpers for the settings controls, shared between the browser
// and the tests.
//
// The client is a plain string so the page stays node-free (see CLIENT in
// render.ts), which means these cannot be imported by it. Rather than keeping
// two copies in step by hand, the SOURCE STRING is the single definition: the
// browser gets it inlined into CLIENT, and the tests eval it once and exercise
// the real functions. Nothing evals at runtime in the Worker.
//
// Keep these self-contained — they are evaluated in isolation, so they must not
// reference anything outside this string.

export const TIME_HELPERS_SRC = String.raw`
// Minutes since local midnight <-> "HH:MM" for <input type="time">.
// Settings store the office-hours bounds as minutes; the control speaks HH:MM.
function minToHHMM(min){return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');}
function hhmmToMin(s){const p=String(s).split(':');return Number(p[0])*60+Number(p[1]);}

// Minutes <-> {h,m} for the paired duration control. A duration is not a time
// of day and routinely exceeds 24h (a weekly norm is 37h30m), so hours are
// deliberately not clamped to a day.
function minToHM(min){return{h:Math.floor(min/60),m:min%60};}
function hmToMin(h,m){return Number(h)*60+Number(m);}
`;

// Pure helpers for the machine-activity-lanes feature (raw per-machine lanes
// + the overlap-gated action set for a selection with no correction identity
// of its own). Same "source string is the single definition" pattern as
// TIME_HELPERS_SRC above — kept self-contained, no DOM/global references.
export const LANE_HELPERS_SRC = String.raw`
// Does [s,e) overlap any merged period of one of the given types? The shared
// enablement test for any selection that carries no correction identity of
// its own (a raw per-machine segment, or a manually-typed range) — used for
// Count/Exclude/Move alike, so a raw-lane click and the Advanced control
// agree on what "spans something meaningful in the merged view" means.
function overlapsTypes(d,s,e,types){
 return e>s&&d.periods.some(p=>types.includes(p.type)&&p.end>s&&p.start<e);
}

// Tile one machine's raw active intervals (already day-clamped, noise-floor
// filtered) into a gap-free active/idle partition spanning the whole day —
// purely a client-side presentation detail (which/idle is not a judgement
// call the way bridging is), so the server only needs to hand over the
// active intervals themselves.
function rawTile(active,dayStart){
 const DAY=86400000,dayEnd=dayStart+DAY;
 const sorted=active.slice().sort((a,b)=>a.start-b.start);
 const segs=[];let cur=dayStart;
 for(const iv of sorted){
  if(iv.start>cur)segs.push({start:cur,end:iv.start,type:'gap'});
  segs.push({start:Math.max(iv.start,dayStart),end:Math.min(iv.end,dayEnd),type:'active'});
  cur=Math.max(cur,iv.end);
 }
 if(cur<dayEnd)segs.push({start:cur,end:dayEnd,type:'gap'});
 return segs;
}
// Mark the active tiles that fall within a still-growing provisional span —
// mirrors the merged lane's provisional treatment, tracked per machine.
function markRawProvisional(segs,provisional){
 for(const s of segs){
  if(s.type!=='active')continue;
  const prov=provisional.find(v=>s.start<v.end&&s.end>v.start);
  if(prov){s.provisional=true;s.growing=prov.growing;s.lastAlive=prov.lastAlive;}
 }
 return segs;
}
`;

// Pure helpers for the day-view redesign: the receipt's component sums, the
// transcription rounding, and — most importantly — the classifier's state
// table. Keeping the state table pure is what makes it testable without a DOM:
// it decides WHICH corrections a classifier choice implies, and the client
// merely executes the returned plan.
//
// Same "source string is the single definition" pattern as the helpers above —
// self-contained, no DOM or global references.
export const CLASSIFY_HELPERS_SRC = String.raw`
// The three additive sources of a ledger's total. A period of one of these
// types counts; anything else does not.
function countsNow(p){
 return p.type==='sensor'||p.type==='auto_bridged'||p.type==='manual_added';
}

// The receipt's component totals, summed from the day's typed partition. The
// partition's counted periods are specified to sum to the day's gross time, so
// a disagreement here is a genuine engine bug and should surface, not be hidden.
function receiptSums(periods){
 const acc={sensor:0,auto_bridged:0,manual_added:0};
 for(const p of periods)if(p.type in acc)acc[p.type]+=p.end-p.start;
 return acc;
}

// Rounding lives here and ONLY here — every figure shown beside another figure
// is exact, so nothing on a lane can fail to reconcile with its neighbour.
function round30(ms){return Math.round(ms/1800000)*1800000;}
function dec30(ms){return (round30(ms)/3600000).toFixed(1);}

// The transcription block: rounded decimal hours per worked day plus a total.
// The total is the sum of the ROUNDED days, not the rounding of the exact
// total — this block is what someone types into an employer's system, so it
// has to add up on its own terms.
function transcriptionRows(days,dayNames){
 const rows=[];
 days.forEach((d,i)=>{if(d.workedMs>0)rows.push([dayNames[i],dec30(d.workedMs)]);});
 const total=rows.reduce((n,r)=>n+Number(r[1]),0).toFixed(1);
 const tsv=rows.length?rows.map(r=>r[0]+'\t'+r[1]).join('\n')+'\nTotal\t'+total:'';
 return {rows:rows,total:total,tsv:tsv};
}

// The classifier's state table: given a period, the ledger in view, and the
// position the user picked, return the ordered corrections to apply. Returns an
// empty plan for a no-op (picking the position the period already holds).
//
// Ops: {op:'del'} deletes the period's own correction(s); {op:'add',ledger}
// creates an add_work; {op:'remove',ledger} creates a remove_work;
// {op:'move',from} is the atomic paired remove+add.
function classifyPlan(p,target,ledger){
 const L=ledger,O=L==='work'?'personal':'work';
 if(countsNow(p)){
  if(target===L)return [];
  if(p.type==='manual_added'){
   // A plain remove_work would LOSE to this add_work (an add always wins within
   // one ledger), so the addition is deleted rather than overridden.
   return target===O?[{op:'del'},{op:'add',ledger:O}]:[{op:'del'}];
  }
  return target==='neither'?[{op:'remove',ledger:L}]:[{op:'move',from:L}];
 }
 if(target==='neither')return []; // already counts nowhere in this view
 // Reassigning to the ledger it was excluded FROM means retracting that
 // exclusion, not stacking an add_work on top of it.
 if(target===L&&p.type==='removed')return [{op:'del'}];
 return [{op:'add',ledger:target}];
}
`;
