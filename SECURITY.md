# Security policy

## Supported versions

Only the latest state of the `main` branch receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub: **Security → Report a vulnerability** in this repository ([direct link](https://github.com/neuraldoc-ai/neuraldoc-app/security/advisories/new)).

Include what you found, how to reproduce it and what an attacker could do with it. You will get an answer within seven days. Once a fix is available, we credit you in the advisory unless you prefer otherwise.

## Scope and deployment model

neuraldoc is built to run locally for one person or a small team:

- There is no user management. The MCP demo token is not an access control for a public network.
- Paths in the import dialog can be chosen freely inside the mounted folder.
- Write requests require the same origin or the MCP token; read endpoints have no further protection.

Do not expose the app on a public network. Reports that only restate these documented limits are not vulnerabilities, but reports that break them in a local setup are, for example reading files outside the mounted folder, leaking keys into responses, caches or exports, or writing to an imported repository.
