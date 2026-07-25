import type { Identity } from "../identity";
import { CLASSIFY_HELPERS_SRC, LANE_HELPERS_SRC, TIME_HELPERS_SRC } from "./client-helpers";

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
/* Two orthogonal channels encode every period, instead of one colour per type:
   FILL says whether it counts (solid measured / hatched inferred / bare not),
   and the --accent underline says the USER asserted it. --accent is the amber
   freed by review losing its own treatment. --office is the office-hours band:
   deliberately a cool wash, so it never reads as the amber authorship mark. */
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--muted:#666;--line:#ddd;--line2:#cfd3da;
--panel:#f6f8fb;--panel2:#eef1f6;--tick:#aab2be;--tick-strong:#7c8593;--tick-faint:#cdd3dc;--idle:#c9ced6;
--sensor:#2a7ade;--sensor-soft:rgba(42,122,222,.28);--accent:#e0a458;--office:rgba(90,130,190,.17);
--quiet:rgba(127,135,150,.10);--quiet2:rgba(127,135,150,.18);
--remove:#d05;--pos:#2e9e6b;--neg:#d05;}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8e8e8;--muted:#9aa;--line:#333;--line2:#3a414b;
--panel:#1b1e24;--panel2:#22262e;--tick:#4a525d;--tick-strong:#6b7480;--tick-faint:#333a43;--idle:#3a414b;
--sensor-soft:rgba(90,155,240,.26);--office:rgba(120,160,220,.16);
--quiet:rgba(150,160,180,.10);--quiet2:rgba(150,160,180,.20);--pos:#4fc98d;--neg:#ff5c86;}}
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
.offtag.holiday{color:var(--bg);background:var(--accent);border-color:var(--accent)}
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
/* The office-hours band is the LAST background-image layer, so it paints behind
   the three tick gradients — and it lives on the same element as the segments,
   which is the point: a separately-positioned overlay can drift from the
   segments it must align with (see CLAUDE.md), a background cannot. --ofs/--ofe
   are set inline per track; defaulting both to 0% means "no band" for any track
   that doesn't set them (personal mode, where office hours don't apply). */
.track{position:relative;height:30px;border-radius:6px;background-color:var(--panel2);border:1px solid var(--line);overflow:hidden;
 background-image:repeating-linear-gradient(90deg,var(--tick-strong) 0 1px,transparent 1px calc(100%/24)),
 repeating-linear-gradient(90deg,var(--tick) 0 1px,transparent 1px calc(100%/48)),
 repeating-linear-gradient(90deg,var(--tick-faint) 0 1px,transparent 1px calc(100%/96)),
 linear-gradient(90deg,transparent 0 var(--ofs,0%),var(--office) var(--ofs,0%) var(--ofe,0%),transparent var(--ofe,0%) 100%);
 background-size:100% 30px,100% 16px,100% 8px,100% 100%;
 background-position:left center,left center,left center,left top;
 background-repeat:repeat-x,repeat-x,repeat-x,no-repeat}
/* Five treatments on two channels. Fill = counts (solid measured, hatched
   inferred, bare not-counted); the accent underline = you asserted it. Measured
   and auto-bridged MUST stay distinguishable — a counted period may never hide
   the idle it was bridged over. */
.seg{position:absolute;top:5px;height:14px;border-radius:3px;min-width:2px}
.seg.sensor{background:var(--sensor)}
.seg.auto_bridged{background-color:var(--sensor-soft);
 background-image:repeating-linear-gradient(135deg,var(--sensor) 0 3px,transparent 3px 7px)}
.seg.manual_added{background:var(--sensor);border-bottom:3px solid var(--accent)}
/* review renders exactly as gap: the band behind it already says "in hours"
   and the bare fill already says "not counted". */
.seg.gap,.seg.review{background:var(--quiet)}
.seg.removed{background:var(--quiet);border-bottom:3px solid var(--accent)}
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
.mlane .track{height:20px;cursor:pointer}
.mlane .seg{top:3px;height:14px}
/* Selection must come AFTER .mlane .seg — equal specificity, so source order
   decides. It grows to the full track height and rings itself INWARD: the old
   outline painted outside the box inside an overflow:hidden track, which on the
   shorter raw lanes had no room and got shaved. Growth also keeps a segment at
   min-width legible, which an inward ring alone would not. */
