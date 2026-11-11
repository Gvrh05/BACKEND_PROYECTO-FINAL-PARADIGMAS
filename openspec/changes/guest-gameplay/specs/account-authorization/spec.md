## ADDED Requirements
### Requirement: Current account verification
Protected REST operations and account WS events SHALL validate HS256 signature, audience, required expiry, account purpose, UUID subject and MASTER/PROFESOR role, and validate activity and credential version online with Auth.
#### Scenario: Auth unavailable
- **WHEN** Auth cannot validate the session
- **THEN** REST responds 503 without accepting stale credentials
### Requirement: Ownership remains mandatory
MASTER account administration SHALL NOT grant access to other professors' private quizzes, rooms or results.
#### Scenario: Foreign content
- **WHEN** MASTER requests another professor's private quiz
- **THEN** the resource is not disclosed
