import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './app/styles/base.css'
import './app/styles/start.css'
import './app/styles/analyzing.css'
import './app/styles/results.css'
import { App } from './app/App.tsx'
import { preloadHwp } from './parsers/hwp.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered only in a build: the dev server has no sw.js, and caching it would serve stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}

// The HWP 5 reader is large; fetching it once the page is up keeps the first HWP drop fast.
addEventListener('load', preloadHwp)
