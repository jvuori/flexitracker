# worktime-calculation Specification

## Purpose
TBD - created by archiving change flexitracker. Update Purpose after archive.
## Requirements
### Requirement: Timezone-authoritative boundaries
All timestamps SHALL be stored in UTC, and a per-account timezone setting SHALL be authoritative for every day boundary, week boundary, and rule evaluation. The viewing browser SHALL NOT alter how data is bucketed.

#### Scenario: Consistent totals across viewing locations
- **WHEN** the same week is viewed from two different browser timezones
- **THEN** the per-day totals are identical, computed in the account timezone

#### Scenario: Browser only pre-fills setting
- **WHEN** an account has no timezone set on first setup
- **THEN** the browser timezone is offered as a default but does not change stored data

### Requirement: Minimum active span drop
Derived active spans shorter than the configured minimum SHALL be discarded before further processing.

#### Scenario: Micro-activity discarded
- **WHEN** a derived active span is shorter than the minimum active span
- **THEN** it does not contribute to working time

### Requirement: Presence-based gap bridging by regime
Gap handling SHALL depend on whether the gap falls within configured working hours. During working hours the user SHALL be assumed present: a gap between active spans SHALL be counted as working time unless it exceeds the configured private-leave threshold, in which case it SHALL be treated as private leave and NOT counted. Outside working hours the user SHALL be assumed off: gaps SHALL NOT be bridged, and only actual active spans SHALL count toward working time.

#### Scenario: In-hours break bridged
- **WHEN** a gap during working hours (e.g. a coffee break, lunch, or short meeting) is shorter than the private-leave threshold
- **THEN** the gap is counted as working time

#### Scenario: In-hours long absence excluded
- **WHEN** a gap during working hours exceeds the private-leave threshold
- **THEN** it is treated as private leave and not counted as working time

#### Scenario: Evening break not bridged
- **WHEN** two active spans outside working hours are separated by a personal break of any length
- **THEN** the break is not counted, while each active span still counts toward working time

#### Scenario: Sporadic extra work counted
- **WHEN** the user does intermittent work outside working hours
- **THEN** every active span is added to the flextime total regardless of the gaps between them

### Requirement: Working time composed from distinguishable sources
A day's working time SHALL be composed from three additive sources plus one subtractive source, and every resulting period SHALL retain which source produced it: (a) **direct sensor activity** (active spans), (b) **automatic bridging** (in-hours gaps counted per the settings-and-time rule), and (c) **manual additions** (`add_work` corrections). **Manual removals** (`remove_work` corrections) SHALL subtract time and SHALL take precedence over every additive source. Provenance SHALL be retained for display and audit.

#### Scenario: Auto-bridged period attributed to bridging
- **WHEN** an in-hours gap is counted by automatic bridging
- **THEN** the counted period is attributed to automatic bridging, distinct from direct sensor activity

#### Scenario: Manual addition attributed to correction
- **WHEN** a period counts as working only because of an `add_work` correction
- **THEN** that period is attributed to a manual addition

#### Scenario: Manual removal overrides all additive sources
- **WHEN** a `remove_work` correction overlaps sensor activity or an auto-bridged period
- **THEN** the overlapping time is excluded regardless of the additive sources

### Requirement: In-hours idle gaps are preserved and reclassifiable both ways
Every in-hours idle gap SHALL be preserved and identifiable with its default classification — counted (auto-bridged, below the private-leave threshold) or excluded (private leave, at or above it) — regardless of that default, and SHALL NOT be silently discarded. The user SHALL be able to override either default: exclude a counted gap or include an excluded gap.

#### Scenario: Short gap bridged but still preserved
- **WHEN** an in-hours gap below the private-leave threshold is auto-bridged into working time
- **THEN** it is counted yet retained as a distinct idle period with its start, end, and duration

