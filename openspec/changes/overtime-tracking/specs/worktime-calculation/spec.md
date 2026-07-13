## ADDED Requirements

### Requirement: Overtime tracked separately from flextime
Time marked as overtime SHALL be treated as worked-but-separate: it SHALL NOT contribute to a day's flextime working time, gross time, lunch-threshold basis, daily norm balance, or the weekly balance. Instead, overtime SHALL be accumulated into a distinct **daily overtime total** and **weekly overtime total**. An overtime span SHALL take precedence over any flextime disposition for the same time (measured, auto-bridged, manual addition, reviewable, removed, or plain gap): that time is overtime and is removed from the flextime layers. Overtime SHALL be asserted independently of sensor data — an overtime span with no underlying activity still counts as overtime for its full duration.

#### Scenario: Overtime excluded from the flextime balance
- **WHEN** a day has 8 hours counting toward flextime and a further 2 hours marked as overtime
- **THEN** the day's flextime worked time and balance reflect only the 8 hours, and the day's overtime total is 2 hours

#### Scenario: Overtime does not affect lunch
- **WHEN** overtime is marked on a day
- **THEN** the lunch deduction is decided only from the flextime working time, ignoring the overtime

#### Scenario: Weekly overtime is the sum of daily overtime
- **WHEN** a week has overtime on several days
- **THEN** the weekly overtime total is the sum of the days' overtime totals, kept separate from the weekly flextime balance

#### Scenario: Overtime over measured time removes it from flextime
- **WHEN** a measured (or auto-bridged) period is marked as overtime
- **THEN** that time no longer counts toward flextime worked time and instead counts toward the overtime total

#### Scenario: Overtime asserted over a gap
- **WHEN** a plain idle gap with no activity is marked as overtime
- **THEN** the full span counts toward the overtime total even though no sensor activity underlies it

### Requirement: Overtime is a distinct period in the day partition
The complete day partition SHALL include overtime as its own typed period, disjoint from every flextime-counted period (measured, auto-bridged, manual addition) and from the non-counted periods (reviewable, removed, gap). The partition SHALL remain gap-free and non-overlapping. The flextime-counted periods SHALL sum to the day's flextime gross (before lunch), and the overtime periods SHALL sum to the day's overtime total; the two sets SHALL NOT overlap.

#### Scenario: Overtime tiles the day without overlap
- **WHEN** a day with overtime is computed
- **THEN** every instant still resolves to exactly one period, and overtime periods neither overlap nor are counted as flextime

#### Scenario: Flextime and overtime sums are separate and consistent
- **WHEN** a day with overtime is computed
- **THEN** the flextime-counted periods sum to the flextime gross and the overtime periods sum to the overtime total
