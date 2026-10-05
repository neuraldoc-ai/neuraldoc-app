import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
// Styles
import './styles/index.css'
import { loadProject } from './features/docs/project'

const queryClient = new QueryClient()

type RouteTree = typeof import('./routeTree.gen').routeTree
const createAppRouter = (routeTree: RouteTree) => createRouter({
  basepath: '/app',
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}

// The pages are loaded after the data: some derive values when their module loads.
async function start(root: ReactDOM.Root) {
  await loadProject()
  const { routeTree } = await import('./routeTree.gen')
  const router = createAppRouter(routeTree)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontProvider>
            <DirectionProvider>
              <RouterProvider router={router} />
            </DirectionProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  start(root).catch(() => root.render(<div className='mx-auto mt-20 max-w-lg rounded-xl border p-6'><h1 className='text-xl font-medium'>neuraldoc-Server nicht erreichbar</h1><p className='mt-3 text-sm text-muted-foreground'>Läuft der Container? Protokoll: docker logs neuraldoc. Danach die Seite neu laden.</p><button className='mt-4 underline' onClick={() => window.location.reload()}>Erneut laden</button></div>))
}