#### Scenario: Long gap excluded but still preserved
- **WHEN** an in-hours gap at or above the private-leave threshold is excluded as private leave
- **THEN** it is retained as a distinct reviewable candidate rather than dropped

#### Scenario: Counted gap reclassified as private
- **WHEN** the user marks an auto-bridged in-hours gap as private time
- **THEN** a `remove_work` correction excludes that span and the day's working time decreases accordingly

#### Scenario: Excluded gap reclassified as working
- **WHEN** the user reclassifies an excluded in-hours gap as working (e.g. a business lunch)
- **THEN** an `add_work` correction includes that span and the day's working time increases accordingly

### Requirement: Cross-midnight split
A span or working period crossing midnight (in the account timezone) SHALL be split so each portion is attributed to its own day.

#### Scenario: Overnight span split
- **WHEN** work continues from before to after local midnight
- **THEN** the time is divided into two days at the local midnight boundary

### Requirement: Conditional lunch deduction
A configurable lunch deduction SHALL be applied to a day only when that day's working time exceeds a configurable threshold.

#### Scenario: Long day deducted
- **WHEN** a day's working time exceeds the lunch threshold
- **THEN** the configured lunch amount is deducted from that day's total

#### Scenario: Short day not deducted
- **WHEN** a day's working time is at or below the lunch threshold
- **THEN** no lunch deduction is applied

### Requirement: Single-week saldo against configurable norms
The system SHALL compute, for one ISO week (Monday–Sunday), each day's working time and balance against a configurable daily norm, and the weekly total against an independent configurable weekly norm. It SHALL NOT compute a cumulative or carryover saldo across weeks.

#### Scenario: Daily balance shown
- **WHEN** a day's working time is computed
- **THEN** its balance is that time minus the configured daily norm

#### Scenario: No carryover
- **WHEN** a new week is viewed
- **THEN** its balances start fresh with no carryover from prior weeks

### Requirement: Transcription-friendly presentation
Working times and balances SHALL be presented as exact values with a rounded-to-half-hour value shown alongside.

#### Scenario: Exact and rounded shown together
- **WHEN** a day's working time is displayed
- **THEN** both the exact time and its nearest half-hour rounding are shown

### Requirement: Day result exposes a complete selectable partition
A computed day SHALL expose a complete, gap-free partition of the day in which every instant is attributed to exactly one typed period — measured, auto-bridged, manual addition, reviewable exclusion, manual removal, or a plain idle gap — so that any point of the day can be resolved to the single period covering it. Plain idle time that today carries no derived period (out-of-hours idle, or in-hours idle that is neither auto-bridged nor a reviewable candidate) SHALL be emitted as an explicit gap period rather than left as an implicit hole. The partition SHALL be consistent with the working-time composition: the counted periods of the partition SHALL sum to the same working time the day reports.

#### Scenario: Every instant resolves to one period
- **WHEN** a day is computed
- **THEN** the day exposes typed periods that tile the whole day with no gaps and no overlaps, and any instant resolves to exactly one of them

#### Scenario: Plain idle time is an explicit gap period
- **WHEN** a day contains idle time that is neither auto-bridged nor a reviewable candidate (e.g. out-of-hours idle)
- **THEN** that time is emitted as an explicit gap period, not omitted from the partition

#### Scenario: Partition agrees with reported working time
- **WHEN** a day is computed
- **THEN** the durations of the counted periods in the partition sum to the day's gross working time before lunch

### Requirement: Office-day envelope for whole-day fill
A computed day SHALL expose an office-day envelope used to fill the working day. A presence period belongs to the office day iff it overlaps (non-empty intersection with) the configured office window; the envelope runs from the natural start of the earliest belonging period to the natural end of the latest belonging period. The office-window boundary times SHALL NOT appear as envelope endpoints. When no presence period overlaps the office window, the day SHALL expose no office-day envelope.

