## 1. Boundary validation

- [x] 1.1 Add `normalizeSettingsPatch(patch, current)` to `backend/src/worktime/settings.ts` beside `normalizeWorkingWeekdays`: throw on the first violation across `timezone` (non-empty, probe with `Intl.DateTimeFormat` in a `try`), `workdayStartMin`/`workdayEndMin` (integer 0–1440), `dailyNormMin`/`lunchDeductMin`/`lunchThresholdMin` (integer 0–1440), `weeklyNormMin` (integer 0–10080), `privateLeaveThresholdSec` (integer 0–86400).
- [x] 1.2 Add the cross-field rules to the same function, each evaluated against the **merged** settings so a patch carrying only one side of a pair is still checked: `workdayStartMin < workdayEndMin`, `dailyNormMin <= weeklyNormMin`, `lunchDeductMin <= lunchThresholdMin`.
- [x] 1.3 Make each rule's error message name both operands and their effective values, so a partial patch rejected against a stored counterpart is diagnosable from the message alone.
- [x] 1.4 Call `normalizeSettingsPatch` in `putSettings` (`backend/src/tenant-do.ts`) **before** the merge and before `markAllDaysDirty()`, so a rejected write leaves settings untouched and marks nothing dirty.
- [x] 1.5 In `api.put("/settings")` (`backend/src/index.ts`), map a validation throw to a 400 with the message, leaving other failures as-is.

## 2. Validation tests

- [x] 2.1 In `backend/test/settings.test.ts`, cover `normalizeSettingsPatch`: a valid patch passes through; out-of-range, non-integer, and negative values throw for each field.
- [x] 2.2 Cover the timezone domain: a valid IANA zone passes, an uninterpretable string and an empty string throw.
- [x] 2.3 Cover each cross-field rule in both directions — `start`/`end`, `dailyNorm`/`weeklyNorm`, `lunchDeduct`/`lunchThreshold`: an incoherent pair throws, a coherent one passes.
- [x] 2.4 Cover the partial-patch case for each rule, which is the one that regresses if the check ever moves off the merged settings: a patch supplying only the *lower* half of a pair against a stored upper half, and only the *upper* half against a stored lower half.
- ~~2.5 Assert a rejected write is inert: stored settings unchanged and no day marked dirty.~~ **Dropped.** Requires instantiating `TenantDO`, which extends `DurableObject` from `cloudflare:workers` — only resolvable under the Workers vitest pool, which this project does not have (`vitest.config.ts` anticipates it, but `@cloudflare/vitest-pool-workers` was never added). Adding it is toolchain + CI work deserving its own change. Inertness is structurally guaranteed instead — `putSettings` validates before the merge and before `markAllDaysDirty()`, so a throw reaches neither — and tasks 5.7/5.8 assert the observable half over HTTP.

## 3. Conversion helpers

- [x] 3.1 Add pure helpers to the UI script in `backend/src/ui/render.ts`: `minToHHMM(min)`/`hhmmToMin(str)` for time-of-day, and `minToHM(min)`/`hmToMin(h,m)` for durations.
- [x] 3.2 Unit-test the four helpers round-trip (`480 ↔ "08:00"`, `2250 ↔ {h:37,m:30}`, midnight and zero edges). If the helpers are not importable from the browser-script string, extract them to a small module the script inlines so they are testable.

## 4. Settings controls

- [x] 4.1 Replace the generic `field()` in `renderSettings` with three builders — `zoneField`, `timeField`, `durationField` — each appending its label plus control and returning/registering a read function, so the render list and save list are no longer parallel arrays keyed by string.
- [x] 4.2 `zoneField`: a `<select>` with a **Suggested** `<optgroup>` holding `UTC` then the browser-detected zone labelled `<zone> (current location)`, followed by an **All timezones** `<optgroup>` populated from `Intl.supportedValuesOf('timeZone')`. Each option's `value` is the bare identifier so the `(current location)` marking never reaches the patch. No free-text fallback.
- [x] 4.3 Select the account's **stored** zone (`select.value = s.timezone`, which resolves to the Suggested duplicate when they match) — do not substitute the detected zone on a default account, so the control never displays a value the account does not hold.
- [x] 4.4 `timeRangeField`: one **Office hours** label over a pair of `<input type="time">` controls for `workdayStartMin`/`workdayEndMin`, converting via `minToHHMM`/`hhmmToMin`. Drop the separate "Workday start"/"Workday end" labels — the two bounds are meaningless apart.
- [x] 4.5 `durationField`: paired hours + minutes `<input type="number">` (minutes 0–59) in one labelled group with `h`/`m` suffixes, used for `dailyNormMin`, `weeklyNormMin`, `lunchDeductMin`, `lunchThresholdMin`, and `privateLeaveThresholdSec` (÷60 on load, ×60 on save).
- [x] 4.6 Drop the `(min)`, `(min from midnight)`, and `(sec)` suffixes from all affected labels.
- [x] 4.7 Add a `section(title, explanation)` builder (heading + muted one-liner) and lay the form out as **General** (timezone), **Office hours** (office-hours range, private-leave threshold), **Norms** (working days, daily norm, weekly norm, lunch deduction, lunch applies over). There is no Rules section — every setting is either about *when* or about *how much*.
- [x] 4.8 Write the section explanations, making the when/how-much distinction explicit — office hours = when you are normally at work, used to interpret gaps and activity, *not* how much you are expected to work; norms = how much work is expected and what is deducted from it. Note on the private-leave threshold that it applies only to gaps **inside** office hours.
- [x] 4.9 Rewrite the save handler to collect from the builders' read functions instead of `Number(document.getElementById('s_'+k).value)` over a hardcoded key list; keep the existing `workingWeekdays` collection and the `Saved ✓` feedback.
- [x] 4.10 Add CSS for the duration group, the office-hours range pair, and the section headings/explanations, next to the existing `input,select` and `.wdays` rules (~`render.ts:147-150`): inline inputs, touch-sized targets, muted explanation text, no horizontal overflow on a narrow phone viewport.

## 5. Verify end-to-end

- [x] 5.1 Run the backend unit tests — all green.
- [x] 5.2 Drive the UI locally: confirm the workday window shows `08:00`/`16:00`, the norms show `7h 30m`/`37h 30m`, and the private-leave threshold shows `2h 0m` on a default account.
- [x] 5.3 Change one setting of each kind, save, reload, and confirm the values round-trip and the week view recomputes.
- [x] 5.4 Confirm the timezone select opens with UTC then the detected zone marked `(current location)` ahead of the full list, that a default account still shows `UTC` selected, and that picking the current-location entry persists the bare identifier.
- [x] 5.5 Check the form at a narrow mobile viewport: native time and select pickers open, the duration pairs stay on one line, and nothing overflows horizontally.
- [x] 5.6 Confirm the form reads as three titled sections, that Office hours carries the "when you are normally at work, not how much you are expected to work" explanation and holds the private-leave threshold, and that lunch sits with the norms.
- [x] 5.7 Send an out-of-domain value directly to `PUT /settings` (bypassing the UI) and confirm a 400 with settings unchanged.
- [x] 5.8 Send each incoherent cross-field combination directly to `PUT /settings` — inverted office hours, daily norm above weekly, lunch deduction above its threshold — and confirm a 400 with settings unchanged, including as a partial patch checked against a stored counterpart.
