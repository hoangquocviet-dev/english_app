import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { forceReloadApp } from './utils/reload'

const CHUNK_RELOAD_KEY = 'vocabflow_chunk_reload_at'

if (typeof window !== 'undefined') {
  // Automatically recover if user had an old tab open when a new deployment replaced lazy chunk hashes
  window.addEventListener('vite:preloadError', (event) => {
    const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0')
    if (Date.now() - lastReload > 10000) {
      event.preventDefault()
      window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
      void forceReloadApp()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
