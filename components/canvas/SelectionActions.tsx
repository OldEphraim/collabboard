'use client'

import { useState } from 'react'
import type { BoardObject, FrameProperties } from '@/types/board'
import { STICKY_NOTE_COLORS, STICKY_COLOR_HEX, SHAPE_COLORS } from '@/lib/colors'
import { useHighContrast } from '@/lib/hooks/useHighContrast'

interface SelectionActionsProps {
  selectedObjects: BoardObject[]
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDelete: (ids: string[]) => void
  onDuplicate: (objects: BoardObject[]) => void
}

export default function SelectionActions({
  selectedObjects,
  onUpdate,
  onDelete,
  onDuplicate,
}: SelectionActionsProps) {
  const [showColors, setShowColors] = useState(false)
  const highContrast = useHighContrast()

  if (selectedObjects.length === 0) return null

  const hasStickyNotes = selectedObjects.some((o) => o.type === 'sticky_note')
  const hasShapes = selectedObjects.some(
    (o) => o.type === 'rectangle' || o.type === 'circle' || o.type === 'line' || o.type === 'frame'
  )
  const frames = selectedObjects.filter((o) => o.type === 'frame')
  const hasFrames = frames.length > 0
  const allFramesLocked = hasFrames && frames.every((f) => (f.properties as unknown as FrameProperties).locked)

  const handleColorChange = (color: string, fill?: string, stroke?: string) => {
    for (const obj of selectedObjects) {
      if (obj.type === 'sticky_note') {
        onUpdate(obj.id, {
          properties: { ...obj.properties, color },
        })
      } else if (fill && stroke) {
        onUpdate(obj.id, {
          properties: { ...obj.properties, fill, stroke },
        })
      }
    }
    setShowColors(false)
  }

  const hcBorder = highContrast ? ' border-2 border-gray-900' : ''

  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className={`absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg${hcBorder}`}
    >
      <span className="text-xs text-gray-400">
        {selectedObjects.length} selected
      </span>
      <div className="h-4 w-px bg-gray-200" />

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => setShowColors(!showColors)}
          className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-label="Change color"
        >
          Color
        </button>
        {showColors && (
          <div className="absolute bottom-full left-0 mb-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
            {hasStickyNotes && (
              <div className="mb-1">
                <p className="mb-1 text-[10px] font-medium text-gray-400">Notes</p>
                <div className="flex flex-wrap gap-1">
                  {STICKY_NOTE_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => handleColorChange(c.key)}
                      className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-medium hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ backgroundColor: c.hex }}
                      aria-label={`Set note color to ${c.label}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasShapes && (
              <div>
                <p className="mb-1 text-[10px] font-medium text-gray-400">Shapes</p>
                <div className="flex flex-wrap gap-1">
                  {SHAPE_COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => handleColorChange(c.name, c.fill, c.stroke)}
                      className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-medium hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ backgroundColor: c.fill }}
                      aria-label={`Set shape color to ${c.name}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lock/Unlock frames */}
      {hasFrames && (
        <button
          onClick={() => {
            for (const frame of frames) {
              const locked = (frame.properties as unknown as FrameProperties).locked
              onUpdate(frame.id, {
                properties: { ...frame.properties, locked: !locked },
              })
            }
          }}
          className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-label={allFramesLocked ? 'Unlock frame contents' : 'Lock frame contents'}
        >
          {allFramesLocked ? 'Unlock' : 'Lock'}
        </button>
      )}

      {/* Duplicate */}
      <button
        onClick={() => onDuplicate(selectedObjects)}
        className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        aria-label="Duplicate selected objects"
      >
        Duplicate
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(selectedObjects.map((o) => o.id))}
        className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        aria-label="Delete selected objects"
      >
        Delete
      </button>
    </div>
  )
}
