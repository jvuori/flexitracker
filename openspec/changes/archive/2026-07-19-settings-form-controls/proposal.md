## Why

The Settings screen exposes the account's stored representation instead of a human one. Timezone is free text; the workday window is entered as "minutes from midnight" (08:00 must be typed as `480`); every norm and rule is a raw minute count, except the private-leave threshold, which is raw *seconds* sitting between two minute fields. The user has to do unit arithmetic to change a setting, and a plausible typo — `4800`, a misspelt IANA zone, minutes where seconds were wanted — is accepted and silently reshapes every computed day. These are the values every balance is derived from, so the input controls should make the wrong value hard to enter and the current value obvious at a glance.

## What Changes

- **Timezone becomes a selection**, not free text: the user picks from the IANA zone list rather than typing an identifier, with the browser-detected zone offered as the default choice.
- **Workday start and end become time-of-day controls** showing `08:00` / `16:00`. Minutes-from-midnight remains the stored and transported representation — the control converts on load and save.
- **Daily norm, weekly norm, lunch deduction, lunch threshold, and the private-leave threshold become duration controls** entered as hours + minutes (`7h 30m`, `37h 30m`, `2h 0m`) rather than a single scalar in an implied unit. The private-leave threshold is entered in the same hours/minutes form as its neighbours despite being stored in seconds, removing the odd unit out.
- **Field labels drop their unit suffixes** (`(min)`, `(min from midnight)`, `(sec)`) because the control now carries the unit.
- **"Workday start/end" is renamed and regrouped as "Office hours"**, together with the private-leave threshold that is only ever consulted inside that window. The current labels imply the window defines how much the user is expected to work, when in fact it defines *when* rules apply — which gaps are in-hours breaks, and which activity belongs to the day.
- **The form gains titled sections with short explanations** — General, Office hours, Norms — instead of one flat list of nine controls whose relationships are invisible. The split is *when* versus *how much*: the office-hours window and its threshold govern how activity is interpreted, while the norms, working days, and the lunch deduction govern how much work is expected and what is subtracted from it.
- Settings values are **validated at the `PUT /settings` boundary** — currently only `workingWeekdays` is checked, so an out-of-range or non-numeric value from any client is persisted and corrupts subsequent calculations.
- No change to the `Settings` interface, the stored JSON, the wire format, or the daemon-facing config subset. This is a presentation and validation change only, so no migration is required.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `web-ui`: the Settings screen requirement gains input-control requirements — timezone chosen from a list, workday bounds as time-of-day controls, and every duration entered as hours + minutes rather than a scalar in an implied unit.
- `tenant-storage`: settings writes are validated and rejected fail-fast when a value falls outside its permitted domain, instead of being merged and persisted unchecked.

## Impact

- **UI** (`backend/src/ui/render.ts`): `renderSettings` is rebuilt around three reusable control builders (zone select, time-of-day, duration) replacing the single generic `field()` helper, and laid out in three titled sections; the save handler reads structured controls instead of `Number(input.value)`. New CSS for the paired hours/minutes duration control and the section headings, sized for touch.
- **Naming**: only the *labels* change. The stored keys stay `workdayStartMin`/`workdayEndMin`, so there is no migration and no daemon impact; the UI vocabulary moves toward the `officeStart`/`officeEnd` naming `worktime.ts` already uses internally.
- **Validation** (`backend/src/worktime/settings.ts`, `backend/src/tenant-do.ts` `putSettings`): a `normalizeSettingsPatch` alongside the existing `normalizeWorkingWeekdays`, applied in `putSettings`; `PUT /settings` in `backend/src/index.ts` maps the throw to a 400.
- **Tests** (`backend/test/settings.test.ts`): unit coverage for the new validation and for the minutes↔`HH:MM` / minutes↔hours+minutes conversions.
- Relies on `Intl.supportedValuesOf('timeZone')` for the zone list — no bundled timezone data, no dependency, consistent with the node-free frontend.
- No daemon change: the daemon reads `minInactivitySec`/`minActivitySec`/`heartbeatSec`, which this change does not touch.
