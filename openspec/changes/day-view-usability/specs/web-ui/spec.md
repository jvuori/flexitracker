## ADDED Requirements

### Requirement: Day receipt explains the day's worked time
The expanded day lane SHALL open with a receipt that derives the day's worked time from its own components, showing for each additive source of the current ledger — direct sensor activity, automatic bridging (work ledger only), and manual additions — a swatch identical to the one used on the timeline, its name, and its total duration, followed by the day's gross time, the lunch deduction (work ledger only), and the resulting worked time. A component contributing no time SHALL still render its row, with a placeholder in place of a duration, so the receipt's shape does not vary between days.

The receipt SHALL carry the definition of every timeline swatch it displays. The expanded lane SHALL NOT render a separate legend.

When the current ledger's day contains time that was not counted because it lies inside the office-hours window and reached the private-leave threshold, the receipt SHALL be followed by a single statement of that time — its duration, its clock range, and the threshold that excluded it — phrased as an explanation of the computed result. That statement SHALL NOT be phrased as a question, SHALL NOT offer an action of its own, and SHALL NOT be accompanied by a badge, count, or other attention marker anywhere in the week view. The threshold named in the statement SHALL link to the setting that governs it.

#### Scenario: Receipt sums to the day's worked time
- **WHEN** the user expands a day in the work ledger
- **THEN** the receipt shows the measured, auto-bridged, and manually-added totals, then gross, then the lunch deduction, then worked time, and the component totals sum to the gross time the day reports

#### Scenario: Receipt defines the timeline's swatches
- **WHEN** the expanded lane is rendered
- **THEN** each receipt row shows the same swatch used for that source on the timeline, and no separate legend is rendered

#### Scenario: Zero component keeps its row
- **WHEN** a day has no manually-added time
- **THEN** the receipt still shows the manual-addition row, with a placeholder instead of a duration

#### Scenario: Uncounted in-hours time is explained, not queried
- **WHEN** a day contains an in-hours gap that reached the private-leave threshold and was therefore not counted
- **THEN** a single statement below the receipt gives its duration, clock range, and the threshold that excluded it, without posing a question or offering an action, and no badge or count appears on the day's collapsed lane

#### Scenario: Threshold links to its setting
- **WHEN** that statement names the private-leave threshold
- **THEN** the named threshold links to the Settings control that governs it

#### Scenario: Receipt in personal mode omits work-only components
- **WHEN** the user expands a day while viewing the personal ledger
- **THEN** the receipt shows only measured and manually-added components and the resulting total, with no auto-bridging row and no lunch row

### Requirement: Office-hours window shown on every timeline
While the work ledger is selected, every timeline track — the merged day lane, whether collapsed or expanded, and every raw per-machine lane — SHALL render the account's configured office-hours window as a background band on the same 0–24h scale as its segments and ruler, so the regime that governs gap bridging is visible without opening anything. The band SHALL be rendered such that it cannot be positioned independently of the segments drawn on the same track. The band SHALL remain legible in both light and dark themes and SHALL NOT obscure segments, tick marks, or the selected-period indication.

The band SHALL NOT be rendered while the personal ledger is selected, consistent with personal mode suppressing work-only chrome: the personal ledger applies no office-hours gating, so a band there would imply a rule that does not run.

#### Scenario: Band shown on collapsed and expanded lanes
- **WHEN** the week view is rendered
- **THEN** each day's timeline shows the office-hours window as a background band, both while the lane is collapsed and while it is expanded

#### Scenario: Band shown on raw per-machine lanes
- **WHEN** the user opens the raw per-machine lanes for a day
- **THEN** each raw lane carries the same office-hours band, on the same scale as the merged lane

#### Scenario: Band aligns with the segments on its own track
- **WHEN** the office-hours window starts at 08:00
- **THEN** the band's leading edge coincides with the position a segment starting at 08:00 occupies on that same track

#### Scenario: Band follows the setting
- **WHEN** the user changes the office-hours range in Settings
- **THEN** the band on every timeline reflects the new range on next view

#### Scenario: No band in personal mode
- **WHEN** the personal ledger is selected
- **THEN** no office-hours band is rendered on any timeline

