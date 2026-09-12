# Server Actions

Server Actions are the write path for forms and interactive mutations. Each
file starts with `"use server"` and exports narrowly scoped actions.

Rules:

- Validate every input with a schema from `lib/validations` before use. Never
  trust a value that arrived from the client.
- Check authorisation inside the action itself. Never rely on the caller
  having hidden the UI.
- Return a serialisable result (`{ ok: true }` or `{ ok: false, message }`)
  instead of throwing for expected failures, so forms can render the message.
- Keep database access in `lib/services`; an action orchestrates, it does not
  query directly.
- Revalidate affected paths or tags after a successful write.

This folder is empty on purpose — Phase 1 has no mutations.
