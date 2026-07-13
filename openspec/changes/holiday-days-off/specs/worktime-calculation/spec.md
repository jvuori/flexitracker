## ADDED Requirements

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
