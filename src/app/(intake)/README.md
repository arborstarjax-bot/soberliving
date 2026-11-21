# Intake

- `intake/` — multi-step wizard (personal → vehicle → employment → contacts → recovery → legal → signature → document vault upload). Draft saves via `saveIntakeProgress`.
- `quick-signup/` — abbreviated intake for existing-tenant activations.
- `checklist/` — legacy resident-facing checklist (superseded by the staff-side checklist on intake-review).
- Intake mode (`intake_mode` in workspace_settings): `auto_entry` vs `requires_signoff` → decides whether a completing resident activates immediately or queues on /intake-review.
- Required vault docs (`requires_intake_ack`) render as signable steps; `document_acknowledgments` records signature + timestamp.
