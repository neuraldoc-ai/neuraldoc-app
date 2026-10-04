import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'
import { loadProject } from './features/docs/project'

// The demo runs on example data only; the query client stays for the router context.
const queryClient = new QueryClient()

// Create a new router instance
const router = createRouter({
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
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  void loadProject().then(() => root.render(
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
  )).catch(() => root.render(<div className='mx-auto mt-20 max-w-lg rounded-xl border p-6'><h1 className='text-xl font-medium'>Lokaler Server nicht erreichbar</h1><p className='mt-3 text-sm text-muted-foreground'>neuraldoc mit npm run dev oder npm run start starten und die Seite erneut laden.</p><button className='mt-4 underline' onClick={() => window.location.reload()}>Erneut laden</button></div>))
}
