# mobile-workshop-list Specification

## Purpose
TBD - created by archiving change mobile-screens-wiring. Update Purpose after archive.
## Requirements
### Requirement: Home screen displays staff's assigned workshops
The home screen SHALL read `allowed_workshop_ids` from the JWT payload via `offlineAuth.getAllowedWorkshops()` and display each assigned workshop. For each workshop ID, the app MUST fetch workshop details (name, date, status) from `GET /workshops/:id`.

#### Scenario: Staff has assigned workshops
- **WHEN** staff views the home screen with a valid JWT containing `allowed_workshop_ids`
- **THEN** the screen shows a list of workshop cards with name, date, and status for each assigned workshop

#### Scenario: Loading state while fetching workshop details
- **WHEN** the home screen is fetching workshop details from the catalog API
- **THEN** loading placeholders are shown while data is in-flight

#### Scenario: Workshop detail fetch fails
- **WHEN** one or more workshop detail requests fail (network error or 404)
- **THEN** the screen shows an error state with a retry option

#### Scenario: Staff has no assigned workshops
- **WHEN** the JWT `allowed_workshop_ids` array is empty
- **THEN** the screen shows an empty state message indicating no workshops are assigned

### Requirement: Home screen triggers preload on workshop tap
When staff taps a workshop card, the app SHALL navigate to the workshop dashboard and trigger `usePreload` to download active tickets to SQLite for offline use.

#### Scenario: Staff taps a workshop card
- **WHEN** staff taps a workshop card on the home screen
- **THEN** the app navigates to `/workshop/:id` and `usePreload(workshopId)` is invoked

