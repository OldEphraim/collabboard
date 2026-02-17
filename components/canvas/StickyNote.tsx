'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject, StickyNoteProperties } from '@/types/board'

interface StickyNoteProps {
  object: BoardObject
  isSelected: boolean
  onSelect: () => void
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
  stageRef: React.RefObject<Konva.Stage | null>
}

const STICKY_COLORS: Record<string, string> = {
  yellow: '#FEF08A',
  blue: '#93C5FD',
  green: '#86EFAC',
  pink: '#FDA4AF',
  purple: '#C4B5FD',
  orange: '#FED7AA',
}

export default function StickyNote({
  object,
  isSelected,
  onSelect,
  onUpdate,
  onDragMove,
  stageRef,
}: StickyNoteProps) {
  const textRef = useRef<Konva.Text>(null)
  const [isEditing, setIsEditing] = useState(false)
  const props = object.properties as unknown as StickyNoteProperties
  const color = STICKY_COLORS[props.color] ?? props.color ?? STICKY_COLORS.yellow
  const text = props.text ?? ''
  const fontSize = props.fontSize ?? 14

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

  // HTML textarea overlay for editing
  useEffect(() => {
    if (!isEditing || !stageRef.current) return

    const stage = stageRef.current
    const container = stage.container()
    const stageBox = container.getBoundingClientRect()
    const stageTransform = stage.getAbsoluteTransform().copy()
    // Get the absolute position of this object on screen
    const absPos = stageTransform.point({ x: object.x, y: object.y })

    const textarea = document.createElement('textarea')
    container.appendChild(textarea)

    const scale = stage.scaleX()

    textarea.value = text
    textarea.style.position = 'absolute'
    textarea.style.top = `${absPos.y}px`
    textarea.style.left = `${absPos.x}px`
    textarea.style.width = `${object.width * scale}px`
    textarea.style.height = `${object.height * scale}px`
    textarea.style.fontSize = `${fontSize * scale}px`
    textarea.style.border = 'none'
    textarea.style.padding = '8px'
    textarea.style.margin = '0'
    textarea.style.overflow = 'hidden'
    textarea.style.background = color
    textarea.style.outline = '2px solid #3B82F6'
    textarea.style.resize = 'none'
    textarea.style.lineHeight = '1.3'
    textarea.style.fontFamily = 'Arial, sans-serif'
    textarea.style.boxSizing = 'border-box'
    textarea.style.zIndex = '1000'

    textarea.focus()

    function handleBlur() {
      const newText = textarea.value
      onUpdate(object.id, {
        properties: { ...object.properties, text: newText },
      })
      textarea.remove()
      setIsEditing(false)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        textarea.blur()
      }
    }

    textarea.addEventListener('blur', handleBlur)
    textarea.addEventListener('keydown', handleKeyDown)

    return () => {
      textarea.removeEventListener('blur', handleBlur)
      textarea.removeEventListener('keydown', handleKeyDown)
      if (textarea.parentNode) textarea.remove()
    }
  }, [isEditing, object, text, fontSize, color, stageRef, onUpdate])

  return (
    <Group
      x={object.x}
      y={object.y}
      draggable
      dragDistance={5}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={handleDoubleClick}
      onDblTap={handleDoubleClick}
    >
      {/* Shadow */}
      <Rect
        width={object.width}
        height={object.height}
        fill="rgba(0,0,0,0.08)"
        cornerRadius={4}
        x={2}
        y={2}
      />
      {/* Background */}
      <Rect
        width={object.width}
        height={object.height}
        fill={color}
        cornerRadius={4}
        stroke={isSelected ? '#3B82F6' : 'rgba(0,0,0,0.1)'}
        strokeWidth={isSelected ? 2 : 1}
      />
      {/* Text */}
      {!isEditing && (
        <Text
          ref={textRef}
          text={text || 'Double-click to edit'}
          width={object.width - 16}
          height={object.height - 16}
          x={8}
          y={8}
          fontSize={fontSize}
          fontFamily="Arial, sans-serif"
          fill={text ? '#1F2937' : '#9CA3AF'}
          lineHeight={1.3}
          wrap="word"
          ellipsis
        />
      )}
    </Group>
  )
}

export { STICKY_COLORS }
