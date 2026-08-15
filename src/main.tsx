import { StrictMode, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Landing } from './landing/Landing.tsx'

// Console is heavy (DuckDB-WASM, analytics) — lazy-load so the landing stays lean
const ConsoleApp = lazy(() =>
  import('./App.tsx').then(m => ({
    default: () => {
      // Seed the default graph exactly once before the console mounts
      const [ready] = useState(() => { m.initializeDefaultGraph(); return true; });
      void ready;
      return <m.App />;
    },
  })),
)

function Root() {
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/')

  useEffect(() => {
    const onPop = () => {
      setPath(window.location.pathname.replace(/\/+$/, '') || '/')
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to)
    setPath(to)
    window.scrollTo(0, 0)
  }, [])

  const isConsole = path === '/console'

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 font-mono text-xs text-zinc-500">
          AEGIS // INITIALIZING CONSOLE…
        </div>
      }
    >
      {isConsole ? <ConsoleApp /> : <Landing navigate={navigate} />}
    </Suspense>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)