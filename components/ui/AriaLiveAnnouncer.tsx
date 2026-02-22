'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type AnnounceFn = (message: string) => void

const AnnouncerContext = createContext<AnnounceFn>(() => {})

export function useAnnounce(): AnnounceFn {
  return useContext(AnnouncerContext)
}

export function AriaLiveAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const announce = useCallback((msg: string) => {
    // Clear then re-set to force screen readers to re-read
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage('')
    timerRef.current = setTimeout(() => setMessage(msg), 100)
  }, [])

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      {/* Visually hidden but accessible to screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {message}
      </div>
    </AnnouncerContext.Provider>
  )
}
