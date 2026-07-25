## ADDED Requirements

### Requirement: Day computation exposes per-machine raw activity alongside the merged result
A computed day SHALL additionally expose, for each machine that contributed any event that day, that machine's own raw active intervals — paired independently per machine, clamped to the day, and filtered by the same minimum active span threshold as the merged composition, with no bridging, no office-hours gating, and no corrections applied. This per-machine breakdown SHALL be purely additive: it SHALL NOT alter the merged `Span`/`Period` composition, the day's working time, norm, or balance in any way, and SHALL be computed only from machines already included in the ledger being computed (per the existing role-filtered event input).

#### Scenario: Each contributing machine's raw activity is exposed
- **WHEN** a day is computed and two machines each had sensor-active periods that day
- **THEN** the day result exposes each machine's own active intervals independently, in addition to the existing merged spans/periods

#### Scenario: Per-machine activity is unaffected by corrections
- **WHEN** a correction (add_work, remove_work, or a move) changes the merged composition for a time range
- **THEN** the per-machine raw activity for that range is unchanged — it reflects only what sensors reported

#### Scenario: Per-machine activity respects the ledger's machine filter
- **WHEN** the personal ledger's day is computed
- **THEN** only personal-role machines' raw activity is exposed, matching the same machine set already used to compute the personal ledger's merged result

#### Scenario: A machine with no activity that day is not listed
- **WHEN** a machine belonging to the account had no events within a given day
- **THEN** that machine does not appear in that day's per-machine breakdown

#### Scenario: Provisional (still-growing) status is tracked per machine
- **WHEN** one machine is still actively reporting (its open span has not been closed or bounded) while another machine's activity that day has fully closed
- **THEN** the per-machine breakdown reflects provisional/growing status independently for each machine, not only for the merged result
