'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Group, Rect, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject, FrameProperties } from '@/types/board'

interface FrameProps {
  object: BoardObject
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
}

const TITLE_HEIGHT = 28

export default function FrameComponent({
  object,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
}: FrameProps) {
  const groupRef = useRef<Konva.Group>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const props = object.properties as unknown as FrameProperties

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

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

  const handleTransformEnd = useCallback(() => {
    const node = groupRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)

    onUpdate(object.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(100, object.width * scaleX),
      height: Math.max(60, object.height * scaleY),
    })
  }, [object.id, object.width, object.height, onUpdate])

  return (
    <>
      <Group
        ref={groupRef}
        x={object.x}
        y={object.y}
        draggable
        dragDistance={5}
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {/* Title bar */}
        <Rect
          width={object.width}
          height={TITLE_HEIGHT}
          fill={props.stroke ?? '#6B7280'}
          cornerRadius={[4, 4, 0, 0]}
        />
        <Text
          text={props.title ?? 'Frame'}
          width={object.width - 12}
          x={6}
          y={6}
          fontSize={13}
          fontStyle="bold"
          fontFamily="Arial, sans-serif"
          fill="#FFFFFF"
          ellipsis
        />
        {/* Frame body */}
        <Rect
          y={TITLE_HEIGHT}
          width={object.width}
          height={object.height - TITLE_HEIGHT}
          fill={props.fill ?? 'rgba(249, 250, 251, 0.5)'}
          stroke={props.stroke ?? '#6B7280'}
          strokeWidth={props.strokeWidth ?? 1}
          cornerRadius={[0, 0, 4, 4]}
          dash={[6, 3]}
        />
      </Group>
      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 100 || Math.abs(newBox.height) < 60) {
              return oldBox
            }
            return newBox
          }}
        />
      )}
    </>
  )
}
