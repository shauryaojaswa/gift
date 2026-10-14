import { useState } from 'react'

export function DemoModeBanner() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-2.5" role="status">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm text-amber-900">
            Demo mode — changes are saved only in this browser. Shared customer data is not connected yet.
          </p>
          {expanded && (
            <p className="mt-1.5 text-xs text-amber-800">
              To enable shared data across devices, the technical operator needs to configure Supabase
              environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) in the hosting
              platform. Until then, all data stays in this browser's local storage.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900"
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Learn more'}
        </button>
      </div>
    </div>
  )
}
