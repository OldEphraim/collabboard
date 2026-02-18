'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject } from '@/types/board'
import StickyNote from './StickyNote'
import Shape from './Shape'
import CircleShape from './CircleShape'
import LineShape from './LineShape'
import Connector from './Connector'
import TextElement from './TextElement'
import FrameComponent from './Frame'
import SelectionActions from './SelectionActions'

interface BoardCanvasProps {
  objects: BoardObject[]
  onUpdate: (id: string, updates: Partial<BoardObject>) => void
  onDragMove: (id: string, x: number, y: number) => void
  onCursorMove: (canvasX: number, canvasY: number) => void
  onDelete: (ids: string[]) => void
  onDuplicate: (objects: BoardObject[]) => void
  stageRef: React.RefObject<Konva.Stage | null>
  connectingFrom: string | null
  onConnectTo: (toId: string) => void
}

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.1

export default function BoardCanvas({
  objects,
  onUpdate,
  onDragMove,
  onCursorMove,
  onDelete,
  onDuplicate,
  stageRef,
  connectingFrom,
  onConnectTo,
}: BoardCanvasProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [stageDraggable, setStageDraggable] = useState(true)
  const [selectionRect, setSelectionRect] = useState<{
    x: number; y: number; width: number; height: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isShiftHeldRef = useRef(false)
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null)
  const justFinishedSelectionRef = useRef(false)

  const selectedObjects = objects.filter((o) => selectedIds.has(o.id))

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return

      if (e.key === 'Shift') {
        isShiftHeldRef.current = true
        setStageDraggable(false)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        onDelete(Array.from(selectedIds))
        setSelectedIds(new Set())
      }
      if (e.key === 'd' && (e.metaKey || e.ctrlKey) && selectedIds.size > 0) {
        e.preventDefault()
        onDuplicate(selectedObjects)
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
        if (connectingFrom) onConnectTo('')
      }
      // Copy: Ctrl/Cmd+C
      if (e.key === 'c' && (e.metaKey || e.ctrlKey) && selectedIds.size > 0) {
        sessionStorage.setItem(
          'collabboard-clipboard',
          JSON.stringify(selectedObjects)
        )
      }
      // Paste: Ctrl/Cmd+V
      if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
        const clip = sessionStorage.getItem('collabboard-clipboard')
        if (clip) {
          try {
            const objs = JSON.parse(clip) as BoardObject[]
            onDuplicate(objs)
          } catch { /* ignore */ }
        }
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftHeldRef.current = false
        setStageDraggable(true)
        // End any in-progress selection rect
        if (selectionStartRef.current) {
          finishSelectionRect()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedObjects, onDelete, onDuplicate, connectingFrom, onConnectTo])

  // Window-level pointermove for continuous cursor tracking
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePointerMove = (e: PointerEvent) => {
      const stage = stageRef.current
      if (!stage) return
      const rect = container.getBoundingClientRect()
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

  // Convert screen pointer position to canvas coords
  const pointerToCanvas = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    const scale = stage.scaleX()
    const stagePos = stage.position()
    return {
      x: (pos.x - stagePos.x) / scale,
      y: (pos.y - stagePos.y) / scale,
    }
  }, [stageRef])

  const finishSelectionRect = useCallback(() => {
    if (selectionRect && (selectionRect.width > 5 || selectionRect.height > 5)) {
      justFinishedSelectionRef.current = true
      const selected = objects.filter((obj) => {
        if (obj.type === 'connector') return false
        const objRight = obj.type === 'circle' ? obj.x + obj.width / 2 : obj.x + obj.width
        const objLeft = obj.type === 'circle' ? obj.x - obj.width / 2 : obj.x
        const objBottom = obj.type === 'circle' ? obj.y + obj.height / 2 : obj.y + obj.height
        const objTop = obj.type === 'circle' ? obj.y - obj.height / 2 : obj.y
        return (
          objLeft < selectionRect.x + selectionRect.width &&
          objRight > selectionRect.x &&
          objTop < selectionRect.y + selectionRect.height &&
          objBottom > selectionRect.y
        )
      })
      setSelectedIds(new Set(selected.map((o) => o.id)))
    }
    setSelectionRect(null)
    selectionStartRef.current = null
  }, [selectionRect, objects])

  // Stage mouse handlers for selection rectangle
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return
      if (!isShiftHeldRef.current) return
      const canvasPos = pointerToCanvas()
      if (!canvasPos) return
      selectionStartRef.current = canvasPos
      setSelectionRect({ x: canvasPos.x, y: canvasPos.y, width: 0, height: 0 })
    },
    [pointerToCanvas]
  )

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!selectionStartRef.current) return
      e.evt.preventDefault()
      const canvasPos = pointerToCanvas()
      if (!canvasPos) return
      const start = selectionStartRef.current
      setSelectionRect({
        x: Math.min(start.x, canvasPos.x),
        y: Math.min(start.y, canvasPos.y),
        width: Math.abs(canvasPos.x - start.x),
        height: Math.abs(canvasPos.y - start.y),
      })
    },
    [pointerToCanvas]
  )

  const handleStageMouseUp = useCallback(() => {
    if (selectionStartRef.current) {
      finishSelectionRect()
    }
  }, [finishSelectionRect])

  // Click empty area to deselect
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (justFinishedSelectionRef.current) {
        justFinishedSelectionRef.current = false
        return
      }
      if (e.target === e.target.getStage()) {
        setSelectedIds(new Set())
      }
    },
    []
  )

  // Object selection handler (supports shift+click multi-select & connector mode)
  const handleObjectSelect = useCallback(
    (id: string) => {
      if (connectingFrom) {
        if (connectingFrom !== id) {
          onConnectTo(id)
        }
        return
      }
      setSelectedIds((prev) => {
        if (isShiftHeldRef.current) {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }
        return new Set([id])
      })
    },
    [connectingFrom, onConnectTo]
  )

  // Sort objects: frames first (background), then connectors, then everything else
  const sortedObjects = [...objects].sort((a, b) => {
    const order = (t: string) =>
      t === 'frame' ? 0 : t === 'connector' ? 1 : 2
    return order(a.type) - order(b.type) || a.z_index - b.z_index
  })

  return (
    <div
      ref={containerCallbackRef}
      className="h-full w-full"
      style={{ cursor: connectingFrom ? 'crosshair' : 'grab' }}
    >
      {stageSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          draggable={stageDraggable}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          style={{ background: '#F9FAFB' }}
        >
          <Layer>
            {sortedObjects.map((obj) => {
              if (obj.type === 'frame') {
                return (
                  <FrameComponent
                    key={obj.id}
                    object={obj}
                    isSelected={selectedIds.has(obj.id)}
                    onSelect={() => handleObjectSelect(obj.id)}
                    onUpdate={onUpdate}
                    onDragMove={onDragMove}
                  />
                )
              }
              if (obj.type === 'connector') {
                return (
                  <Connector
                    key={obj.id}
                    object={obj}
                    objects={objects}
                    isSelected={selectedIds.has(obj.id)}
                    onSelect={() => handleObjectSelect(obj.id)}
                    onUpdate={onUpdate}
                  />
                )
              }
              if (obj.type === 'sticky_note') {
                return (
                  <StickyNote
                    key={obj.id}
                    object={obj}
                    isSelected={selectedIds.has(obj.id)}
                    onSelect={() => handleObjectSelect(obj.id)}
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
                    isSelected={selectedIds.has(obj.id)}
                    onSelect={() => handleObjectSelect(obj.id)}
                    onUpdate={onUpdate}
                    onDragMove={onDragMove}
                  />
                )
              }
              if (obj.type === 'circle') {
                return (
                  <CircleShape
                    key={obj.id}
                    object={obj}
                    isSelected={selectedIds.has(obj.id)}
                    onSelect={() => handleObjectSelect(obj.id)}
                    onUpdate={onUpdate}
                    onDragMove={onDragMove}
                  />
                )
              }
              if (obj.type === 'line') {
                return (
                  <LineShape
                    key={obj.id}
                    object={obj}
                    isSelected={selectedIds.has(obj.id)}
                    onSelect={() => handleObjectSelect(obj.id)}
                    onUpdate={onUpdate}
                    onDragMove={onDragMove}
                  />
                )
              }
              if (obj.type === 'text') {
                return (
                  <TextElement
                    key={obj.id}
                    object={obj}
                    isSelected={selectedIds.has(obj.id)}
                    onSelect={() => handleObjectSelect(obj.id)}
                    onUpdate={onUpdate}
                    onDragMove={onDragMove}
                    stageRef={stageRef}
                  />
                )
              }
              return null
            })}
            {/* Selection rectangle */}
            {selectionRect && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="rgba(59, 130, 246, 0.1)"
                stroke="#3B82F6"
                strokeWidth={1}
                dash={[4, 4]}
              />
            )}
          </Layer>
        </Stage>
      )}
      {/* Selection actions bar (HTML overlay) */}
      <SelectionActions
        selectedObjects={selectedObjects}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
      {/* Connector mode indicator */}
      {connectingFrom && (
        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 shadow">
          Click a target object to connect, or press Escape to cancel
        </div>
      )}
    </div>
  )
}
