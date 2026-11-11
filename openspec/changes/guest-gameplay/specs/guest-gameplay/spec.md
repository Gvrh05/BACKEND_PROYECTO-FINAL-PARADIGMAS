## ADDED Requirements
### Requirement: Scoped guest identity
The API SHALL issue opaque credentials only in LOBBY for unique trimmed names of 1–80 characters. Credentials SHALL be hashed server-side and limited to a specific room instance and expiration.
#### Scenario: Reconnection
- **WHEN** a guest reconnects using its credential
- **THEN** identity and score are preserved without adding another player
#### Scenario: Cross-room or expired credential
- **WHEN** a credential is used outside its active room
- **THEN** the operation is rejected
### Requirement: Participant permissions
Guests SHALL only join their room and answer its current question. Administrative operations SHALL reject guest credentials.
#### Scenario: Guest starts game
- **WHEN** a guest emits start-session
- **THEN** the gateway rejects the operation
### Requirement: Safe public metadata
Public invitations SHALL expose only minimal room metadata and SHALL apply rate limits by IP and room.
#### Scenario: Anonymous metadata
- **WHEN** an invitation is requested without an account
- **THEN** metadata omits private accounts, quiz content and correct answers
