import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DataProviderProvider } from './providers/DataProviderContext'
import { AuthProvider } from './features/auth/AuthContext'
import './app.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DataProviderProvider>
          <App />
        </DataProviderProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
