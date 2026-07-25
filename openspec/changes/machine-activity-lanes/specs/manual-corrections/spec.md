## MODIFIED Requirements

### Requirement: Move a period to the other ledger
A user SHALL be able to move a selection — an exact merged period, a raw per-machine activity segment, or a manually-entered range — from the ledger currently being viewed to the other ledger, as a single action. This SHALL be implemented as a `remove_work` correction on the current ledger paired with an `add_work` correction on the other ledger, over the same span, both created atomically, EXCEPT when the selection is an exact `manual_added` period, where a plain `remove_work` would be a complete no-op against its own covering `add_work` (per correction precedence) — that case SHALL instead delete the covering correction(s) and create the equivalent `add_work` on the other ledger, so the move is complete rather than silently inert. This is distinct from — and SHALL NOT replace — the ability to exclude a period from the current ledger without moving it anywhere (a bogus reading, or activity by someone else on that machine, which SHALL count in neither ledger).

A selection that is not an exact merged period (a raw per-machine segment, or a manually-entered range) carries no correction identity, so Move SHALL be offered for it only per the overlap rule in "Action availability for a selection without correction identity" — it SHALL NOT attempt the complete delete-and-recreate handling reserved for an exact `manual_added` period selection, and a selection that only partially overlaps an existing manual addition SHALL move only its `sensor`/`auto_bridged` portion, leaving the manual addition's remainder in place.

#### Scenario: Move personal-machine activity into work
- **WHEN** the user is viewing the personal ledger and moves a selected period to the other side
- **THEN** the period is excluded from the personal ledger and an equivalent `add_work` correction makes it count in the work ledger

#### Scenario: Move work-machine activity into personal
- **WHEN** the user is viewing the work ledger and moves a selected period to the other side
- **THEN** the period is excluded from the work ledger and an equivalent `add_work` correction makes it count in the personal ledger

#### Scenario: Move works regardless of which machine produced the underlying activity
- **WHEN** a period is moved to the other ledger and the underlying sensor evidence came from a machine whose role does not match the destination ledger
- **THEN** the move still succeeds — moving a period reclassifies how the time is tracked, not which physical machine recorded it

#### Scenario: Exclude remains available as a distinct action from move
- **WHEN** the user selects a period and chooses to exclude it rather than move it
- **THEN** the period is excluded from the current ledger only and does not appear in the other ledger

#### Scenario: A range already present in the destination ledger is not double-counted
- **WHEN** a moved range overlaps time that already counted in the destination ledger (e.g. from a different machine's own activity)
- **THEN** the destination ledger's total reflects that range once, not twice

#### Scenario: Moving an exact manual addition is complete
- **WHEN** the user selects the exact period produced by an `add_work` correction and chooses Move to other side
- **THEN** the covering correction is deleted and an equivalent `add_work` is created on the other ledger, so none of the selected time is left behind

#### Scenario: Moving a raw or freehand selection that partially overlaps a manual addition moves only the movable portion
- **WHEN** the user selects a raw per-machine segment or a manually-entered range that partially overlaps an existing `add_work`-produced period and partially overlaps sensor or auto-bridged time, and chooses Move to other side
- **THEN** only the sensor/auto-bridged portion moves to the other ledger; the manual addition's portion is unaffected and remains in the current ledger

## ADDED Requirements

### Requirement: Action availability for a selection without correction identity
When the current selection is not an exact merged period — a raw per-machine activity segment, or a manually-entered range — the system SHALL determine which of Count as work, Exclude, and Move to other side are available by checking the selection's overlap against the current merged partition, rather than by any known correction identity (since none exists for such a selection): Count as work SHALL be available when the selection overlaps a `gap`, `review`, or `removed` period; Exclude and Move to other side SHALL be available when the selection overlaps a `sensor` or `auto_bridged` period. Neither Exclude nor Move to other side SHALL be offered on the basis of overlapping a `manual_added` period alone, since a plain `remove_work` correction has no effect there. Undo and Restore SHALL NOT be offered for such a selection, since both require a known correction id.

#### Scenario: Count offered only where the merged view has nothing counted
- **WHEN** a raw-lane segment or manually-entered range is selected and it overlaps only gap, reviewable, or removed merged time
- **THEN** Count as work is available and Exclude/Move are not

#### Scenario: Exclude and Move offered where the merged view has directly-counted time
- **WHEN** a raw-lane segment or manually-entered range is selected and it overlaps sensor or auto-bridged merged time
- **THEN** Exclude and Move to other side are both available

#### Scenario: Neither Exclude nor Move offered against manual-addition-only overlap
- **WHEN** a raw-lane segment or manually-entered range is selected and it overlaps only a manual_added period, with no sensor or auto-bridged time in range
- **THEN** neither Exclude nor Move to other side is offered, since a plain remove_work would have no effect

#### Scenario: A mixed selection offers Exclude and Move based on its movable portion
- **WHEN** a raw-lane segment or manually-entered range partially overlaps sensor time and partially overlaps a manual_added period
- **THEN** Exclude and Move to other side are available, and acting on them affects only the sensor-derived portion of the selection
