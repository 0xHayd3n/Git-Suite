import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './styles/globals.css'
import App from './App'

// Show scrollbar thumb only while scrolling, then fade it out
;(() => {
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  document.addEventListener('scroll', (e) => {
    const el = e.target as Element
    if (!(el instanceof Element)) return
    el.classList.add('is-scrolling')
    const prev = timers.get(el)
    if (prev) clearTimeout(prev)
    timers.set(el, setTimeout(() => el.classList.remove('is-scrolling'), 800))
  }, { capture: true, passive: true })
})()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
