# Agent instructions

## Branch names

Create a new branch for each task using this pattern:

`<type>/<short-description>`

- `<type>` is one of: `feature`, `fix`, `refactor`, `docs`, `test`, `chore`
- `<short-description>`: 2–5 words in kebab-case that describe the change
  (e.g. `login-null-check`, not `fix-bug`)
- Do not use dates, session IDs or random codes
- If the task mentions a ticket number, put it first:
  `fix/PROJ-123-login-null-check`

Examples:
- `feature/export-to-csv`
- `fix/timezone-offset-in-reports`
- `refactor/split-user-service`

Choose the name before the first commit and do not change it afterwards.
