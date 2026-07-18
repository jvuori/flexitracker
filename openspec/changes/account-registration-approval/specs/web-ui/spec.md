## ADDED Requirements

### Requirement: Registration and pending-state experience
The web UI SHALL render according to the signed-in account's approval status rather than assuming full capability. A `pending` account that has not yet requested access SHALL be shown a *Request access* form (with an optional note); after submitting, and while awaiting a decision, it SHALL be shown a "waiting for approval" state. A `rejected` or `disabled` account SHALL be shown the corresponding state message. Only an `active` account SHALL render the full application (week view, machines, settings, admin).

#### Scenario: New user sees the request form
- **WHEN** a `pending` user who has not requested access opens the app
- **THEN** they see a *Request access* form instead of the app, and submitting it shows an on-screen confirmation

#### Scenario: Awaiting approval
- **WHEN** a `pending` user who has already requested access opens the app
- **THEN** they see a "waiting for approval" message and no user data

#### Scenario: Rejected or disabled state
- **WHEN** a `rejected` or `disabled` user opens the app
- **THEN** they see the corresponding state message and no user data or machine controls

#### Scenario: Active user sees the app
- **WHEN** an `active` user opens the app
- **THEN** the full application is rendered as before
