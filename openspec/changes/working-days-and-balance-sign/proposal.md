## Why

Working days are already modelled internally (`workingWeekdays`, default Mon–Fri) but the Settings UI gives no way to edit them, and non-working days are displayed as an inert `—` even when the user actually worked. A Saturday of overtime should visibly credit the balance, and a user should be able to say which weekdays are theirs. Separately, positive balances read ambiguously next to durations: `-1h 30m` is clearly a deficit, but `1h 30m` gives no cue that it is a surplus.

## What Changes

- Let the user pick their **working days** in the Settings view (default Mon–Fri). Days left unchecked are non-working (weekends by default).
- Guarantee that a **non-working day can only increase the balance**: its norm is zero, so its balance is exactly the time worked (never negative), and that credit flows into the weekly balance. E.g. 3h worked on a Saturday counts as **+3h** on the week.
- Show a non-working day's positive credit in its lane (e.g. `+3h 00m`) instead of the current `—`; a non-working day with no work stays neutral.
- **Balance sign cue:** prefix positive balances with `+` (negatives already carry `-`). Applies to daily and weekly balances only — plain durations (worked time, lunch, norms) keep no sign.
- Validate `workingWeekdays` at the `/settings` ingest boundary (integers 0–6, deduplicated) so the new editor cannot persist garbage.
- **Non-working days look different:** give non-working-day lanes a quiet, recessed treatment (a faint neutral background tint + a muted "weekend"/non-working label, not colour alone) so it's obvious at a glance which lanes carry no norm, legible in both themes.
- **Per-day lunch visibility:** show each day's lunch deduction in its lane when non-zero, so the user sees why worked time is below gross (today only the weekly summary surfaces lunch). The lunch amount and the day-length threshold that triggers it are *already* configurable settings (default 30 min over 6 h) — no new settings, just surface the per-day figure.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `worktime-calculation`: make explicit that non-working days have a zero norm and contribute only non-negative balance, daily and weekly.
- `web-ui`: Settings screen gains a working-days editor; balances render with an explicit sign and non-working days show their positive credit.

## Impact

- **Backend calc** (`backend/src/worktime/worktime.ts`): no math change expected — a regression test pins the non-working-day add-only guarantee.
- **Settings validation** (`backend/src/tenant-do.ts` `putSettings`): validate/normalise `workingWeekdays`.
- **UI** (`backend/src/ui/render.ts`): working-days checkboxes in Settings; a balance-only signed formatter; non-working-day lane shows credit; each lane shows its lunch deduction when non-zero.
- **Tests**: `backend/test/worktime.test.ts` for the balance guarantee; settings-validation coverage.
- No API surface, schema, or daemon changes.
