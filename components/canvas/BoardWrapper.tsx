'use client'

import { useRef, useCallback, useState } from 'react'
import type Konva from 'konva'
import type { Board, BoardObject } from '@/types/board'
import { useBoard } from '@/lib/hooks/useBoard'
import { usePresence } from '@/lib/hooks/usePresence'
import BoardCanvas from './Board'
import Toolbar from './Toolbar'
import Cursors from '@/components/collaboration/Cursors'
import PresenceBar from '@/components/collaboration/PresenceBar'
import Link from 'next/link'
import AiChat from '@/components/collaboration/AiChat'
import ConnectionStatus from '@/components/collaboration/ConnectionStatus'

const STICKY_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']

interface BoardWrapperProps {
  board: Board
  userId: string
  userEmail: string
}

export default function BoardWrapper({ board, userId, userEmail }: BoardWrapperProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const { objects, loading, connected: boardConnected, createObject, updateObject, deleteObject, broadcastObjectMove, applyAiResults } =
    useBoard(board.id)
  const { cursors, onlineUsers, broadcastCursor, connected: presenceConnected } = usePresence(
    board.id,
    userId,
    userEmail
  )
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)

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

  // === Creation handlers ===

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

  const handleCreateCircle = useCallback(() => {
    const center = getViewportCenter()
    createObject({
      type: 'circle',
      x: center.x,
      y: center.y,
      width: 100,
      height: 100,
      properties: { fill: '#DBEAFE', stroke: '#3B82F6', strokeWidth: 2 },
    })
  }, [createObject, getViewportCenter])

  const handleCreateLine = useCallback(() => {
    const center = getViewportCenter()
    createObject({
      type: 'line',
      x: center.x - 75,
      y: center.y,
      width: 150,
      height: 0,
      properties: { stroke: '#374151', strokeWidth: 2, points: [0, 0, 150, 0] },
    })
  }, [createObject, getViewportCenter])

  const handleCreateText = useCallback(() => {
    const center = getViewportCenter()
    createObject({
      type: 'text',
      x: center.x - 75,
      y: center.y - 12,
      width: 200,
      height: 30,
      properties: { text: '', fontSize: 18, fill: '#1F2937' },
    })
  }, [createObject, getViewportCenter])

  const handleCreateFrame = useCallback(() => {
    const center = getViewportCenter()
    createObject({
      type: 'frame',
      x: center.x - 200,
      y: center.y - 150,
      width: 400,
      height: 300,
      properties: {
        title: 'Frame',
        fill: 'rgba(249, 250, 251, 0.5)',
        stroke: '#6B7280',
        strokeWidth: 1,
      },
    })
  }, [createObject, getViewportCenter])

  // Connector mode: first click sets source, second click creates connector
  const handleStartConnector = useCallback(() => {
    setConnectingFrom((prev) => (prev ? null : '__WAITING__'))
  }, [])

  const handleConnectTo = useCallback(
    (toId: string) => {
      // Cancel sentinel (Escape key)
      if (!toId) {
        setConnectingFrom(null)
        return
      }
      if (!connectingFrom || connectingFrom === '__WAITING__') {
        // First object click in connector mode
        setConnectingFrom(toId)
        return
      }
      // Second object click — create the connector
      createObject({
        type: 'connector',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        properties: {
          fromId: connectingFrom,
          toId,
          stroke: '#6B7280',
          strokeWidth: 2,
        },
      })
      setConnectingFrom(null)
    },
    [connectingFrom, createObject]
  )

  // === Object operations ===

  const handleDeleteSelected = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => deleteObject(id))
    },
    [deleteObject]
  )

  const handleDuplicateSelected = useCallback(
    (objs: BoardObject[]) => {
      objs.forEach((obj) => {
        createObject({
          type: obj.type,
          x: obj.x + 20,
          y: obj.y + 20,
          width: obj.width,
          height: obj.height,
          properties: { ...obj.properties },
        })
      })
    },
    [createObject]
  )

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back
          </Link>
          <span className="text-sm text-gray-300">|</span>
          <h1 className="text-sm font-semibold text-gray-900">{board.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="group relative cursor-help text-xs text-gray-400" title="Conflict resolution: last-write-wins">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="inline h-4 w-4">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
            </svg>
            <span className="pointer-events-none absolute right-0 top-6 z-50 hidden w-64 rounded-md bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg group-hover:block">
              <strong>Conflict Resolution:</strong> CollabBoard uses a last-write-wins strategy. When two users edit the same object simultaneously, the most recent change is kept. Real-time broadcast sync ensures all clients converge to the same state within ~100ms.
            </span>
          </span>
          <PresenceBar users={onlineUsers} currentUserId={userId} />
        </div>
      </header>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        <Toolbar
          onCreateStickyNote={handleCreateStickyNote}
          onCreateRectangle={handleCreateRectangle}
          onCreateCircle={handleCreateCircle}
          onCreateLine={handleCreateLine}
          onCreateText={handleCreateText}
          onCreateFrame={handleCreateFrame}
          onStartConnector={handleStartConnector}
          connectingFrom={connectingFrom}
        />
        <ConnectionStatus boardConnected={boardConnected} presenceConnected={presenceConnected} />
        <AiChat boardId={board.id} onResults={applyAiResults} />
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
            onDelete={handleDeleteSelected}
            onDuplicate={handleDuplicateSelected}
            stageRef={stageRef}
            connectingFrom={connectingFrom}
            onConnectTo={handleConnectTo}
          />
        )}
      </div>
    </div>
  )
}