### Requirement: Reportable value on the day lane
A day's lane SHALL show, alongside its exact working time, that day's working time rounded to the nearest half hour and expressed in decimal hours carrying its unit. Because the user transcribes a day at a time, the reportable value SHALL sit on the day's own row rather than in a separate week-level surface requiring the user to cross-reference it against the lanes.

The reportable value SHALL be visually subordinate to the exact working time and SHALL be rendered in a different unit format from it, so the two are never read as competing statements of the same quantity. It SHALL additionally carry an explicit approximation marker, so that it reads as an inexact figure and does not invite arithmetic against the exact figures beside it. Its purpose — that this is the value to transcribe — SHALL be available through its accessible name rather than occupying row space on every lane, since that text repeats on every day while only the value varies. The exact working time SHALL remain the lane's dominant figure and the sole basis of the day's balance. The reportable value SHALL be shown only on a day that has working time, and only in the work ledger.

#### Scenario: Reportable value on a worked day
- **WHEN** a day in the work ledger has 7h 46m of working time
- **THEN** its lane shows `7h 46m` as its dominant figure and a subordinate `~8.0h`, marked as approximate and carrying its unit

#### Scenario: Purpose is available without occupying the lane
- **WHEN** a user inspects the reportable value by pointer or with a screen reader
- **THEN** its accessible name states that this is the value to report, in hours

#### Scenario: Reportable value absent on an empty day
- **WHEN** a day has no working time
- **THEN** its lane shows no reportable value

#### Scenario: No reportable value in personal mode
- **WHEN** the personal ledger is selected
- **THEN** no lane shows a reportable value, since there is nothing to transcribe

#### Scenario: Balance still derives from the exact value
- **WHEN** a day shows both an exact working time and a reportable value
- **THEN** the day's balance is the exact working time minus the day's norm, and is not derived from the reportable value

## MODIFIED Requirements

### Requirement: Week view as default
The default view SHALL present one ISO week (Monday–Sunday) with per-day working time, per-day balance, and the weekly total against the weekly norm, and SHALL allow navigating between weeks. Each day SHALL be rendered as an inline lane on the week page that combines, on one row, the day label, the day's full 0–24h timeline, and the day's numbers (exact working time, the reportable rounded value, and the daily balance). Every figure that stands in an arithmetic relationship to another figure on screen SHALL be exact — a day's working time, its norm, its lunch deduction, its balance, and every weekly total — so that no two figures a user can compare are derived on different bases. The reportable rounded value is the sole exception and is exempt precisely because it enters no such relationship: it is an output, not a term. A weekly summary SHALL be shown above the lanes reporting worked time, weekly norm, lunch deducted, and weekly balance, all exact. The week view SHALL offer a single mode toggle between the **work** ledger and the **personal** ledger; the mode applies to the whole week view (lanes, summary, and edit actions) until changed, and SHALL default to the work ledger. Switching modes SHALL NOT navigate to a different screen or change the selected week.

#### Scenario: Navigate weeks
- **WHEN** the user moves to the previous or next week
- **THEN** that week's per-day and total figures are shown with no carryover between weeks

#### Scenario: Day timeline and numbers shown together
- **WHEN** the week view is rendered
- **THEN** each day shows its timeline and its per-day numbers together in one lane, without navigating to a separate screen

#### Scenario: Weekly summary present
- **WHEN** the work ledger is shown
- **THEN** a summary shows the week's total worked time, weekly norm, lunch deducted, and weekly balance, each as an exact value

#### Scenario: Day figures reconcile with each other
- **WHEN** a day has 7h 46m of working time against a 7h 30m norm
- **THEN** its lane shows `7h 46m` and a `+16m` balance, and the difference between the displayed working time and the norm equals the displayed balance

#### Scenario: Days sum to the week
- **WHEN** the week view is rendered
- **THEN** the working times shown on the day lanes sum to the worked total shown in the weekly summary

#### Scenario: Mode toggle switches the whole view
- **WHEN** the user switches the mode toggle from work to personal
- **THEN** every lane, the summary, and the available edit actions update to reflect the personal ledger for the same week

