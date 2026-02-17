'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject, ShapeProperties } from '@/types/board'

interface ShapeProps {
  object: BoardObject
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
}

export default function Shape({
  object,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
}: ShapeProps) {
  const shapeRef = useRef<Konva.Rect>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const props = object.properties as unknown as ShapeProperties

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current])
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
    const node = shapeRef.current
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Reset scale and apply to width/height
    node.scaleX(1)
    node.scaleY(1)

    onUpdate(object.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(20, node.width() * scaleX),
      height: Math.max(20, node.height() * scaleY),
      rotation: node.rotation(),
    })
  }, [object.id, onUpdate])

  return (
    <>
      <Rect
        ref={shapeRef}
        x={object.x}
        y={object.y}
        width={object.width}
        height={object.height}
        rotation={object.rotation}
        fill={props.fill ?? '#DBEAFE'}
        stroke={props.stroke ?? '#3B82F6'}
        strokeWidth={props.strokeWidth ?? 2}
        draggable
        dragDistance={5}
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Minimum size constraint
            if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) {
              return oldBox
            }
            return newBox
          }}
        />
      )}
    </>
  )
}
