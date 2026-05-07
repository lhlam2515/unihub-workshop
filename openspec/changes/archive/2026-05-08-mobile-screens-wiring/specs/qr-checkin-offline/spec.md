## ADDED Requirements

### Requirement: QR scanner screen uses device camera for real scans
The QR scanner screen (`/workshop/:id/scan`) SHALL use `expo-camera` to display a live camera viewfinder and detect QR codes in real time. When a QR code is detected, the screen MUST call `useScan(qrToken, workshopId)` and navigate to the result screen. The scan is debounced to prevent double-processing of the same code.

#### Scenario: Camera permission granted and QR code detected
- **WHEN** staff grants camera permission and points the camera at a valid QR code
- **THEN** the QR token is extracted and `useScan` is invoked with the token and current workshop ID

#### Scenario: Camera permission denied
- **WHEN** staff denies camera permission
- **THEN** the screen displays a fallback message explaining that camera access is required and a button to open device settings

#### Scenario: Same QR code scanned twice in quick succession
- **WHEN** the camera detects the same QR code within 2 seconds of the previous scan
- **THEN** the duplicate scan is ignored and `useScan` is only called once

#### Scenario: Offline scan result stored in SQLite
- **WHEN** `useScan` detects no network connectivity and falls through to the offline path
- **THEN** the check-in is written to the local `checkinQueue` with `syncStatus = PENDING` and the result screen shows `source = offline`
