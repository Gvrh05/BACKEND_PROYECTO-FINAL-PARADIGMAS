## ADDED Requirements
### Requirement: Conservative demo imagery
The internal demo seed SHALL include ten local original illustrations and backfill only missing demo image associations using exact question text matches.
#### Scenario: Existing demo without images
- **WHEN** the seed runs with valid bundled images
- **THEN** it adds missing associations without changing questions, options or IDs
#### Scenario: Existing image
- **WHEN** a question already has image metadata or its destination file exists
- **THEN** the seed preserves that association and file
#### Scenario: Repeated seed
- **WHEN** the seed runs again
- **THEN** no questions or images are duplicated and the demo remains immutable through HTTP
