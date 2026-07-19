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
