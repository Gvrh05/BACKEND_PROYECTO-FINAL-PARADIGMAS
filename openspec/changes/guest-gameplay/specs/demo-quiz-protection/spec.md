## ADDED Requirements
### Requirement: Immutable demo
The API SHALL reject quiz, question and image mutations for isDemo resources even for the MASTER owner.
#### Scenario: Owner deletes demo
- **WHEN** the owner attempts demo deletion
- **THEN** the API returns 403
#### Scenario: Normal quiz
- **WHEN** an owner deletes a normal quiz
- **THEN** deletion remains functional
