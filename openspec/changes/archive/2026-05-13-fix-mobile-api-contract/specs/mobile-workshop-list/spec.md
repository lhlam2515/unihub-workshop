## MODIFIED Requirements

### Requirement: Home screen displays staff's assigned workshops
The home screen SHALL read `allowed_workshop_ids` from the JWT payload via `offlineAuth.getAllowedWorkshops()` and display each assigned workshop. For each workshop ID, the app MUST fetch workshop details from `GET /workshops/:id`. The response shape MUST be treated as the server `WorkshopDetailDto`: workshop ID is in the `id` field, seat count is in `seatsAvailable`, speaker details are in a nested `speaker` object, and room details are in a nested `room` object.

#### Scenario: Staff has assigned workshops
- **WHEN** staff views the home screen with a valid JWT containing `allowed_workshop_ids`
- **THEN** the screen shows a list of workshop cards with name, date, status, speaker name, and room name for each assigned workshop

#### Scenario: Loading state while fetching workshop details
- **WHEN** the home screen is fetching workshop details from the catalog API
- **THEN** loading placeholders are shown while data is in-flight

#### Scenario: Workshop detail fetch fails
- **WHEN** one or more workshop detail requests fail (network error or 404)
- **THEN** the screen shows an error state with a retry option

#### Scenario: Staff has no assigned workshops
- **WHEN** the JWT `allowed_workshop_ids` array is empty
- **THEN** the screen shows an empty state message indicating no workshops are assigned

#### Scenario: Workshop response fields are correctly mapped
- **WHEN** `GET /workshops/:id` returns a workshop detail response
- **THEN** the mobile app reads `response.id` for the workshop identifier, `response.seatsAvailable` for seat count, `response.speaker.name` for speaker name, and `response.room.name` for room name

### Requirement: Home screen triggers preload on workshop tap
When staff taps a workshop card, the app SHALL navigate to the workshop dashboard and trigger `usePreload` to download active tickets to SQLite for offline use.

#### Scenario: Staff taps a workshop card
- **WHEN** staff taps a workshop card on the home screen
- **THEN** the app navigates to `/workshop/:id` using the workshop's `id` field and `usePreload(id)` is invoked
