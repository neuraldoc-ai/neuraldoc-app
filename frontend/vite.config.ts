import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const projectPath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Match the directory-index behavior of a static host in dev and preview.
function serveFrontendPages(server: Pick<ViteDevServer, 'middlewares'>) {
  server.middlewares.use((request, response, next) => {
    const [pathname, query] = (request.url ?? '/').split('?')
    const suffix = query === undefined ? '' : `?${query}`
    if (pathname === '/') {
      response.writeHead(302, { Location: `/app/${suffix}` })
      response.end()
      return
    }
    if (pathname === '/app' || pathname.startsWith('/app/')) {
      request.url = `/app/index.html${suffix}`
    }
    next()
  })
}

const mcpServer: Plugin = {
  name: 'neuraldoc-mcp',
  // Load after the config callback sets server-only env, including the state directory.
  configureServer: async (server) => {
    const { middleware } = await import('../mcp/handler.mjs')
    server.middlewares.use(middleware)
  },
  configurePreviewServer: async (server) => {
    const { middleware } = await import('../mcp/handler.mjs')
    server.middlewares.use(middleware)
  },
}

const frontendPages: Plugin = {
  name: 'neuraldoc-page-entries',
  configureServer: serveFrontendPages,
  configurePreviewServer: serveFrontendPages,
}

export default defineConfig(({ mode }) => {
  // These keys are for the Node middleware only. Vite exposes only VITE_ prefixed values.
  const serverEnv = loadEnv(mode, process.cwd(), '')
  for (const name of ['NEURALDOC_MODE', 'NEURALDOC_JEV_BUDGET_USD', 'NEURALDOC_DRAFT_PROVIDER', 'VERTEX_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'NEURALDOC_VERTEX_MODE', 'NEURALDOC_VERTEX_AUTH', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'NEURALDOC_GEMINI_MODEL', 'NEURALDOC_STATE_DIR', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'NEURALDOC_LLM_MODEL', 'NEURALDOC_LLM_BASE_URL', 'NEURALDOC_LLM_API_KEY', 'NEURALDOC_LLM_FORMAT', 'NEURALDOC_LLM_INPUT_USD_PER_MILLION', 'NEURALDOC_LLM_OUTPUT_USD_PER_MILLION', 'TYPESAFE_API_KEY', 'JEV_API_KEY']) {
    if (!process.env[name] && serverEnv[name]) process.env[name] = serverEnv[name]
  }
  return {
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: loadEnv(mode, process.cwd(), 'BACKEND_').BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@', replacement: projectPath('./src/dashboard') },
      // Example dataset: four MOBIQ submodules under datasets/, imported in the original dataset layout
      // (same mapping as mcp/dataset.mjs). Shown on the Daten page.
      { find: /^@dataset\/(confluence|dokumente)\//, replacement: projectPath('../datasets/mobiq-docs/') + '$1/' },
      { find: /^@dataset\/postgres\//, replacement: projectPath('../datasets/mobiq-db/') },
      { find: '@dataset', replacement: projectPath('../datasets/mobiq/data') },
    ],
  },
  plugins: [
    mcpServer,
    frontendPages,
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/dashboard/routes',
      generatedRouteTree: './src/dashboard/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      input: {
        dashboard: projectPath('./app/index.html'),
      },
    },
  },
  }
})
