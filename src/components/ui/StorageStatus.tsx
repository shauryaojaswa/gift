import { useState, useEffect } from 'react'
import { useDataProvider } from '@/providers/DataProviderContext'
import { DemoModeBanner } from './DemoModeBanner'

export function StorageStatus() {
  const dataProvider = useDataProvider()
  const [status, setStatus] = useState<'checking' | 'connected' | 'demo'>('checking')

  useEffect(() => {
    let cancelled = false
    // Check if we're using Supabase by testing a simple operation
    const isSupabase = dataProvider.constructor.name === 'SupabaseDataProvider'
    if (!isSupabase) {
      setStatus('demo')
      return
    }
    // For Supabase, try a lightweight operation to verify connectivity
    dataProvider
      .getSession()
      .then(() => {
        if (!cancelled) setStatus('connected')
      })
      .catch(() => {
        if (!cancelled) setStatus('demo')
      })
    return () => {
      cancelled = true
    }
  }, [dataProvider])

  if (status === 'checking') return null
  if (status === 'demo') return <DemoModeBanner />

  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2" role="status">
      <svg
        className="h-4 w-4 text-green-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <path d="M22 4L12 14.01l-3-3" />
      </svg>
      <p className="text-sm text-green-800">Connected — data is saved and shared across devices.</p>
    </div>
  )
}
