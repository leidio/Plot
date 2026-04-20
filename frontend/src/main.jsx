import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TurnIndexPrototypePage from './dev/TurnIndexPrototypePage.jsx'

const devTurnIndex =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('dev') === 'turn-index'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {devTurnIndex ? <TurnIndexPrototypePage /> : <App />}
  </StrictMode>,
)
