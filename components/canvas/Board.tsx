'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject } from '@/types/board'
import StickyNote from './StickyNote'
import Shape from './Shape'

interface BoardCanvasProps {
  objects: BoardObject[]
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
  onCursorMove: (canvasX: number, canvasY: number) => void
  stageRef: React.RefObject<Konva.Stage | null>
}

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.1

export default function BoardCanvas({
  objects,
  onUpdate,
  onDragMove,
  onCursorMove,
  stageRef,
}: BoardCanvasProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Measure container on mount
  const containerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        containerRef.current = node
        const { width, height } = node.getBoundingClientRect()
        setStageSize({ width, height })

        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            setStageSize({
              width: entry.contentRect.width,
              height: entry.contentRect.height,
            })
          }
        })
        resizeObserver.observe(node)
        return () => resizeObserver.disconnect()
      }
    },
    []
  )

  // Window-level pointermove listener for continuous cursor tracking.
  // Konva captures pointer events on its canvas during drag, preventing
  // container-level listeners from firing on passive hover. A window-level
  // listener fires on ALL pointer movement regardless of Konva's state.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePointerMove = (e: PointerEvent) => {
      const stage = stageRef.current
      if (!stage) return
      const rect = container.getBoundingClientRect()
      // Only process if pointer is within the board area
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) return
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const scale = stage.scaleX()
      const pos = stage.position()
      onCursorMove((screenX - pos.x) / scale, (screenY - pos.y) / scale)
    }

    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [stageRef, onCursorMove])

  // Zoom with scroll wheel
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      const oldScale = stage.scaleX()
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      }

      const direction = e.evt.deltaY > 0 ? -1 : 1
      const newScale =
        direction > 0
          ? Math.min(oldScale * ZOOM_FACTOR, MAX_SCALE)
          : Math.max(oldScale / ZOOM_FACTOR, MIN_SCALE)

      stage.scale({ x: newScale, y: newScale })
      stage.position({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      })
      stage.batchDraw()
    },
    [stageRef]
  )

  // Deselect when clicking empty area
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage()) {
        setSelectedId(null)
      }
    },
    []
  )

  return (
    <div
      ref={containerCallbackRef}
      className="h-full w-full"
      style={{ cursor: 'grab' }}
    >
      {stageSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          draggable
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          style={{ background: '#F9FAFB' }}
        >
          <Layer>
            {objects.map((obj) => {
              if (obj.type === 'sticky_note') {
                return (
                  <StickyNote
                    key={obj.id}
                    object={obj}
                    isSelected={selectedId === obj.id}
                    onSelect={() => setSelectedId(obj.id)}
                    onUpdate={onUpdate}
                    onDragMove={onDragMove}
                    stageRef={stageRef}
                  />
                )
              }
              if (obj.type === 'rectangle') {
                return (
                  <Shape
                    key={obj.id}
                    object={obj}
                    isSelected={selectedId === obj.id}
                    onSelect={() => setSelectedId(obj.id)}
                    onUpdate={onUpdate}
                    onDragMove={onDragMove}
                  />
                )
              }
              return null
            })}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