#### Scenario: Work is the default mode
- **WHEN** the week view is opened
- **THEN** it shows the work ledger unless the user has already switched modes in this session

### Requirement: Per-day lunch deduction visible
When a day has a lunch deduction applied, the deducted amount SHALL be visible in that day's expanded detail, so the user can see why the day's worked time is below its gross time. It SHALL be shown as a line of the day's receipt, between the gross and worked figures, so the deduction reads as a step in the arithmetic rather than as a detached figure. A day with no lunch deduction SHALL NOT show a lunch line.

The deduction SHALL NOT occupy a slot on the collapsed lane. The collapsed lane shows neither gross nor worked-before-lunch, so the comparison this requirement exists to explain is only meaningful once the day is expanded — where the receipt states it in full. The lunch amount and the day-length threshold that triggers it remain the existing configurable settings; this requirement only concerns surfacing the per-day result.

#### Scenario: Day with lunch shows the deduction in its receipt
- **WHEN** a day's gross working time exceeds the lunch threshold and a lunch deduction is applied, and the user expands that day
- **THEN** the receipt shows the deducted lunch amount between the gross and worked figures

#### Scenario: Day without lunch shows none
- **WHEN** a day's gross working time is at or below the lunch threshold and no lunch is deducted
- **THEN** no lunch line is shown in that day's receipt

#### Scenario: Collapsed lane carries no lunch figure
- **WHEN** the week view is rendered and a day with a lunch deduction is collapsed
- **THEN** its lane shows no lunch figure, the slot carrying the day's reportable value instead

### Requirement: Day timeline with edit mode
Each day's lane SHALL show its timeline of the currently-viewed ledger's activity on the shared 0–24h scale with corrections overlaid and visually distinguished. In the work ledger, the timeline SHALL also show raw idle/off-computer periods as a distinct layer even when they have been auto-bridged into working time, so no counted period hides an underlying gap; time excluded by a `remove_work` correction SHALL be rendered as a distinct "excluded" band rather than hidden as a plain gap. Selecting a day SHALL expand its lane in place to reveal edit controls; there SHALL be no separate day-detail screen. The collapsed week view SHALL be unaffected by anything below — it SHALL continue to show exactly one merged lane per day.

The timeline SHALL distinguish periods on two orthogonal channels rather than assigning an unrelated treatment per type: whether the period **counts** toward the current ledger's total, and whether the **user asserted** it. It SHALL therefore render **five** treatments — counted measured activity, counted time the rules inferred, counted time the user added, time that does not count, and time that does not count because the user excluded it — encoded so that the counting channel and the user-asserted channel are each readable on their own. Counted measured activity and counted inferred time SHALL remain distinguishable from one another, so that no counted period hides the underlying idle it was bridged over.

A `review` period SHALL be rendered identically to a plain idle gap and SHALL carry the same label, since the office-hours band already conveys that it lies inside the window and the counting channel already conveys that it was not counted. This is the only reduction: it takes the six per-type treatments to five. `review` SHALL remain a distinct type in the computed partition and in the API — this requirement constrains rendering and labelling only.

The expanded lane SHALL be composed in the order: the day's receipt, the day's periods, then collapsed secondary surfaces. **Raw per-machine lanes SHALL be presented within a collapsed disclosure, closed by default**, regardless of how many machines contributed; opening it SHALL reveal one raw activity lane per machine that contributed any event that day, on the same 0–24h scale. A raw lane SHALL show only that machine's own sensor-active intervals (per the worktime-calculation per-machine activity result) — no bridging, no office-hours gating of its segments, no correction overlay — and SHALL NOT change appearance based on any correction, since corrections apply to the merged ledger only.

**Every segment on every lane SHALL be a selectable object** — counted, excluded, and plain idle periods alike on the merged lane; active and idle segments on any raw per-machine lane — such that activating any point on any lane selects the object covering that point, including selecting a plain gap by activating the visually empty track over it. The merged lane SHALL provide a mirrored list of its periods offering the same selection, so selection is operable by pointer, touch, and keyboard. A selected segment SHALL be indicated without any part of the indication being clipped by its track, at every track height.