.seg.sel{top:0;height:100%;outline:2px solid var(--fg);outline-offset:-2px;border-radius:3px;z-index:3}
.detail{display:none;margin-top:.6rem;padding-top:.6rem;border-top:1px dashed var(--line2)}
.lane.open .detail{display:block}
/* The period marker doubles as the receipt's swatch — the receipt defines the
   encoding exactly where it is used, which is what retires the old legend. Same
   two channels as .seg, at dot scale. */
.pt{width:.75rem;height:.75rem;border-radius:2px;display:inline-block;flex:none;border:1px solid transparent}
.pt.sensor{background:var(--sensor)}
.pt.auto_bridged{background-color:var(--sensor-soft);
 background-image:repeating-linear-gradient(135deg,var(--sensor) 0 2px,transparent 2px 5px)}
.pt.manual_added{background:var(--sensor);border-bottom:2px solid var(--accent)}
.pt.gap,.pt.review{background:var(--quiet2);border-color:var(--line)}
.pt.removed{background:var(--quiet2);border-bottom:2px solid var(--accent)}
/* The receipt: the day's counted components summed into its worked time. It
   replaces the legend, the old one-line summary, and the missing "prove it adds
   up" surface all at once. */
/* Bounded so it reads as a ledger with its amounts near their labels, rather
   than a full-width row with the number stranded at the far edge. */
.receipt{margin:.1rem 0 .5rem;max-width:26rem;font-size:.8rem;font-variant-numeric:tabular-nums}
.receipt .r{display:grid;grid-template-columns:.75rem 1fr auto;gap:.5rem;align-items:center;padding:.13rem 0}
.receipt .r .amt{text-align:right}
.receipt .r.zero{color:var(--muted)}
.receipt .r.rule{border-top:1px solid var(--line2);margin-top:.28rem;padding-top:.32rem}
.receipt .r.worked{font-weight:650;font-size:.92rem}
.receipt .r.sub{color:var(--muted)}
/* Uncounted in-hours time: a statement of what the rules did, never a question. */
.note{margin:0 0 .6rem;color:var(--muted);font-size:.78rem;line-height:1.45}
.note button.lnk{background:none;border:none;padding:0;font:inherit;color:var(--muted);text-decoration:underline;cursor:pointer}
/* The classifier replaces Count/Exclude/Move/Undo/Restore with one control:
   three positions of "what was this time". Rendered inline at the selected row. */
.cls{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:.1rem 0 .4rem 1.4rem;
 padding:.45rem .6rem;background:var(--panel);border:1px solid var(--line);border-radius:8px}
.cls .lbl{font-size:.78rem;color:var(--muted)}
.cls .prov{flex-basis:100%}
.seg3{display:inline-flex;border:1px solid var(--line2);border-radius:6px;overflow:hidden}
.seg3 button{border:none;border-radius:0;background:none;color:var(--fg);padding:.38rem .75rem;
 cursor:pointer;font-size:.8rem;border-left:1px solid var(--line2)}
.seg3 button:first-child{border-left:none}
.seg3 button.cur{background:var(--sensor);color:#fff;cursor:default}
.seg3 button:disabled:not(.cur){opacity:.35;cursor:not-allowed}
/* Day-scope actions sit at the head of the period list, separated from the
   per-period classifier — they act on the day, not on a selection. */
.plisthead{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:.6rem 0 .15rem}
.plisthead h4{margin:0;flex:1;font-size:.7rem;font-weight:600;text-transform:uppercase;
 letter-spacing:.05em;color:var(--muted)}
.fillday{border-color:var(--sensor);color:var(--sensor)}
.more{position:relative}
.more>summary{list-style:none;cursor:pointer;padding:.25rem .55rem;border:1px solid var(--line);
 border-radius:5px;font-size:.8rem;color:var(--fg)}
.more>summary::-webkit-details-marker{display:none}
.more .pop{position:absolute;right:0;top:calc(100% + .25rem);z-index:5;background:var(--bg);
 border:1px solid var(--line);border-radius:6px;padding:.35rem;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.18)}
/* Week transcription summary: the rounded half-hour values, the only place
   rounding appears, kept visually distinct from the exact figures everywhere else. */
