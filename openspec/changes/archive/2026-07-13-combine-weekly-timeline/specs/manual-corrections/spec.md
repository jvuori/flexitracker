## MODIFIED Requirements

### Requirement: Correction precedence and provenance
Corrections SHALL take precedence over the sensor-derived timeline for their span and SHALL be recorded with provenance so each derived period can be attributed to its source: sensor activity, automatic bridging, manual addition, or manual removal. When an `add_work` and a `remove_work` overlap the same span, the `add_work` SHALL win: that overlapping time counts as working time and is attributed to a manual addition, kept distinct from the surrounding sensor spans. A period the user re-includes therefore SHALL NOT be permanently defeated by an earlier removal.

#### Scenario: Manual removal overrides sensor
- **WHEN** a `remove_work` span overlaps sensor-observed activity
- **THEN** the overlapping period is excluded and attributed to a manual removal

#### Scenario: Manual removal overrides automatic bridging
- **WHEN** a `remove_work` span overlaps a period that was counted by automatic bridging
- **THEN** the overlapping period is excluded and attributed to a manual removal

#### Scenario: Manual addition overrides an earlier removal
- **WHEN** an `add_work` span overlaps a period previously excluded by a `remove_work`
- **THEN** the overlapping time counts as working time again, attributed to a manual addition and kept visually distinct from the surrounding sensor spans