Selecting an object SHALL reveal its actions **inline at the selected period's row in the mirrored list**, not as a separately-mounted strip and not as a floating overlay; selecting from the timeline SHALL reveal the same inline controls at the corresponding row. No action surface SHALL be mounted while nothing is selected.

The actions SHALL be presented as a **single three-position classifier of what the time was — work, personal, or neither** — rather than as separate verbs for excluding, moving, counting, undoing, and restoring. The classifier SHALL indicate the selection's current position, which SHALL NOT be actionable. Choosing a position SHALL bring about that end state using the underlying corrections, whether that requires creating a correction or deleting one:

- A counted sensor or auto-bridged period moved to the other ledger SHALL be transferred by the paired remove/add correction; moved to *neither*, it SHALL be excluded from the current ledger only.
- A counted manually-added period moved to *neither* SHALL have its `add_work` deleted; moved to the other ledger, it SHALL have its `add_work` deleted and an `add_work` created on the other ledger.
- A non-counting period assigned to either ledger SHALL be covered by an `add_work` on that ledger, except that a period excluded by the user's own `remove_work` and reassigned to the ledger it was excluded from SHALL instead have that `remove_work` deleted.

Correction boundaries SHALL be taken from the selection's own start and end, not typed by the user. When the selection is a raw per-machine segment or a manually-entered range — selections carrying no correction identity — the available positions SHALL be determined by the manual-corrections overlap rule for such selections.

The expanded lane SHALL present its day-scope actions together at the head of the period list, separated from the per-period classifier: a primary **Mark whole day as work** action (work ledger only, per the manual-corrections fill requirement) and the holiday marker. It SHALL retain a manual exact-times control as a collapsed secondary path for a boundary no existing period or raw segment offers, itself scoped to the ledger currently being viewed and offering the same three-position classifier rather than its own separate verbs.

Every period type, action, and receipt row SHALL use one vocabulary across the timeline, the period list, the receipt, and the exact-times control; no single underlying operation SHALL be presented under two different names on different surfaces.

#### Scenario: Edit controls expand in place
- **WHEN** the user selects a day in the week view
- **THEN** that day's lane expands in place to reveal its edit controls, and the user is not navigated to a separate day screen

#### Scenario: Panel opens with the receipt
- **WHEN** the user expands a day
- **THEN** the receipt is the first content in the expanded lane, ahead of the day's periods and ahead of any collapsed secondary surface

#### Scenario: Raw per-machine lanes are collapsed by default
- **WHEN** the user expands a day, whether one machine or several contributed activity that day
- **THEN** the raw per-machine lanes are not shown until the user opens their disclosure, and opening it shows one raw lane per contributing machine on the same 0–24h scale as the merged lane

#### Scenario: Raw lanes never change based on corrections
- **WHEN** a correction changes the merged lane's rendering for a time range
- **THEN** the raw per-machine lanes for that range are unaffected — they continue to show only actual sensor activity

#### Scenario: Counted measured and counted inferred stay distinguishable
- **WHEN** a day contains measured activity and an in-hours gap that was auto-bridged into working time
- **THEN** both read as counted, and the auto-bridged period remains visually distinguishable from the measured activity, so the idle it was bridged over is not hidden

#### Scenario: The user's own assertions are visible on the timeline
- **WHEN** a day contains a period the user added and a period the user excluded
- **THEN** each is marked on the timeline as user-asserted, distinguishably from periods the rules produced, so the user can see and reverse their own edits

#### Scenario: Reviewable and plain idle time render alike
- **WHEN** a day contains an in-hours gap that reached the private-leave threshold and an out-of-hours idle gap
- **THEN** both are rendered with the same not-counted treatment and carry the same label, distinguished only by the office-hours band behind them

#### Scenario: Excluded time stays distinct from idle time
- **WHEN** a day contains time excluded by the user's own `remove_work` correction
- **THEN** it is rendered distinctly from plain idle time, so the user can see and reverse their own edit

#### Scenario: Any period is selectable
- **WHEN** the user activates a point on an expanded day's merged lane
- **THEN** the period covering that point is selected and shown as selected on both the timeline and the mirrored period list

