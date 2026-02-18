'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BoardObject } from '@/types/board'
import type { RealtimeChannel } from '@supabase/supabase-js'

const DRAG_THROTTLE_MS = 50

export function useBoard(boardId: string) {
  const [objects, setObjects] = useState<BoardObject[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const channelRef = useRef<RealtimeChannel | null>(null)
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDragBroadcast = useRef(0)
  const zIndexCounter = useRef(0)
  const hasBeenConnected = useRef(false)

  // Load objects on mount
  useEffect(() => {
    async function loadObjects() {
      const { data, error } = await supabase
        .from('board_objects')
        .select('*')
        .eq('board_id', boardId)
        .order('z_index', { ascending: true })

      if (error) {
        console.error('[useBoard] Failed to load objects:', error)
      }
      if (data) {
        setObjects(data as BoardObject[])
        zIndexCounter.current = data.reduce(
          (max, o) => Math.max(max, (o as BoardObject).z_index ?? 0),
          0
        )
      }
      setLoading(false)
    }

    loadObjects()
  }, [boardId, supabase])

  // Realtime subscription — Broadcast-based sync for all CRUD + drag.
  // postgres_changes was unreliable (events not delivered), so we use
  // Broadcast for live sync and DB load on mount for initial state.
  // Uses deferred cleanup to survive React StrictMode double-invoke.
  useEffect(() => {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current)
      cleanupTimerRef.current = null
    }

    if (channelRef.current) {
      return () => {
        cleanupTimerRef.current = setTimeout(() => {
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
          }
        }, 200)
      }
    }

    console.log('[useBoard] Creating Broadcast channel for board:', boardId)

    const channel = supabase
      .channel(`board-objects-${boardId}`, {
        config: { broadcast: { self: false } },
      })
      // Live object movement during drag
      .on('broadcast', { event: 'object-move' }, ({ payload }) => {
        if (!payload) return
        const { id, x, y } = payload as { id: string; x: number; y: number }
        setObjects((prev) =>
          prev.map((obj) => (obj.id === id ? { ...obj, x, y } : obj))
        )
      })
      // Object created by another user
      .on('broadcast', { event: 'object-create' }, ({ payload }) => {
        if (!payload) return
        const newObj = payload as BoardObject
        if (newObj.z_index > zIndexCounter.current) {
          zIndexCounter.current = newObj.z_index
        }
        setObjects((prev) => {
          if (prev.some((o) => o.id === newObj.id)) return prev
          return [...prev, newObj]
        })
      })
      // Object updated by another user
      .on('broadcast', { event: 'object-update' }, ({ payload }) => {
        if (!payload) return
        const { id, ...updates } = payload as { id: string } & Partial<BoardObject>
        setObjects((prev) =>
          prev.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj))
        )
      })
      // Object deleted by another user
      .on('broadcast', { event: 'object-delete' }, ({ payload }) => {
        if (!payload) return
        const { id } = payload as { id: string }
        setObjects((prev) => prev.filter((obj) => obj.id !== id))
      })

    channel.subscribe(async (status, err) => {
      console.log('[useBoard] Subscription status:', status, err ?? '')
      if (status === 'SUBSCRIBED') {
        setConnected(true)
        // On reconnect, reload objects from DB to catch any missed changes
        if (hasBeenConnected.current) {
          console.log('[useBoard] Reconnected — reloading objects from DB')
          const { data } = await supabase
            .from('board_objects')
            .select('*')
            .eq('board_id', boardId)
            .order('z_index', { ascending: true })
          if (data) {
            setObjects(data as BoardObject[])
            zIndexCounter.current = data.reduce(
              (max, o) => Math.max(max, (o as BoardObject).z_index ?? 0),
              0
            )
          }
        }
        hasBeenConnected.current = true
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnected(false)
      }
    })

    channelRef.current = channel

    return () => {
      cleanupTimerRef.current = setTimeout(() => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
          channelRef.current = null
        }
      }, 200)
    }
  }, [boardId, supabase])

  // Broadcast live object position during drag (ephemeral, not written to DB)
  const broadcastObjectMove = useCallback(
    (id: string, x: number, y: number) => {
      const now = Date.now()
      if (now - lastDragBroadcast.current < DRAG_THROTTLE_MS) return
      lastDragBroadcast.current = now

      channelRef.current?.send({
        type: 'broadcast',
        event: 'object-move',
        payload: { id, x, y },
      })
    },
    []
  )

  const createObject = useCallback(
    async (obj: Partial<BoardObject> & { type: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null

      const newObj = {
        board_id: boardId,
        type: obj.type,
        x: obj.x ?? 100,
        y: obj.y ?? 100,
        width: obj.width ?? 150,
        height: obj.height ?? 150,
        rotation: 0,
        z_index: ++zIndexCounter.current,
        properties: obj.properties ?? {},
        created_by: user.id,
        updated_by: user.id,
      }

      const { data, error } = await supabase
        .from('board_objects')
        .insert(newObj)
        .select()
        .single()

      if (data && !error) {
        const created = data as BoardObject
        setObjects((prev) => [...prev, created])
        // Broadcast to other clients
        channelRef.current?.send({
          type: 'broadcast',
          event: 'object-create',
          payload: created,
        })
        return created
      }
      if (error) {
        console.error('[useBoard] Create failed:', error)
      }
      return null
    },
    [boardId, supabase]
  )

  const updateObject = useCallback(
    async (id: string, updates: Partial<BoardObject>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      // Optimistic local update
      setObjects((prev) =>
        prev.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj))
      )

      // Broadcast to other clients immediately
      channelRef.current?.send({
        type: 'broadcast',
        event: 'object-update',
        payload: { id, ...updates },
      })

      const { error } = await supabase
        .from('board_objects')
        .update({ ...updates, updated_by: user?.id })
        .eq('id', id)

      if (error) {
        console.error('[useBoard] Update failed:', error)
      }
    },
    [supabase]
  )

  const deleteObject = useCallback(
    async (id: string) => {
      setObjects((prev) => prev.filter((obj) => obj.id !== id))

      // Broadcast to other clients
      channelRef.current?.send({
        type: 'broadcast',
        event: 'object-delete',
        payload: { id },
      })

      const { error } = await supabase
        .from('board_objects')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('[useBoard] Delete failed:', error)
      }
    },
    [supabase]
  )

  // Apply results returned from the AI command API.
  // The API already wrote to Supabase, so we only need to update local state
  // and broadcast to other connected clients.
  const applyAiResults = useCallback(
    (results: { action: 'create' | 'update' | 'delete'; object: BoardObject }[]) => {
      for (const { action, object: obj } of results) {
        if (action === 'create') {
          if (obj.z_index > zIndexCounter.current) {
            zIndexCounter.current = obj.z_index
          }
          setObjects((prev) => {
            if (prev.some((o) => o.id === obj.id)) return prev
            return [...prev, obj]
          })
          channelRef.current?.send({
            type: 'broadcast',
            event: 'object-create',
            payload: obj,
          })
        } else if (action === 'update') {
          setObjects((prev) =>
            prev.map((o) => (o.id === obj.id ? { ...o, ...obj } : o))
          )
          channelRef.current?.send({
            type: 'broadcast',
            event: 'object-update',
            payload: obj,
          })
        } else if (action === 'delete') {
          setObjects((prev) => prev.filter((o) => o.id !== obj.id))
          channelRef.current?.send({
            type: 'broadcast',
            event: 'object-delete',
            payload: { id: obj.id },
          })
        }
      }
    },
    []
  )

  return { objects, loading, connected, createObject, updateObject, deleteObject, broadcastObjectMove, applyAiResults }
}
