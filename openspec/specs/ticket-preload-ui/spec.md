## ADDED Requirements

### Requirement: Staff can pre-load tickets from the workshop dashboard
The workshop dashboard SHALL provide a "Tải danh sách vé" button that triggers `usePreload` to fetch all active registrations for the workshop and store them in `cached_registrations` SQLite. The button SHALL show a loading indicator while in progress and display an error message on failure. Cache metadata SHALL be refreshed after preload completes so `CacheStatusBadge` reflects the updated state.

#### Scenario: Successful pre-load
- **WHEN** staff taps "Tải danh sách vé" while online
- **THEN** the app fetches all active registrations, stores them in SQLite, updates `cache_metadata.is_fully_loaded = 1`, and the `CacheStatusBadge` updates to show FRESH status

#### Scenario: Pre-load fails due to network error
- **WHEN** staff taps "Tải danh sách vé" but the request fails
- **THEN** the button returns to idle state and an error message is displayed

#### Scenario: Pre-load button shows loading state
- **WHEN** pre-load is in progress
- **THEN** the button is disabled and shows a loading indicator

### Requirement: Scanner button is gated on cache state when offline
The workshop dashboard SHALL disable the "Mở máy quét QR" button when `cache_metadata.is_fully_loaded` is not 1, unless the device is online. A descriptive tooltip text SHALL explain why the button is disabled.

#### Scenario: Scanner enabled when cache is fully loaded
- **WHEN** `cache_metadata.is_fully_loaded = 1` for the current workshop
- **THEN** the scanner button is enabled regardless of network state

#### Scenario: Scanner disabled when cache is empty and offline
- **WHEN** `cache_metadata` does not exist or `is_fully_loaded = 0` for the current workshop
- **THEN** the scanner button is disabled with label indicating pre-load is required