#### Scenario: A raw-lane segment is selectable
- **WHEN** the user activates a point on a raw per-machine lane
- **THEN** that machine's segment (active or idle) covering that point is selected and its classifier appears

#### Scenario: Plain gap selected from empty track
- **WHEN** the user activates the visually empty track between two periods on the merged lane
- **THEN** the plain idle gap under that point is selected and offers assignment to either ledger

#### Scenario: Selection indication is never clipped
- **WHEN** a segment is selected on a raw per-machine lane, whose track is shorter than the merged lane's
- **THEN** its selection indication is fully visible, with no part cut off by the track's bounds

#### Scenario: No action surface while nothing is selected
- **WHEN** a day is expanded and no period has been selected
- **THEN** no action strip, classifier, or placeholder for them is rendered

#### Scenario: Actions appear at the selected row
- **WHEN** the user selects a period from the timeline
- **THEN** the classifier appears inline at that period's row in the mirrored list, and not as a separate surface elsewhere in the panel

#### Scenario: Classifier shows the current position
- **WHEN** a counted period is selected while viewing the work ledger
- **THEN** the classifier shows work as its current position, and that position is not actionable

#### Scenario: Classify counted time as personal
- **WHEN** the user selects a measured or auto-bridged period in the work ledger and classifies it as personal
- **THEN** the period stops counting in the work ledger and starts counting in the personal ledger, attributed there to a manual addition

#### Scenario: Classify counted time as neither
- **WHEN** the user selects a measured or auto-bridged period and classifies it as neither
- **THEN** a `remove_work` correction on the current ledger excludes that period, the underlying activity remains visible, that ledger's working time decreases accordingly, and the period does not appear in the other ledger

#### Scenario: Classifying a manual addition as neither deletes it
- **WHEN** the user selects a manually-added period and classifies it as neither
- **THEN** the underlying `add_work` correction is deleted and the day re-renders as if it had never been added

#### Scenario: Classifying an excluded period back to its own ledger restores it
- **WHEN** the user selects a period they previously excluded and classifies it as the ledger it was excluded from
- **THEN** the underlying `remove_work` correction is deleted and the period counts as working time again in that ledger

#### Scenario: Classify a gap as the other ledger without switching modes
- **WHEN** the user selects an uncounted gap while viewing the work ledger and classifies it as personal
- **THEN** an `add_work` correction on the personal ledger makes that period count as personal activity, without the user leaving the work ledger and without affecting the work ledger's total

#### Scenario: Correction uses the selection's own boundaries
- **WHEN** the user classifies a selection
- **THEN** the correction(s) are created or deleted over that selection's own start and end without the user entering any time, and the day re-renders

#### Scenario: Classifier for a raw-lane or freehand selection is overlap-gated
- **WHEN** a raw-lane segment or a manually-entered range is selected
- **THEN** the classifier offers the positions permitted by the manual-corrections overlap rule for selections without correction identity

#### Scenario: Day-scope actions are separated from per-period actions
- **WHEN** a day is expanded
- **THEN** "Mark whole day as work" and the holiday marker appear together at the head of the period list, distinct from the classifier that acts on a selected period

#### Scenario: Mark whole day as work
- **WHEN** the user chooses "Mark whole day as work" on a day with presence overlapping the office window, while viewing the work ledger
- **THEN** the gaps of the office day are filled with a work-ledger `add_work` so the working day reads as continuous, without filling pre-work or evening gaps and without removing existing exclusions

#### Scenario: Exact-times control uses the same classifier
- **WHEN** the user opens the collapsed exact-times control and enters a range
- **THEN** it offers the same three-position classifier as a selected period, gated by the same overlap rule, and does not present a differently-named action for an operation available elsewhere under another name

#### Scenario: One vocabulary across surfaces
- **WHEN** the same underlying operation is reachable from the period list and from the exact-times control
- **THEN** it is labelled identically on both

#### Scenario: Corrections visually distinct
- **WHEN** a day contains both sensor spans and corrections
- **THEN** the corrections are rendered so they are distinguishable from sensor-derived spans
