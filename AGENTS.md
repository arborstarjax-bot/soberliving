<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Docs for AI agents

- `ARCHITECTURE.md` — stack, modules, data model, auth/roles, crons, testing.
- `docs/CONVENTIONS.md` — server-action pattern + ActionResult contract, timezone rules, component and testing conventions.
- Each `src/app/(dashboard)/<module>/README.md` documents that feature's data flow and gotchas — read it before editing that module.
