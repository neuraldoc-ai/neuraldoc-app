# neuraldoc app

The app people run to use neuraldoc: showcase with MOBIQ sample data, import of their own projects, and MCP. Users run `docker build -t neuraldoc .` and `docker run -p 8080:8080 -v neuraldoc-data:/data neuraldoc`; development: `cd frontend; pnpm install; pnpm dev` (port 5173)