import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { FloatingApp } from './FloatingApp'
import { ensureEmbeddedFonts } from './lib/embeddedFonts'
import './styles.css'
import './styles-refresh-layer.css'

ensureEmbeddedFonts()

const floatingReader = new URLSearchParams(window.location.search).has('floatingReader')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {floatingReader ? <FloatingApp /> : <App />}
  </React.StrictMode>
)
