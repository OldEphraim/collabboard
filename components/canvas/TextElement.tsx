'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Group, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject, TextProperties } from '@/types/board'

interface TextElementProps {
  object: BoardObject
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
  stageRef: React.RefObject<Konva.Stage | null>
}

export default function TextElement({
  object,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
  stageRef,
}: TextElementProps) {
  const textRef = useRef<Konva.Text>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [isEditing, setIsEditing] = useState(false)
  const props = object.properties as unknown as TextProperties
  const text = props.text ?? ''
  const fontSize = props.fontSize ?? 18
  const fill = props.fill ?? '#1F2937'

  useEffect(() => {
    if (isSelected && transformerRef.current && textRef.current) {
      transformerRef.current.nodes([textRef.current])
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

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleTransformEnd = useCallback(() => {
    const node = textRef.current
    if (!node) return
    const scaleX = node.scaleX()
    node.scaleX(1)
    node.scaleY(1)
    onUpdate(object.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(20, node.width() * scaleX),
    })
  }, [object.id, onUpdate])

  // HTML textarea overlay for editing
  useEffect(() => {
    if (!isEditing || !stageRef.current) return

    const stage = stageRef.current
    const container = stage.container()
    const stageTransform = stage.getAbsoluteTransform().copy()
    const absPos = stageTransform.point({ x: object.x, y: object.y })
    const scale = stage.scaleX()

    const textarea = document.createElement('textarea')
    container.appendChild(textarea)

    textarea.value = text
    textarea.style.position = 'absolute'
    textarea.style.top = `${absPos.y}px`
    textarea.style.left = `${absPos.x}px`
    textarea.style.width = `${Math.max(100, object.width) * scale}px`
    textarea.style.minHeight = `${fontSize * scale * 1.5}px`
    textarea.style.fontSize = `${fontSize * scale}px`
    textarea.style.border = 'none'
    textarea.style.padding = '2px'
    textarea.style.margin = '0'
    textarea.style.overflow = 'hidden'
    textarea.style.background = 'transparent'
    textarea.style.outline = '2px solid #3B82F6'
    textarea.style.resize = 'none'
    textarea.style.lineHeight = '1.3'
    textarea.style.fontFamily = props.fontFamily ?? 'Arial, sans-serif'
    textarea.style.color = fill
    textarea.style.boxSizing = 'border-box'
    textarea.style.zIndex = '1000'

    textarea.focus()

    function handleBlur() {
      onUpdate(object.id, {
        properties: { ...object.properties, text: textarea.value },
      })
      textarea.remove()
      setIsEditing(false)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') textarea.blur()
    }

    textarea.addEventListener('blur', handleBlur)
    textarea.addEventListener('keydown', handleKeyDown)

    return () => {
      textarea.removeEventListener('blur', handleBlur)
      textarea.removeEventListener('keydown', handleKeyDown)
      if (textarea.parentNode) textarea.remove()
    }
  }, [isEditing, object, text, fontSize, fill, props.fontFamily, stageRef, onUpdate])

  return (
    <>
      <Text
        name={object.id}
        ref={textRef}
        x={object.x}
        y={object.y}
        width={object.width}
        text={text || 'Double-click to type'}
        fontSize={fontSize}
        fontFamily={props.fontFamily ?? 'Arial, sans-serif'}
        fill={text ? fill : '#9CA3AF'}
        lineHeight={1.3}
        wrap="word"
        draggable
        dragDistance={5}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      {isSelected && !isEditing && (
        <Transformer
          ref={transformerRef}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 30) return oldBox
            return newBox
          }}
        />
      )}
    </>
  )
}
