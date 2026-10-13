import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DataProviderProvider } from './providers/DataProviderContext'
import './app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <DataProviderProvider>
        <App />
      </DataProviderProvider>
    </BrowserRouter>
  </StrictMode>,
)