.tsum{margin:.5rem 0 1rem;padding:.6rem .75rem;background:var(--panel);border:1px solid var(--line);border-radius:10px}
.tsum h3{margin:0;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.tsum .vals{display:flex;flex-wrap:wrap;gap:.2rem 1.1rem;margin:.4rem 0 0;font-size:.9rem;font-variant-numeric:tabular-nums}
.tsum .vals span b{font-weight:650;margin-left:.3rem}
.tsum .vals .tot{border-left:1px solid var(--line2);padding-left:1.1rem}
.plist{display:flex;flex-direction:column;gap:2px;margin:.3rem 0}
/* One .pitem per period: the row, plus the classifier when it is the selection.
   The classifier lives here rather than in a standing strip so the verb sits
   next to the period it acts on, and so nothing is mounted while nothing is
   selected. */
.pitem{display:flex;flex-direction:column}
.prow{display:grid;grid-template-columns:.75rem 96px auto 1fr;gap:.5rem;align-items:center;text-align:left;
 background:none;border:1px solid transparent;border-radius:6px;color:var(--fg);padding:.3rem .4rem;cursor:pointer;font-size:.8rem;font-variant-numeric:tabular-nums}
.prow:hover{background:var(--panel)}
.prow.sel{border-color:var(--fg);background:var(--panel)}
.prow.disabled{opacity:.45;cursor:default}
.prow.disabled:hover{background:none}
.prow .pn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adv{margin-top:.4rem}
.adv summary{cursor:pointer;font-size:.85rem;padding:.2rem 0;color:var(--muted)}
/* The exact-times inputs sit together as one range — the generic .row is
   space-between, which pushed "To" to the far edge of the panel. */
.times{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:.3rem 0}
.times label{display:inline-flex;align-items:center;gap:.35rem;margin:0;font-size:.8rem;color:var(--muted)}
.times input{min-height:2.25rem}
@media (max-width:640px){.summary{grid-template-columns:repeat(2,1fr)}
 .lane-head{grid-template-columns:1fr auto;grid-template-areas:"dl nums" "tl tl";row-gap:.45rem}
 .dl{grid-area:dl}.nums{grid-area:nums}.tl{grid-area:tl}
 /* .tl becomes full-width here (no reserved label column), so .mlane must
    match: label above, track below, full width — same left offset (zero)
    as the merged track in this layout. */
 .mlane{grid-template-columns:1fr;grid-template-areas:"mlbl" "mtrk";row-gap:.15rem}
 .mlane .mlabel{grid-area:mlbl}
 .mlane .track{grid-area:mtrk}
 /* Touch targets: period rows to >=44px, and the classifier goes full-width
    so its three positions are thumb-sized rather than inline chips. */
 .prow{padding:.62rem .4rem;min-height:44px;font-size:.82rem}
 .cls{margin-left:0}
 .cls .lbl{flex-basis:100%}
 .seg3{display:flex;width:100%}
 .seg3 button{flex:1;padding:.62rem .3rem;min-height:44px}
 .tsum .vals .tot{border-left:none;padding-left:0;flex-basis:100%}}
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
.badge.pending{color:var(--bg);background:var(--accent);border-color:var(--accent)}
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
// Office-hours window (minutes from midnight) and the private-leave threshold,
// captured on each week load. The timeline band and the uncounted-time note
// both need them, and the week view already fetches settings for the timezone.
let OFFICE={start:0,end:0};
let PLTSEC=0;
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
function clock(ts){return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(ts);}
function el(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstChild;}
// Machine labels and registration notes are free-text set by the account
// owner (and viewable by an admin in the admin console) — escape before
// interpolating into an HTML string, unlike the rest of this file's data
// which is server-computed.
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
${TIME_HELPERS_SRC}
${LANE_HELPERS_SRC}
${CLASSIFY_HELPERS_SRC}

const tabs=document.getElementById('tabs');
tabs.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 for(const x of tabs.children)x.classList.toggle('active',x===b);TABS[b.dataset.tab]();});

let weekOffset=0;
// Which ledger the week view shows — persists across week navigation within
// the session (like weekOffset), resets on a full page reload.
let ledgerMode='work';
const TABS={
 async week(){view.textContent='Loading…';const [st,s,wk]=await Promise.all([api('/status'),api('/settings'),api('/week?offset='+weekOffset+'&ledger='+ledgerMode)]);
  TZ=s.timezone;OFFICE={start:s.workdayStartMin,end:s.workdayEndMin};PLTSEC=s.privateLeaveThresholdSec;
  renderWeek(st,wk);},
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
  view.append(transcription(wk));
 }else{
  view.append(el('<div class="summary">'+stat('Activity',hm(wk.weeklyWorkedMs))+'</div>'));
 }
 const now=Date.now();
 wk.days.forEach((d,i)=>view.append(dayLane(d,i,now)));
 document.getElementById('prev').onclick=()=>{weekOffset--;openDay=null;TABS.week();};
 document.getElementById('next').onclick=()=>{weekOffset++;openDay=null;TABS.week();};
}

