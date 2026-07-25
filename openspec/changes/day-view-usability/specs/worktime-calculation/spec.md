## MODIFIED Requirements

### Requirement: Transcription-friendly presentation
Working times and balances SHALL be presented so the user can both verify the computed result and read off the value to transcribe, without the two ever being confusable for each other.

Exact values SHALL be the single basis for every figure shown alongside another figure: a day's or week's working time, its norm, its lunch deduction, and its balance SHALL all be exact, so that any two figures presented together reconcile arithmetically. A rounded-to-half-hour value SHALL NOT be shown beside an exact one.

The rounded-to-half-hour presentation SHALL be provided in a dedicated transcription surface covering the whole week, in a form distinct from the exact figures, so that both remain available in one view while it is unambiguous which is the reportable value. Rounding remains a presentation concern only — it SHALL NOT feed any balance, norm comparison, or stored value.

#### Scenario: Exact and rounded both available in one view
- **WHEN** the user views a week
- **THEN** each day's exact working time is shown on its lane and each day's rounded-to-half-hour value is shown in the transcription surface, both reachable without navigating away

#### Scenario: Figures shown together reconcile
- **WHEN** a day's working time and its balance are displayed on the same lane
- **THEN** both are exact, and the working time minus the day's norm equals the displayed balance

#### Scenario: No rounded value beside an exact one
- **WHEN** a day's lane or the weekly summary is displayed
- **THEN** no rounded-to-half-hour figure appears alongside the exact figures

#### Scenario: Rounding does not affect computation
- **WHEN** a day's working time is rounded for transcription
- **THEN** the rounding affects only that presentation, and the day's balance, the weekly total, and the weekly balance remain computed from exact values
