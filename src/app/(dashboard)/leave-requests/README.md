# Leave Requests / Passes

Leaving/returning datetimes + optional covering resident + reason/transport/companion/destination → pending pass.

- Approval chain per `workspace_settings.pass_approver`: manager-only, admin-only, or both (manager → admin).
- Printable pass at `/passes/[id]/print` (mobile-screenshot friendly).
- Solo-resident houses may submit without a cover.
- While out on approved leave, the resident's chores delegate to the coverer (see chores README).
