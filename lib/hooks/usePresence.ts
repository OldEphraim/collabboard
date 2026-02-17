'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

const CURSOR_THROTTLE_MS = 50

// Consistent user colors for cursor/presence
const USER_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
]

function getColorForUser(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

export interface CursorPosition {
  x: number
  y: number
  userId: string
  name: string
  color: string
}

export interface PresenceUser {
  userId: string
  name: string
  color: string
  onlineAt: string
}

export function usePresence(boardId: string, userId: string, userName: string) {
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map())
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabaseRef = useRef(createClient())
  const lastBroadcast = useRef(0)
  const userColor = getColorForUser(userId)

  useEffect(() => {
    const supabase = supabaseRef.current

    // Cancel any pending cleanup from StrictMode's simulated unmount
    if (cleanupTimerRef.current) {
      console.log('[usePresence] Cancelled pending cleanup (StrictMode remount)')
      clearTimeout(cleanupTimerRef.current)
      cleanupTimerRef.current = null
    }

    // If channel already exists from previous mount, reuse it
    if (channelRef.current) {
      console.log('[usePresence] Reusing existing channel (StrictMode remount)')
      return () => {
        cleanupTimerRef.current = setTimeout(() => {
          if (channelRef.current) {
            console.log('[usePresence] Deferred cleanup: removing channel')
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
          }
        }, 200)
      }
    }

    console.log('[usePresence] Creating channel for board:', boardId, 'user:', userId)

    const channel = supabase.channel(`board-presence-${boardId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: userId },
      },
    })

    // Listen for cursor broadcasts from other users
    channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      console.log('[usePresence] Cursor broadcast received:', payload?.userId)
      if (!payload || payload.userId === userId) return
      setCursors((prev) => {
        const next = new Map(prev)
        next.set(payload.userId, payload as CursorPosition)
        return next
      })
    })

    // Listen for presence sync (who's online)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      console.log('[usePresence] Presence sync:', Object.keys(state))
      const users: PresenceUser[] = []
      for (const key in state) {
        const presences = state[key] as unknown as PresenceUser[]
        if (presences && presences.length > 0) {
          users.push(presences[0])
        }
      }
      setOnlineUsers(users)
    })

    // When a user leaves, remove their cursor
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      console.log('[usePresence] User left:', leftPresences)
      setCursors((prev) => {
        const next = new Map(prev)
        for (const p of leftPresences) {
          const presence = p as unknown as { userId: string }
          next.delete(presence.userId)
        }
        return next
      })
    })

    channel.subscribe(async (status, err) => {
      console.log('[usePresence] Channel status:', status, err ?? '')
      if (status === 'SUBSCRIBED') {
        console.log('[usePresence] SUBSCRIBED — tracking presence')
        const trackResult = await channel.track({
          userId,
          name: userName,
          color: userColor,
          onlineAt: new Date().toISOString(),
        })
        console.log('[usePresence] Track result:', trackResult)
      }
    })

    channelRef.current = channel

    return () => {
      // Defer cleanup so StrictMode remount can cancel it
      cleanupTimerRef.current = setTimeout(() => {
        if (channelRef.current) {
          console.log('[usePresence] Deferred cleanup: removing channel')
          supabase.removeChannel(channelRef.current)
          channelRef.current = null
        }
      }, 200)
    }
  }, [boardId, userId, userName, userColor])

  // Throttled cursor broadcast
  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now()
      if (now - lastBroadcast.current < CURSOR_THROTTLE_MS) return
      lastBroadcast.current = now

      const channel = channelRef.current
      if (!channel) {
        return
      }

      channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { x, y, userId, name: userName, color: userColor },
      })
    },
    [userId, userName, userColor]
  )

  return { cursors, onlineUsers, broadcastCursor, userColor }
}