#### Scenario: Envelope uses natural boundaries of belonging periods
- **WHEN** presence begins at 06:50 (overlapping a 07:00 office start) and the last office-overlapping session ends at 17:20
- **THEN** the office-day envelope is 06:50–17:20, using the real boundaries and never the 07:00/17:00 office-window times

#### Scenario: Non-overlapping presence does not belong
- **WHEN** a presence period lies entirely outside the office window (e.g. a 06:00–06:40 pre-work check, or an evening 20:30 session)
- **THEN** it does not contribute to the office-day envelope

#### Scenario: No office presence yields no envelope
- **WHEN** a day has no presence period overlapping the office window
- **THEN** the day exposes no office-day envelope

### Requirement: Holiday days carry no norm
A day marked as a holiday SHALL have a daily norm of zero, regardless of whether its weekday is a working day. Its daily balance SHALL therefore equal the time worked and SHALL never be negative. Marking a day as a holiday SHALL NOT exclude or alter measured activity or corrections on that day: any working time on a holiday SHALL still count and credit the balance.

#### Scenario: Holiday with no work is neutral
- **WHEN** a working weekday is marked as a holiday and has no working time
- **THEN** its norm is zero and its daily balance is zero — it does not owe the norm

#### Scenario: Work on a holiday still credits
- **WHEN** a day marked as a holiday has 2 hours of working time
- **THEN** its daily balance is +2 hours (worked minus a zero norm) and that time adds to the weekly balance

#### Scenario: Holiday overrides the working-day norm
- **WHEN** a weekday that is a working day is marked as a holiday
- **THEN** that day's norm is zero for as long as the holiday marker exists, and clearing the marker restores the working-day norm

### Requirement: Holidays reduce the weekly norm
The weekly norm used for the weekly balance SHALL be reduced by one daily-norm for each holiday that falls on a day that would otherwise be a working day, so that a week of holidays does not report a weekly deficit while every day reads zero. The reduction SHALL NOT drop the effective weekly norm below zero. A holiday on a day that is already a non-working day SHALL NOT change the weekly norm (that day already carried no norm).

#### Scenario: A vacation week nets to zero
- **WHEN** every working weekday of a week is marked as a holiday and no work is done
- **THEN** each day's balance is zero and the weekly balance is zero (the weekly norm is reduced to zero)

#### Scenario: One vacation day does not create a weekly deficit
- **WHEN** a week has one working weekday marked as a holiday and the other working days meet their norms
- **THEN** the weekly norm is reduced by one daily-norm and the weekly balance does not show a deficit for the holiday

#### Scenario: Holiday on a non-working day leaves the weekly norm unchanged
- **WHEN** a non-working weekday (e.g. a Sunday) is marked as a holiday
- **THEN** the effective weekly norm is unchanged, since that day already contributed no norm

### Requirement: Non-working days credit only
A day whose weekday is not in the configured working days SHALL have a daily norm of zero, so its daily balance equals the time worked and is therefore never negative. A working day (weekday in the configured set) SHALL keep the configurable daily norm. Because the weekly balance is the week's total worked time against the weekly norm, work performed on a non-working day SHALL add to — and never subtract from — the weekly balance.

#### Scenario: No work on a non-working day is neutral
- **WHEN** a non-working day (e.g. a Saturday) has no working time
- **THEN** its norm is zero and its daily balance is zero — it neither increases nor decreases the balance

#### Scenario: Work on a non-working day is a pure credit
- **WHEN** the user works 3 hours on a non-working day
- **THEN** that day's balance is +3 hours (worked minus a zero norm) and the week's balance is 3 hours higher than had they not worked it

#### Scenario: A non-working day's balance is never negative
- **WHEN** any non-working day is computed
- **THEN** its daily balance is at least zero regardless of the daily norm configured for working days

#### Scenario: Changing which days are working days re-evaluates norms
- **WHEN** the working-days set is changed so a previously working weekday becomes non-working
- **THEN** that weekday's norm becomes zero and it can thereafter only credit the balance

