import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App, initializeDefaultGraph } from './App.tsx'

// Initialize default graph before rendering
initializeDefaultGraph();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)