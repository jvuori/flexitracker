## Context

`renderSettings` (`backend/src/ui/render.ts:405-428`) builds every field through one generic helper:

```js
const field=(k,label,val,type)=>{...'<input id="s_'+k+'" type="'+(type||'number')+'" value="'+val+'">'...}
```

so the control is `type="number"` for everything except timezone, which is `type="text"`. The save handler is the mirror image — `Number(v)` for all keys, raw string for `timezone` — and `PUT /settings` merges the result into stored settings with no validation beyond `normalizeWorkingWeekdays`. Because a settings write calls `markAllDaysDirty()`, a bad value silently reshapes every computed day in the account rather than failing at the point of entry.

The stored shape (`Settings` in `backend/src/worktime/settings.ts`) is deliberate and stays as-is: minutes-since-midnight for the workday window, minutes for norms and lunch, seconds for the two threshold rules. This change alters only how those numbers are *presented and entered*, plus what the server accepts.

Constraint: the frontend is node-free vanilla JS built as a string in the Worker — no build step, no npm component library, nothing to import. Controls must be native HTML plus a few lines of JS.

## Goals / Non-Goals

**Goals:**
- Entering a setting requires no unit arithmetic: the user reads and types `08:00`, `7h 30m`, `Europe/Helsinki`.
- The unit lives in the control, not in a label suffix the user must trust.
- Values outside a field's permitted domain are rejected at the `PUT /settings` boundary, fail-fast, rather than persisted.
- Controls stay usable on a phone — native pickers where they exist, touch-sized targets where they don't.

**Non-Goals:**
- No change to `Settings`, the stored JSON, the wire format, or the daemon config subset — this is presentation plus validation.
- Not exposing the currently-hidden daemon thresholds (`minInactivitySec`, `minActivitySec`, `heartbeatSec`, `minActiveSec`, `roundingMin`); this change reworks the fields already on screen.
- No client-side validation framework, and no live re-validation as the user types — the boundary is the server, the controls just make bad input hard to produce.

## Decisions

### 1. Timezone: native `<select>` populated from `Intl.supportedValuesOf('timeZone')`

The full IANA list (~430 entries) comes from the runtime, so no timezone data is bundled and the list cannot drift from what the backend's `Intl` calls accept. On mobile a `<select>` renders as the OS's native scroll picker, which is a better long-list experience than anything custom.

Scrolling ~430 alphabetical entries to reach the one zone the user almost certainly wants is the obvious failure of a raw list, so the two likely answers are lifted to the top in a **Suggested** `<optgroup>`, ahead of an **All timezones** group holding the full list:

```
┌ Suggested ──────────────────────────
│ UTC
│ Europe/Helsinki (current location)
├ All timezones ──────────────────────
│ Africa/Abidjan
│ …
```