// The ONLY place rounding appears. Everything else on screen is exact, so no
// two figures shown together are derived on different bases — the old lane put
// a rounded 8h 00m beside an exact-derived +16m and read as an arithmetic error.
// Decimal hours (8.0 / 7.5) is what timesheet systems take, and the format
// difference from the lane's 7h 46m is itself the signal that these differ.
function transcription(wk){
 const t=transcriptionRows(wk.days,DAYNAMES);
 const box=el('<div class="tsum"><div class="row"><h3>To transcribe</h3></div></div>');
 if(!t.rows.length){box.append(el('<p class="muted">No working time this week.</p>'));return box;}
 const vals=el('<div class="vals"></div>');
 t.rows.forEach(r=>vals.append(el('<span>'+r[0]+'<b>'+r[1]+'</b></span>')));
 vals.append(el('<span class="tot">Total<b>'+t.total+'</b></span>'));
 box.append(vals);
 const b=el('<button class="act">Copy</button>');
 b.onclick=async()=>{
  try{await navigator.clipboard.writeText(t.tsv);b.textContent='Copied ✓';}
  catch{b.textContent='Copy failed';}
 };
 box.querySelector('.row').append(b);
 return box;
}

// One vocabulary, used by the timeline, the period list, and the receipt alike.
// review and gap share a label deliberately: they are identical in effect (both
// uncounted), and the office-hours band behind them carries the only difference.
const TYPELABEL={sensor:'at the computer',auto_bridged:'short break, counted',
 manual_added:'you added this',review:'away',removed:'you excluded this',gap:'away'};

// Inline --ofs/--ofe for the office-hours band. Work ledger only: the personal
// ledger applies no office-hours gating, so a band there would advertise a rule
// that does not run.
function bandStyle(){
 if(ledgerMode!=='work'||!(OFFICE.end>OFFICE.start))return '';
 return ' style="--ofs:'+(OFFICE.start/1440*100)+'%;--ofe:'+(OFFICE.end/1440*100)+'%"';
}

// Where a period sits now, in the ledger being viewed. A counted period is at
// the current ledger's position by definition — the partition is ledger-scoped.
function currentPos(p){return countsNow(p)?ledgerMode:'neither';}

// The classifier: one control replacing Count as work / Exclude / Move to other
// side / Undo addition / Restore as work. The user states what the time WAS and
// the client picks the primitive — sometimes creating a correction, sometimes
// deleting one. "Exclude" and "Move" were near-synonyms as sibling verbs (for
// the work total they are identical); as two positions of one control the
// difference is structural: Neither counts nowhere, Personal counts there.
function classifier(lead,cur,enabled,onPick){
 const box=el('<div class="cls"></div>');
 box.append(el('<span class="lbl">'+lead+'</span>'));
 const g=el('<div class="seg3"></div>');
 [['work','Work'],['personal','Personal'],['neither','Neither']].forEach(function(o){
  const v=o[0];
  const b=el('<button'+(v===cur?' class="cur"':'')+'>'+o[1]+'</button>');
  if(v===cur){b.disabled=true;b.title='This is how the time counts now.';}
  else if(!enabled(v)){b.disabled=true;
   b.title='Nothing in this selection to change in the '+ledgerMode+' view.';}
  else b.onclick=()=>onPick(v);
  g.append(b);
 });
 box.append(g);
 return box;
}

