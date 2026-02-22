'use client'

import { useRef, useEffect, useCallback } from 'react'
import { Circle, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject, ShapeProperties } from '@/types/board'

interface CircleShapeProps {
  object: BoardObject
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
  highContrast?: boolean
}

export default function CircleShape({
  object,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
  highContrast,
}: CircleShapeProps) {
  const shapeRef = useRef<Konva.Circle>(null)
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
    const newRadius = Math.max(10, node.radius() * scaleX)
    node.scaleX(1)
    node.scaleY(1)

    onUpdate(object.id, {
      x: node.x(),
      y: node.y(),
      width: newRadius * 2,
      height: newRadius * 2,
      rotation: node.rotation(),
    })
  }, [object.id, onUpdate])

  return (
    <>
      <Circle
        name={object.id}
        ref={shapeRef}
        x={object.x}
        y={object.y}
        radius={object.width / 2}
        rotation={object.rotation}
        fill={props.fill ?? '#DBEAFE'}
        stroke={props.stroke ?? '#3B82F6'}
        strokeWidth={highContrast ? Math.max(3, props.strokeWidth ?? 2) : (props.strokeWidth ?? 2)}
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
          keepRatio
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
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
