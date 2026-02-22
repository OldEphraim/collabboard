'use client'

import { useCallback } from 'react'
import { Group, Line, Circle } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject, LineProperties } from '@/types/board'

interface LineShapeProps {
  object: BoardObject
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
}

export default function LineShape({
  object,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
}: LineShapeProps) {
  const props = object.properties as unknown as LineProperties
  const points = props.points ?? [0, 0, 150, 0]

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragMove(object.id, e.target.x(), e.target.y())
    },
    [object.id, onDragMove]
  )

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onUpdate(object.id, {
        x: e.target.x(),
        y: e.target.y(),
      })
    },
    [object.id, onUpdate]
  )

  // Drag endpoint handle to reshape the line
  const handleEndpointDrag = useCallback(
    (index: 0 | 1, e: Konva.KonvaEventObject<DragEvent>) => {
      const newPoints = [...points]
      newPoints[index * 2] = e.target.x()
      newPoints[index * 2 + 1] = e.target.y()
      e.target.x(newPoints[index * 2])
      e.target.y(newPoints[index * 2 + 1])
      onUpdate(object.id, {
        properties: { ...object.properties, points: newPoints },
      })
    },
    [object.id, object.properties, points, onUpdate]
  )

  return (
    <Group
      name={object.id}
      x={object.x}
      y={object.y}
      draggable
      dragDistance={5}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Line
        points={points}
        stroke={props.stroke ?? '#374151'}
        strokeWidth={props.strokeWidth ?? 2}
        hitStrokeWidth={12}
      />
      {/* Endpoint handles when selected */}
      {isSelected && (
        <>
          <Circle
            x={points[0]}
            y={points[1]}
            radius={5}
            fill="#3B82F6"
            stroke="#fff"
            strokeWidth={1}
            draggable
            onDragEnd={(e) => handleEndpointDrag(0, e)}
          />
          <Circle
            x={points[2]}
            y={points[3]}
            radius={5}
            fill="#3B82F6"
            stroke="#fff"
            strokeWidth={1}
            draggable
            onDragEnd={(e) => handleEndpointDrag(1, e)}
          />
        </>
      )}
    </Group>
  )
}
