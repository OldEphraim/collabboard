'use client'

import { useState } from 'react'
import type { BoardObject } from '@/types/board'

const SHAPE_COLORS = [
  { name: 'Blue', fill: '#DBEAFE', stroke: '#3B82F6' },
  { name: 'Red', fill: '#FEE2E2', stroke: '#EF4444' },
  { name: 'Green', fill: '#DCFCE7', stroke: '#22C55E' },
  { name: 'Purple', fill: '#F3E8FF', stroke: '#A855F7' },
  { name: 'Orange', fill: '#FED7AA', stroke: '#F97316' },
  { name: 'Gray', fill: '#F3F4F6', stroke: '#6B7280' },
]

const STICKY_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']

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

  if (selectedObjects.length === 0) return null

  const hasStickyNotes = selectedObjects.some((o) => o.type === 'sticky_note')
  const hasShapes = selectedObjects.some(
    (o) => o.type === 'rectangle' || o.type === 'circle' || o.type === 'line' || o.type === 'frame'
  )

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

  return (
    <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <span className="text-xs text-gray-400">
        {selectedObjects.length} selected
      </span>
      <div className="h-4 w-px bg-gray-200" />

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => setShowColors(!showColors)}
          className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
          title="Change color"
        >
          Color
        </button>
        {showColors && (
          <div className="absolute bottom-full left-0 mb-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
            {hasStickyNotes && (
              <div className="mb-1">
                <p className="mb-1 text-[10px] font-medium text-gray-400">Notes</p>
                <div className="flex gap-1">
                  {STICKY_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleColorChange(c)}
                      className="h-6 w-6 rounded border border-gray-300 hover:scale-110"
                      style={{ backgroundColor: STICKY_COLOR_HEX[c] }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}
            {hasShapes && (
              <div>
                <p className="mb-1 text-[10px] font-medium text-gray-400">Shapes</p>
                <div className="flex gap-1">
                  {SHAPE_COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => handleColorChange(c.name, c.fill, c.stroke)}
                      className="h-6 w-6 rounded border border-gray-300 hover:scale-110"
                      style={{ backgroundColor: c.fill }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Duplicate */}
      <button
        onClick={() => onDuplicate(selectedObjects)}
        className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
        title="Duplicate (Ctrl+D)"
      >
        Duplicate
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(selectedObjects.map((o) => o.id))}
        className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
        title="Delete (Delete key)"
      >
        Delete
      </button>
    </div>
  )
}

const STICKY_COLOR_HEX: Record<string, string> = {
  yellow: '#FEF08A',
  blue: '#93C5FD',
  green: '#86EFAC',
  pink: '#FDA4AF',
  purple: '#C4B5FD',
  orange: '#FED7AA',
}
