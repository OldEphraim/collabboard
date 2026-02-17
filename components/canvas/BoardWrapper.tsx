'use client'

import { useRef, useCallback } from 'react'
import type Konva from 'konva'
import type { Board } from '@/types/board'
import { useBoard } from '@/lib/hooks/useBoard'
import { usePresence } from '@/lib/hooks/usePresence'
import BoardCanvas from './Board'
import Toolbar from './Toolbar'
import Cursors from '@/components/collaboration/Cursors'
import PresenceBar from '@/components/collaboration/PresenceBar'
import Link from 'next/link'

const STICKY_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']

interface BoardWrapperProps {
  board: Board
  userId: string
  userEmail: string
}

export default function BoardWrapper({ board, userId, userEmail }: BoardWrapperProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const { objects, loading, createObject, updateObject, broadcastObjectMove } = useBoard(board.id)
  const { cursors, onlineUsers, broadcastCursor } = usePresence(
    board.id,
    userId,
    userEmail
  )

  const getViewportCenter = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return { x: 300, y: 300 }
    const scale = stage.scaleX()
    const pos = stage.position()
    return {
      x: (-pos.x + stage.width() / 2) / scale,
      y: (-pos.y + stage.height() / 2) / scale,
    }
  }, [])

  const handleCreateStickyNote = useCallback(() => {
    const center = getViewportCenter()
    const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]
    createObject({
      type: 'sticky_note',
      x: center.x - 75,
      y: center.y - 75,
      width: 200,
      height: 200,
      properties: { text: '', color, fontSize: 14 },
    })
  }, [createObject, getViewportCenter])

  const handleCreateRectangle = useCallback(() => {
    const center = getViewportCenter()
    createObject({
      type: 'rectangle',
      x: center.x - 75,
      y: center.y - 50,
      width: 150,
      height: 100,
      properties: { fill: '#DBEAFE', stroke: '#3B82F6', strokeWidth: 2 },
    })
  }, [createObject, getViewportCenter])

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </Link>
          <span className="text-sm text-gray-300">|</span>
          <h1 className="text-sm font-semibold text-gray-900">{board.name}</h1>
        </div>
        <PresenceBar users={onlineUsers} currentUserId={userId} />
      </header>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <Toolbar
          onCreateStickyNote={handleCreateStickyNote}
          onCreateRectangle={handleCreateRectangle}
        />
        <Cursors cursors={cursors} stageRef={stageRef} />
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">Loading board...</p>
          </div>
        ) : (
          <BoardCanvas
            objects={objects}
            onUpdate={updateObject}
            onDragMove={broadcastObjectMove}
            onCursorMove={broadcastCursor}
            stageRef={stageRef}
          />
        )}
      </div>
    </div>
  )
}
