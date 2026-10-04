# neuraldoc app

The app people run to use neuraldoc: showcase with MOBIQ sample data, import of their own projects, and MCP. Users run `docker build -t neuraldoc .` and `docker run -p 8080:8080 -v neuraldoc-data:/data neuraldoc`; development: `cd frontend; npm ci; npm run dev` (port 5174). UI texts in German, documentation in English. No real customer names, no paid model calls and no commits without an explicit request.
