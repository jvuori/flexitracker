## ADDED Requirements

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
