## ADDED Requirements

### Requirement: Day and week computation is ledger-scoped by machine role
Every requirement in this capability describing bridging, office-hours gating, lunch deduction, norms, working-day/holiday treatment, and balance SHALL apply to the **work ledger**. Computing a ledger's day or week SHALL restrict its input events to the machines whose current role matches that ledger (work-role machines for the work ledger, personal-role machines for the personal ledger), plus any correction recorded against that ledger. A machine active in the same window as a machine of the other role SHALL contribute independently to each ledger's own computation — the two ledgers SHALL NOT be unioned together.

#### Scenario: Work ledger uses only work-role machines
- **WHEN** the work ledger's week is computed
- **THEN** only events from machines currently marked `work`, plus work-ledger corrections, feed the computation

#### Scenario: Personal ledger uses only personal-role machines
- **WHEN** the personal ledger's week is computed
- **THEN** only events from machines currently marked `personal`, plus personal-ledger corrections, feed the computation

#### Scenario: Simultaneous work and personal machine activity does not merge
- **WHEN** a work-role machine and a personal-role machine are both active in the same time window
- **THEN** the work ledger counts the work-role machine's activity and the personal ledger independently counts the personal-role machine's activity, neither suppressing nor combining with the other

### Requirement: Personal ledger is a reduced composition
The personal ledger's day computation SHALL compose activity from exactly two sources: direct sensor activity (active spans at or above the configured minimum active span) and personal-ledger corrections (`add_work`/`remove_work`, including periods moved in via the other ledger's "move to other side" action). It SHALL NOT apply gap bridging, office-hours gating, lunch deduction, a daily or weekly norm, or any working-day/holiday distinction — every day is computed identically regardless of its weekday or holiday status. A personal-ledger day SHALL still expose a complete, gap-free partition of typed periods (measured, manual addition, manual removal, plain gap) on the same basis as the work ledger's partition, minus the auto-bridged and reviewable period types that only exist under office-hours gating.

#### Scenario: No bridging in personal mode
- **WHEN** the personal ledger has two sensor-active spans separated by a gap
- **THEN** the gap is not bridged into personal activity regardless of its length or time of day

#### Scenario: No lunch deduction in personal mode
- **WHEN** the personal ledger's gross activity for a day exceeds the work ledger's lunch threshold
- **THEN** no lunch deduction is applied to the personal ledger's total

#### Scenario: No norm or balance in personal mode
- **WHEN** the personal ledger's day or week is computed
- **THEN** it reports total activity time only, with no norm and no balance figure

#### Scenario: Weekends are not special in personal mode
- **WHEN** the personal ledger's week includes a non-working weekday
- **THEN** that day's personal activity is computed the same way as any other day, with no credit-only or non-working distinction

#### Scenario: Moved-in time counts as personal activity
- **WHEN** a range is moved from the work ledger to the personal ledger
- **THEN** the personal ledger's partition shows that range as a manual addition and its total includes it, using the noise-floor threshold and no bridging
