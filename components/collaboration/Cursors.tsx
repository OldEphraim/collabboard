'use client'

import type { CursorPosition } from '@/lib/hooks/usePresence'
import type Konva from 'konva'

interface CursorsProps {
  cursors: Map<string, CursorPosition>
  stageRef: React.RefObject<Konva.Stage | null>
}

export default function Cursors({ cursors, stageRef }: CursorsProps) {
  // Convert canvas coordinates to screen coordinates
  function toScreen(x: number, y: number) {
    const stage = stageRef.current
    if (!stage) return { x, y }
    const scale = stage.scaleX()
    const pos = stage.position()
    return {
      x: x * scale + pos.x,
      y: y * scale + pos.y,
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {Array.from(cursors.values()).map((cursor) => {
        const screen = toScreen(cursor.x, cursor.y)
        return (
          <div
            key={cursor.userId}
            data-testid="remote-cursor"
            className="absolute transition-transform duration-75"
            style={{
              transform: `translate(${screen.x}px, ${screen.y}px)`,
            }}
          >
            {/* Cursor arrow SVG */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            >
              <path
                d="M0 0L16 12.5L8.5 12.5L12 20L9 20L5.5 12.5L0 16V0Z"
                fill={cursor.color}
              />
            </svg>
            {/* Name label */}
            <div
              className="ml-4 -mt-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </div>
          </div>
        )
      })}
    </div>
  )
}
