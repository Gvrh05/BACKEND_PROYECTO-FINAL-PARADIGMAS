## ADDED Requirements
### Requirement: Bounded frontend probe
Backend SHALL measure the configured frontend HTTP availability without overlapping requests, following redirects or exposing credentials in labels. No configured target SHALL disable the probe.
#### Scenario: Failure and recovery
- **WHEN** the frontend fails then returns 2xx
- **THEN** frontend_http_up changes from 0 to 1
### Requirement: Deployment evidence
The demonstration SHALL distinguish local OTLP reception from confirmed Grafana Cloud ingestion.
#### Scenario: Missing Cloud access
- **WHEN** no valid Cloud credentials are configured
- **THEN** remote acceptance remains pending rather than claiming success
