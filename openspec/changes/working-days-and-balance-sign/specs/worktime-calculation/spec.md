## ADDED Requirements

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