// Apply a classifier choice to an exact period, which carries correction
// identity. The decision lives in classifyPlan (pure, unit-tested); this only
// executes the ops it returns.
async function classifyPeriod(d,p,target){
 // A still-growing period's boundaries are advancing, so a correction built
 // from them is already stale.
 if(p.provisional&&p.growing)return;
 const plan=classifyPlan(p,target,ledgerMode);
 if(!plan.length)return;
 for(const step of plan){
  if(step.op==='del')for(const id of (p.correctionIds||[]))await api('/corrections/'+id,{method:'DELETE'});
  else if(step.op==='add')await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start:p.start,end:p.end,ledger:step.ledger})});
  else if(step.op==='remove')await api('/corrections',{method:'POST',body:JSON.stringify({kind:'remove_work',start:p.start,end:p.end,ledger:step.ledger})});
  else if(step.op==='move')await api('/corrections/move',{method:'POST',body:JSON.stringify({start:p.start,end:p.end,fromLedger:step.from})});
 }
 reload();
}

// Which positions a selection WITHOUT correction identity (a raw per-machine
// segment, or a typed range) may take — the existing overlap rule, unchanged:
// it can be counted where it overlaps something uncounted, and excluded or
// moved where it overlaps counted sensor/auto-bridged time. Deliberately not
// manual_added: a plain remove_work is already a no-op against it.
function rangeEnabled(d,start,end){
 const canAdd=overlapsTypes(d,start,end,['gap','review','removed']);
 const canRm=overlapsTypes(d,start,end,['sensor','auto_bridged']);
 return v=>v===ledgerMode?canAdd:canRm;
}
async function classifyRange(d,start,end,target){
 if(target===ledgerMode)await api('/corrections',{method:'POST',body:JSON.stringify({kind:'add_work',start,end,ledger:ledgerMode})});
 else if(target==='neither')await api('/corrections',{method:'POST',body:JSON.stringify({kind:'remove_work',start,end,ledger:ledgerMode})});
 else await api('/corrections/move',{method:'POST',body:JSON.stringify({start,end,fromLedger:ledgerMode})});
 reload();
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
 // The classifier is mounted at the selection, so clearing the selection
 // unmounts it — nothing action-shaped is left on screen with nothing selected.
 lane.querySelectorAll('.cls').forEach(x=>x.remove());
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
 // Exact, never rounded: the balance beside it is exact-derived, so a rounded
 // figure here would not reconcile with it (and the days would not sum to the
 // week). The rounded value lives in the transcription summary alone.
 const nums=isWork
   ?('<span class="worked">'+hm(d.workedMs)+'</span>'+
     (d.lunchMs>0?'<span class="lunch">Lunch '+hm(d.lunchMs)+'</span>':'')+
     '<span class="bal '+balCls+'">'+balTxt+'</span>')
   :'<span class="worked">'+hm(d.workedMs)+'</span>';
 const lane=el('<div class="lane'+(isToday?' today':'')+(zeroNorm?' off':'')+(isWork&&d.isHoliday?' holiday':'')+(d.dayStart===openDay?' open':'')+'">'+
   '<div class="lane-head">'+
   '<div class="dl"><b><span class="chev">▶</span>'+DAYNAMES[i]+'</b><span class="date">'+dayFmt(d.dayStart)+tag+'</span></div>'+
   '<div class="tl"><div class="track"'+bandStyle()+'>'+bars+'</div><div class="hours">'+hrs+'</div></div>'+
   '<div class="nums">'+nums+'</div>'+
   '</div><div class="detail"></div></div>');
 buildDetail(lane,d);
 const track=lane.querySelector('.track');
 // Selecting a period: highlight its segment on the bar and its row in the list,
 // and mount the classifier AT that row — so the verb sits next to the period it
 // acts on, and both selection sources converge on one presentation. Resolving
 // by index keeps tiny segments usable: a click anywhere on the track maps to
 // the period covering that instant.
 const select=idx=>{
  if(!canSelect(d,d.periods[idx]))return; // midnight-touching idle gaps are inert
  clearSelection(lane);
  selPeriod={dayStart:d.dayStart,idx};
  const segEl=track.querySelector('.seg[data-i="'+idx+'"]');if(segEl)segEl.classList.add('sel');
  const rowEl=lane.querySelector('.prow[data-i="'+idx+'"]');
  if(!rowEl)return;
  rowEl.classList.add('sel');
  const p=d.periods[idx];
  // Withheld while GROWING, not merely while provisional: a machine that never
  // returns leaves a permanently provisional period, and withholding forever
  // would make it impossible to fix.
  const growing=!!(p.provisional&&p.growing);
  const cls=classifier('This time was',currentPos(p),()=>!growing,v=>classifyPeriod(d,p,v));
  if(p.provisional)cls.append(el('<span class="prov">no end recorded — last seen '+clock(p.lastAlive)+'</span>'));
  if(growing)cls.append(el('<span class="muted">Still in progress — editable once this machine stops reporting.</span>'));
  rowEl.parentNode.append(cls);
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

// The expanded panel, in the order the day is actually READ: the receipt (why
// the number is what it is), then the periods (where the time went, and the
// only place per-period actions live), then the collapsed escape hatches. The
// old order — summary, legend, empty strip, raw lanes, day buttons, list — was
// set by the sequence features landed in, and answered "what can I do here?"
// when the user opening a day is almost always asking "why is this number this?"
function buildDetail(lane,d){
 const c=lane.querySelector('.detail');
 const isWork=ledgerMode==='work';
 c.append(receipt(d,isWork));
 const note=uncountedNote(d,isWork);
 if(note)c.append(note);
 c.append(periodList(lane,d,isWork));
 if((d.machineActivity||[]).length)c.append(rawLanes(lane,d));
 c.append(advanced(lane,d));
}

// The receipt: the day's counted components summed into its worked time. It
// does three jobs the panel previously needed three components for — it
// explains the number, it defines the timeline's swatches (each row carries the
// same marker the bar uses), and it proves the arithmetic. That is what retires
// the legend, which sat between the merged lane and the raw lanes decoding
// neither adjacently.
function receipt(d,isWork){
 const sum=t=>d.periods.reduce((n,p)=>n+(p.type===t?p.end-p.start:0),0);
 const box=el('<div class="receipt"></div>');
 // A zero component keeps its row (with a placeholder) so the receipt's shape
 // does not shift between days.
 const comp=(type,label)=>{const ms=sum(type);
  box.append(el('<div class="r'+(ms?'':' zero')+'"><i class="pt '+type+'"></i><span>'+label+
    '</span><span class="amt">'+(ms?hm(ms):'—')+'</span></div>'));};
 const line=(cls,label,amt)=>box.append(el('<div class="r '+cls+'"><i></i><span>'+label+
   '</span><span class="amt">'+amt+'</span></div>'));
 comp('sensor','at the computer');
 if(isWork)comp('auto_bridged','short breaks, counted');
 comp('manual_added','you added');
 if(isWork){
  line('rule sub','before lunch',hm(d.grossMs));
  if(d.lunchMs>0)line('sub','lunch','−'+hm(d.lunchMs));
  line('worked','worked',hm(d.workedMs));
 }else{
  line('rule worked','total activity',hm(d.grossMs));
 }
 return box;
}

// Uncounted in-hours time, stated as a fact about what the rules did. Never a
// question, never an action, and no badge anywhere in the week view: the rules
// already classified this exactly as they classified the short break beside it,
// and a prompt would imply they are provisional. The threshold links to
// Settings, because overriding the same rule every week is a settings problem,
// not a workflow.
function uncountedNote(d,isWork){
 if(!isWork)return null;
 const rev=d.periods.filter(p=>p.type==='review');
 if(!rev.length)return null;
 const total=rev.reduce((n,p)=>n+(p.end-p.start),0);
 const what=rev.length===1
   ?hm(total)+' away '+clock(rev[0].start)+'–'+clock(rev[0].end)
   :hm(total)+' away in '+rev.length+' periods';
 const p=el('<p class="note">'+what+' — not counted, over your '+
   '<button class="lnk">'+hm(PLTSEC*1000)+' break limit</button>.</p>');
 p.querySelector('.lnk').onclick=()=>{
  for(const x of tabs.children)x.classList.toggle('active',x.dataset.tab==='settings');
  TABS.settings();
 };
 return p;
}

// The day's periods, with the day-scope actions at their head — those act on
// the day, not on a selection, so they are kept clear of the per-period
// classifier rather than sitting mid-panel between two period surfaces.
function periodList(lane,d,isWork){
 const box=el('<div></div>');
 const head=el('<div class="plisthead"><h4>When</h4></div>');
 if(isWork&&d.officeEnvelope){
  const b=el('<button class="act fillday">Mark whole day as work</button>');
  b.onclick=()=>fillDay(d);
  head.append(b);
 }
 // Holiday is rare and is about the day's NORM rather than its time, so it goes
 // in an overflow beside the primary day action.
 if(isWork&&(d.isWorkingDay||d.isHoliday)){
  const m=el('<details class="more"><summary>⋯</summary><div class="pop"></div></details>');
  const hb=el('<button class="act">'+(d.isHoliday?'Clear holiday':'Mark as holiday')+'</button>');
  hb.onclick=async()=>{
   if(d.isHoliday)for(const id of (d.holidayCorrectionIds||[]))await api('/corrections/'+id,{method:'DELETE'});
   else await api('/corrections',{method:'POST',body:JSON.stringify({kind:'holiday',start:d.dayStart,end:d.dayStart+86400000})});
   reload();
  };
  m.querySelector('.pop').append(hb);
  head.append(m);
 }
 box.append(head);
 const list=el('<div class="plist"></div>');
 d.periods.forEach((p,idx)=>{
  const dis=!canSelect(d,p); // overnight idle gaps are not selectable
  const item=el('<div class="pitem"></div>');
  const row=el('<button class="prow'+(dis?' disabled':'')+'" data-i="'+idx+'"'+(dis?' disabled':'')+'><span class="pt '+p.type+(p.provisional?' provisional':'')+'"></span>'+
    '<span class="pr">'+clock(p.start)+(p.provisional?'–?':'–'+clock(p.end))+'</span>'+
    '<span class="pd muted">'+hm(p.end-p.start)+'</span>'+
    '<span class="pn muted">'+TYPELABEL[p.type]+(p.provisional?', last seen '+clock(p.lastAlive):'')+'</span></button>');
  if(!dis)row.onclick=()=>lane.__select(idx);
  item.append(row);
  list.append(item);
 });
 box.append(list);
 return box;
}

// Raw per-machine lanes, collapsed by default. For the single-machine user —
// the common case — an always-open raw lane duplicates the merged lane and adds
// a second full-width chart to parse. A collapsed heading is an equally
// consistent shape, without paying the redundancy on every day.
function rawLanes(lane,d){
 const box=el('<details class="adv"><summary class="muted">What each computer recorded</summary></details>');
 const mlanes=el('<div class="mlanes"></div>');
 const pct=ts=>Math.max(0,Math.min(100,((ts-d.dayStart)/86400000)*100));
 (d.machineActivity||[]).forEach(ma=>{
  const segs=markRawProvisional(rawTile(ma.active,d.dayStart),ma.provisional);
  const row=el('<div class="mlane"><div class="mlabel">'+escHtml(ma.label||'Unnamed machine')+'</div><div class="track"'+bandStyle()+'></div></div>');
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
   const growing=!!(s.provisional&&s.growing);
   // No correction identity here, so the positions are overlap-gated and no
   // current position is claimed — the raw lane does not know the merged state.
   const cls=classifier(escHtml(ma.label||'')+' · '+clock(s.start)+'–'+clock(s.end)+' · '+hm(s.end-s.start),
     null,growing?()=>false:rangeEnabled(d,s.start,s.end),v=>classifyRange(d,s.start,s.end,v));
   if(s.provisional)cls.append(el('<span class="prov">no end recorded — last seen '+clock(s.lastAlive)+'</span>'));
   if(growing)cls.append(el('<span class="muted">Still in progress — editable once this machine stops reporting.</span>'));
   row.after(cls);
  });
  mlanes.append(row);
 });
 box.append(mlanes);
 return box;
}

// Exact times: the escape hatch for a boundary no period or raw segment offers.
// It uses the SAME classifier as a selected period — the old control called the
// identical remove_work primitive "Mark private" while the action strip called
// it "Exclude", which is exactly the kind of divergence this change removes.
function advanced(lane,d){
 const adv=el('<details class="adv"><summary class="muted">Enter exact times</summary>'+
   '<div class="times"><label>From<input type="time" class="cs" value="12:00"></label>'+
   '<label>To<input type="time" class="ce" value="13:00"></label></div></details>');
 const toTs=inp=>{const p=inp.value.split(':');return d.dayStart+((Number(p[0])*60+Number(p[1]))*60000);};
 const cs=adv.querySelector('.cs'),ce=adv.querySelector('.ce');
 let cls=null;
 const sync=()=>{
  if(cls)cls.remove();
  const s=toTs(cs),e=toTs(ce);
  cls=classifier('This time was',null,rangeEnabled(d,s,e),v=>classifyRange(d,s,e,v));
  adv.append(cls);
 };
 cs.addEventListener('input',sync);ce.addEventListener('input',sync);sync();
 return adv;
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
