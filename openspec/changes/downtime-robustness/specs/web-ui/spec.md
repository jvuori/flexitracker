## ADDED Requirements

### Requirement: An unclosed span is presented as provisional, not as confirmed time
A period whose end was inferred from a machine's last liveness evidence, rather than observed from a closing event, SHALL be presented as the last known situation rather than as a settled measurement. It SHALL state when the machine was last seen, so the user reads it as "active at least until that time, then unknown" rather than as confirmed working time.

The uncertainty SHALL be presented as a property of the **whole period**, not only of its trailing portion, because the period has no confirmed end until a closing event arrives. The period SHALL therefore be visually distinct from measured periods along its whole extent, and its right edge SHALL additionally be drawn as indefinite rather than as a hard boundary.

The presentation SHALL re-adapt as knowledge improves. When further liveness evidence arrives — including events buffered during a network outage and delivered later — the provisional end SHALL move to reflect it. When an explicit closing event arrives, the period SHALL cease to be provisional and SHALL be presented as an ordinary measured period.

This preserves the rule that the user can always see why a minute counts: an inferred end is a different kind of claim from a measured one, and presenting the two identically would assert a certainty the data does not carry.

#### Scenario: Open span marked as provisional
- **WHEN** a day contains a span with no closing event, ended by the inferred bound
- **THEN** that period is visually distinct from measured periods and shows when the machine was last seen

#### Scenario: Provisional end advances as heartbeats arrive
- **WHEN** further heartbeats for that machine arrive and extend the last-seen time
- **THEN** the period's end and its stated last-seen time move accordingly on the next view

#### Scenario: Outage backlog resolves the presentation
- **WHEN** events buffered through a network outage are flushed and include the machine's own closing event
- **THEN** the period is no longer shown as provisional and appears as an ordinary measured period

#### Scenario: Confirmed periods are unaffected
- **WHEN** a day's spans all have observed closing events
- **THEN** no period is marked provisional and the day's presentation is unchanged

### Requirement: A still-growing period offers no edit actions
While a provisional period's machine is still being seen, so the period's extent is still advancing, the UI SHALL NOT offer correction actions on it. Anchoring a correction to boundaries that are still moving would produce a correction the user did not mean by the time it is applied.

Once the machine is no longer being seen, the period's extent stops advancing and correction actions SHALL be available again, even though the period remains provisional. A machine that never returns leaves a permanently provisional period, and withholding corrections from it would make that period impossible to fix — replacing an over-count with an uncorrectable one.

#### Scenario: No actions offered on a live, growing period
- **WHEN** the user selects a provisional period whose machine has been seen within the liveness window
- **THEN** no correction action is offered, and the period is presented as still in progress

#### Scenario: Actions return once the period stops moving
- **WHEN** the machine has not been seen for longer than the liveness window, leaving the period provisional but no longer advancing
- **THEN** correction actions are offered as for any other period

#### Scenario: A resolved period is fully editable
- **WHEN** the machine's closing event arrives and the period becomes an ordinary measured period
- **THEN** the usual correction actions are offered
