## MODIFIED Requirements

### Requirement: Transcription-friendly presentation
Working times and balances SHALL be presented so the user can both verify the computed result and read off the value to transcribe, without the two ever being confusable for each other.

Exact values SHALL be the single basis for every figure that stands in an arithmetic relationship to another figure on screen: a day's or week's working time, its norm, its lunch deduction, and its balance SHALL all be exact, so that any two such figures reconcile. No presentation SHALL invite the user to compute one displayed figure from another and arrive at a third displayed figure that disagrees.

The rounded-to-half-hour value SHALL be presented per day, alongside that day's exact working time, as the value to transcribe. It is exempt from the exactness rule above because it is an output rather than a term — no other displayed figure is derived from it. To keep that distinction legible it SHALL be visually subordinate to the exact working time and rendered in a different unit form, so the two cannot be read as competing statements of the same quantity. Rounding remains a presentation concern only — it SHALL NOT feed any balance, norm comparison, weekly total, or stored value.

#### Scenario: Exact and rounded both available on the day
- **WHEN** the user views a week
- **THEN** each day's lane carries both its exact working time and its rounded-to-half-hour reportable value, without the user cross-referencing a separate surface

#### Scenario: Figures shown together reconcile
- **WHEN** a day's working time and its balance are displayed on the same lane
- **THEN** both are exact, and the working time minus the day's norm equals the displayed balance

#### Scenario: The rounded value is distinguishable from the exact one
- **WHEN** a day's lane shows both figures
- **THEN** the exact value is the dominant figure and the rounded value is subordinate and in a different unit form, so neither is mistaken for the other

#### Scenario: Rounding does not affect computation
- **WHEN** a day's working time is rounded for transcription
- **THEN** the rounding affects only that presentation, and the day's balance, the weekly total, and the weekly balance remain computed from exact values

#### Scenario: No rounded weekly aggregate is presented as a total
- **WHEN** the weekly summary is displayed
- **THEN** its worked total is exact, and no rounded aggregate is shown that could disagree with it
