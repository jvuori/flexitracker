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
