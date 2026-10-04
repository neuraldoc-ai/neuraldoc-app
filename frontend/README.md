# neuraldoc dashboard frontend

Use Node.js 24 and npm:

```powershell
npm ci
npm run dev
```

Dashboard: http://localhost:5174/app/ (`/` redirects there). Vite also serves the MCP endpoint at `/mcp`.

`npm run build` produces `dist/app/index.html` and the assets. The production server is `../mcp/serve.mjs`, which serves the MCP endpoint as well.

The sample data come from the submodules in `../datasets/` (`mobiq`, `mobiq-code`, `mobiq-docs`, `mobiq-db`). The alias `@/` points to `src/dashboard/`; `@dataset/` uses the original dataset layout (`gitlab/…`, `confluence/…`, `postgres/…`) and is mapped to the matching repository in `vite.config.ts`, like `mcp/dataset.mjs` on the server. The TanStack router uses `/app` as its base path.

`VITE_LANDING_URL` sets the website link. `.env.local` and the MCP state are local files ignored by Git.
