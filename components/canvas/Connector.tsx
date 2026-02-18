'use client'

import { Arrow } from 'react-konva'
import type { BoardObject, ConnectorProperties } from '@/types/board'

interface ConnectorProps {
  object: BoardObject
  objects: BoardObject[]
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
}

function getObjectCenter(obj: BoardObject): { x: number; y: number } {
  if (obj.type === 'circle') {
    // Circle x,y is already the center
    return { x: obj.x, y: obj.y }
  }
  return {
    x: obj.x + obj.width / 2,
    y: obj.y + obj.height / 2,
  }
}

export default function Connector({
  object,
  objects,
  isSelected,
  onSelect,
}: ConnectorProps) {
  const props = object.properties as unknown as ConnectorProperties
  const fromObj = objects.find((o) => o.id === props.fromId)
  const toObj = objects.find((o) => o.id === props.toId)

  if (!fromObj || !toObj) return null

  const from = getObjectCenter(fromObj)
  const to = getObjectCenter(toObj)

  return (
    <Arrow
      points={[from.x, from.y, to.x, to.y]}
      stroke={props.stroke ?? '#6B7280'}
      strokeWidth={props.strokeWidth ?? 2}
      fill={props.stroke ?? '#6B7280'}
      pointerLength={10}
      pointerWidth={8}
      hitStrokeWidth={12}
      onClick={onSelect}
      onTap={onSelect}
      dash={isSelected ? [8, 4] : undefined}
    />
  )
}
