'use client'

import { useEffect, useState } from 'react'

interface ConnectionStatusProps {
  boardConnected: boolean
  presenceConnected: boolean
}

export default function ConnectionStatus({
  boardConnected,
  presenceConnected,
}: ConnectionStatusProps) {
  const [offline, setOffline] = useState(false)

  // Track browser online/offline state
  useEffect(() => {
    const handleOffline = () => setOffline(true)
    const handleOnline = () => setOffline(false)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    setOffline(!navigator.onLine)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const isDisconnected = offline || !boardConnected || !presenceConnected

  if (!isDisconnected) return null

  return (
    <div role="alert" className="absolute left-1/2 top-12 z-40 -translate-x-1/2 animate-pulse rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-md">
      {offline ? 'You are offline. Reconnecting when network is available...' : 'Reconnecting...'}
    </div>
  )
}