The browser-detected zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`, already computed at `render.ts:407` and currently used only as a placeholder) supplies the second entry, labelled `(current location)` so it reads as a recommendation rather than just another identifier. Its `value` is the plain identifier — the label is display text only, and never reaches the patch.

The detected zone therefore appears twice: once in Suggested, once in its alphabetical position. That is intentional and self-resolving — `select.value = stored` selects the *first* matching option, so an account already on the detected zone shows the Suggested one, and the two are interchangeable on save. `<optgroup>` is native, so the grouping renders in the OS picker on mobile too.

*Rejected: preselecting the detected zone when the account is on the `UTC` default.* An earlier draft of this design did that, but it makes the form display a value the account does not hold — the user sees `Europe/Helsinki`, changes nothing else, saves, and gets a timezone they never chose (or worse, navigates away believing it was already set). The control always shows the stored value; making the detected zone the second entry in the list gets the same one-interaction convenience without ever misrepresenting stored state.

*Alternatives considered:* `<input list=...>` + `<datalist>` keeps typeahead but still accepts arbitrary free text — it would not remove the failure mode we are here to remove. A curated short list of common zones is friendlier but wrong for anyone outside it, and needs manual upkeep.

*Rejected: a fallback text input when `Intl.supportedValuesOf` is absent.* It is baseline-available in every browser this app already requires, and a silent fallback would reintroduce exactly the free-text path being deleted. If it is missing, the settings view should fail loudly.

### 2. Workday start/end: `<input type="time">`

Maps exactly onto minutes-since-midnight, gives a native clock picker on mobile and a segmented keyboard-editable field on desktop, and enforces a valid time-of-day without custom code. Two pure helpers do the conversion:

- `minToHHMM(min)` → `"08:00"` (value for the control)
- `hhmmToMin("08:00")` → `480` (value for the patch)

### 3. Durations: a paired hours + minutes control, not `<input type="time">`

`type="time"` is tempting but wrong here: the weekly norm is `37h 30m`, which is not a time of day and cannot be represented. A duration is therefore a small group of two `type="number"` inputs — hours (min `0`, no upper bound beyond validation) and minutes (`0`–`59`) — with `h` / `m` suffix text inside the group, wrapped in one labelled container.

Helpers, again pure and unit-testable:
- `minToHM(min)` → `{h, m}`; `hmToMin(h, m)` → `h*60 + m`

Applies to `dailyNormMin`, `weeklyNormMin`, `lunchDeductMin`, `lunchThresholdMin`, and `privateLeaveThresholdSec`.

*Alternative considered:* a single "total minutes" input with a live `7h 30m` echo beside it. Less typing for someone who thinks in minutes, but it keeps the arithmetic on the user — the exact problem being fixed.

### 4. The private-leave threshold is entered in hours + minutes and converted to seconds

It is stored in seconds (default `7200`) purely because it is compared against second-resolution gap durations; there is no plausible reason to configure it at sub-minute precision, and leaving it as the one seconds field next to four minutes fields is the unit trap described in the proposal. The control divides by 60 on load and multiplies by 60 on save.

*Trade-off:* a stored value not divisible by 60 loses its remainder the first time the user saves the settings form. Only the default (`7200`) and minute-aligned values are reachable today, and the resulting shift is under a minute against a threshold measured in hours — accepted rather than carrying a seconds spinner to preserve it.

### 5. Validation lives in `settings.ts` as a pure function, applied in `putSettings`

`normalizeSettingsPatch(patch)` sits beside the existing `normalizeWorkingWeekdays`, throws on the first violation, and is called by `putSettings` before the merge — so the guarantee holds for every client, not just this UI. `PUT /settings` in `index.ts` maps the throw to a 400 rather than a 500.

Domains, chosen to be permissive enough for real accounts and tight enough to catch a slipped digit or a wrong unit:

| Field | Domain |
| --- | --- |
| `timezone` | non-empty string accepted by `Intl.DateTimeFormat` (probe in a `try`) |
| `workdayStartMin`, `workdayEndMin` | integer `0`–`1439` (see below) |
| `dailyNormMin` | integer `0`–`1440` |
| `weeklyNormMin` | integer `0`–`10080` |
| `lunchDeductMin`, `lunchThresholdMin` | integer `0`–`1440` |
| `privateLeaveThresholdSec` | integer `0`–`86400` |

The office-hours bounds stop at `1439`, not `1440`. They are *times of day*, and 24:00 is not one: `<input type="time">` spans 00:00–23:59, so a stored `1440` would render as blank and save back as something else — a silent mutation of the kind this change exists to prevent. Nothing expressible is lost, because `inHours()` compares against `minuteOfDay()`, which only ever yields 0–1439, making the two values equivalent in the calculation. The duration fields are deliberately *not* capped this way: a duration is not a time of day and legitimately exceeds 24h.

Per-field domains only catch a slipped digit. They do not catch a combination in which each value is individually plausible but the set is incoherent, so a second pass applies **cross-field rules**:

| Rule | Why |
| --- | --- |
| `workdayStartMin < workdayEndMin` | an inverted or empty office-hours window makes `inHours()` reject every gap and the office-day envelope select nothing — the day silently stops bridging |
| `dailyNormMin <= weeklyNormMin` | a daily norm exceeding the weekly one is unsatisfiable: a single day would overrun the whole week's expectation, so every balance is wrong from the first day |
| `lunchDeductMin <= lunchThresholdMin` | deducting more than the qualifying length drives a day just over the threshold to a negative worked total (deduct 60m over a 30m threshold turns a 31-minute day into −29 minutes) |

**Every cross-field rule is evaluated against the merged settings, never the patch alone.** A patch may carry only one side of a pair — setting just `workdayStartMin`, or just `dailyNormMin` — and checking the patch in isolation would let exactly the incoherent combinations through that the rules exist to stop.

Deliberately **not** enforced, because each has a legitimate use:

- *`dailyNormMin` vs the office-hours window length.* A norm longer than the nominal window is normal under flextime — the window is a measurement boundary, not a cap.
- *`weeklyNormMin` vs `dailyNormMin × |workingWeekdays|`.* Tempting, but wrong at the edges: an account with no working days makes the product `0` and would reject every weekly norm, and accounts legitimately treat the weekly figure as authoritative with the daily one as a guide.

*Alternative considered:* validating in the Hono route. Rejected — the DO is the real boundary, and `putSettings` is also reachable from the `/test/*` paths.

### 6. "Workday start/end" becomes "Office hours"

The current labels state a falsehood. `workdayStartMin`/`workdayEndMin` are consumed in exactly two places, and neither is a quantity of work:

- `inHours()` (`worktime.ts:107-113`, called at `:138`) — a gap lying *fully* inside the window is an in-hours break, and so is auto-bridged or measured against the private-leave threshold. A gap touching outside the window is not.
- the **office-day envelope** (`worktime.ts:189-200`) — sensor spans overlapping the window define which activity "belongs" to the day; the envelope then spans their natural boundaries, driving the mark-whole-day-as-work fill.

So the window answers *when am I normally at work, for the purpose of interpreting gaps and activity* — while `dailyNormMin`/`weeklyNormMin` answer *how much am I contracted to work*. Presenting both as an undifferentiated list of numbers invites the reading that the window sets the expectation, which it does not: shortening office hours does not reduce anyone's norm.

The label therefore becomes **Office hours**, presented as a single labelled range (`08:00` – `16:00`) rather than two separate fields, since the two bounds are meaningless apart. `worktime.ts` already names these `officeStart`/`officeEnd` and comments them "Office-day envelope", so this aligns the UI with the calc's existing vocabulary rather than inventing a term.

*The stored keys stay `workdayStartMin`/`workdayEndMin`.* Renaming them would touch the `Settings` interface, stored JSON, and the daemon-facing config subset, requiring a migration for a cosmetic gain. Accepted wart: the settings key and its label diverge. If the keys are ever renamed, that is its own change.

### 7. The form is divided into three titled sections, split by *when* vs *how much*

Nine controls in a flat list give no signal about which setting affects what. The split follows the distinction drawn in decision 6 — settings that tell the service **when and how to interpret activity**, versus settings that state **how much work is expected**:

| Section | Controls | One-line explanation shown to the user |
| --- | --- | --- |
| General | timezone | — |
| Office hours | office hours range, private-leave threshold | when you are normally at work — used to interpret gaps and activity, not how much you are expected to work |
| Norms | working days, daily norm, weekly norm, lunch deduction, lunch applies over | how much work is expected, and what is deducted from it |

Each section is a heading plus a short muted explanation, so the office-hours/norms distinction is stated once in the place it is needed rather than left to be inferred.

**Lunch belongs with the norms, not with office hours.** An earlier draft grouped it under Office hours on the theory that it describes the shape of a normal day. That is the wrong cut: `lunchDeductMin` subtracts from the day's counted time and `lunchThresholdMin` decides whether it applies — both act on *how much* the day is worth, not on *when* the user is present. It sits next to the norms it modifies.

**The private-leave threshold belongs with office hours.** It is only ever consulted for gaps lying fully inside the office-hours window (`inHours()` gates it), so the window is precisely its scope; reading it apart from the window leaves it meaningless. An earlier draft kept it in a separate Rules section out of a worry that mixing a classification parameter into the window's section would re-blur the when/how-much distinction — but it is on the *when* side of that distinction, so co-locating it sharpens the split rather than blurring it.

With those two moves, the Rules section holds nothing and is dropped. That is the sign the cut is now in the right place: every setting is either about *when* or about *how much*, and none needs a miscellaneous bucket.

*Alternative considered:* collapsible sections. Rejected — nine controls do not need progressive disclosure, and hiding settings behind a toggle makes them harder to discover on mobile, not easier.

### 8. `renderSettings` is restructured around three builders

`field()` is replaced by `zoneField()`, `timeField()`, and `durationField()`, each appending a label plus its control and registering a read function. The save handler then collects from those read functions instead of doing `Number(document.getElementById('s_'+k).value)` over a key list — which removes the parallel-array coupling between the render list and the save list that makes the current code easy to break.

## Risks / Trade-offs

- **A ~430-option `<select>` is heavy to scroll on desktop** → native selects support type-ahead by keystroke, and the current zone is preselected, so the common path is "open, confirm, close". Not worth a custom combobox.
- **`type="time"` presentation is locale-dependent** (some locales render a 12-hour control) → the underlying value is always normalised `HH:MM`, so conversion is unaffected; only the display differs, and it matches what the user's OS does everywhere else.
- **New server-side validation could reject a value some existing account already stores** → domains are set wide enough to admit every value reachable from the current UI and the defaults; validation applies to the incoming patch, so stored values are never retroactively rejected on read.
- **Two number inputs per duration is more DOM and more CSS than one field** → contained to one builder and one CSS rule; the alternative puts arithmetic back on the user.

## Migration Plan

None required — no stored-shape change and no wire-format change. Ships in a normal deploy; rollback is a redeploy of the previous commit, since nothing is written in a new format.

## Open Questions

- Should the workday window and norms be validated as *mutually* consistent (e.g. daily norm not exceeding the workday window length)? Deliberately excluded for now: the norm is a contractual figure and the window is a measurement boundary, and a legitimate account can have a norm longer than its nominal window.
