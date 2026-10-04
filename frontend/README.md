# neuraldoc Dashboard-Frontend

Node.js 24 und npm verwenden:

```powershell
npm ci
npm run dev
```

Dashboard: http://localhost:5174/app/. `/` leitet dorthin weiter. Vite liefert den MCP unter `/mcp` mit aus. Die Landingpage läuft separat unter http://localhost:5173/.

`npm run build` erzeugt `dist/app/index.html` und die Assets. Der Produktionsserver ist `../mcp/serve.mjs` und liefert den MCP mit aus.

Die Beispieldaten kommen aus den Submodulen unter `../datasets/` (`mobiq`, `mobiq-code`, `mobiq-docs`, `mobiq-db`). Alias `@/` zeigt auf `src/dashboard/`; `@dataset/` verwendet das ursprüngliche Datensatz-Layout (`gitlab/…`, `confluence/…`, `postgres/…`) und wird in `vite.config.ts` auf das jeweilige Repository abgebildet, wie `mcp/dataset.mjs` im Server. Der TanStack-Router verwendet `/app` als Basispfad.

`VITE_LANDING_URL` setzt den Website-Link. `.env.local` und der MCP-Zustand sind lokale, von Git ignorierte Dateien. Für die lokale Trennung wurden die bestehenden Einstellungen übernommen.
