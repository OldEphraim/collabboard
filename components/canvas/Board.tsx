'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type Konva from 'konva'
import type { BoardObject, FrameProperties } from '@/types/board'
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
  highContrast?: boolean
}

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.1

// Check if an object's center is inside a frame's bounds
function isInsideFrame(obj: BoardObject, frame: BoardObject): boolean {
  const objCenterX = obj.type === 'circle' ? obj.x : obj.x + obj.width / 2
  const objCenterY = obj.type === 'circle' ? obj.y : obj.y + obj.height / 2
  return (
    objCenterX >= frame.x &&
    objCenterX <= frame.x + frame.width &&
    objCenterY >= frame.y &&
    objCenterY <= frame.y + frame.height
  )
}

// Recursively collect objects inside a locked frame (handles nested locked frames)
function collectLockedFrameContents(
  frame: BoardObject,
  allObjects: BoardObject[],
  collected: Map<string, { x: number; y: number }>
) {
  for (const obj of allObjects) {
    if (collected.has(obj.id) || obj.type === 'connector' || obj.id === frame.id) continue
    if (isInsideFrame(obj, frame)) {
      collected.set(obj.id, { x: obj.x, y: obj.y })
      if (obj.type === 'frame' && (obj.properties as unknown as FrameProperties).locked) {
        collectLockedFrameContents(obj, allObjects, collected)
      }
    }
  }
}

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
  highContrast,
}: BoardCanvasProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [focusedObjectId, setFocusedObjectId] = useState<string | null>(null)
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

  // Multi-drag tracking: records start positions when dragging multiple objects
  const multiDragRef = useRef<{
    draggedId: string
    startPositions: Map<string, { x: number; y: number }>
  } | null>(null)
  // Use refs for current values to avoid stale closures in drag callbacks
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const objectsRef = useRef(objects)
  objectsRef.current = objects

  // Navigable objects (exclude connectors) sorted by z_index
  const navigableObjects = [...objects]
    .filter((o) => o.type !== 'connector')
    .sort((a, b) => a.z_index - b.z_index)

  // Wrapped drag-move handler: moves all selected/locked-frame objects together
  const handleObjectDragMove = useCallback(
    (id: string, x: number, y: number) => {
      // Always broadcast the primary dragged object
      onDragMove(id, x, y)

      // Initialize multi-drag on first move
      if (!multiDragRef.current) {
        const currentSelectedIds = selectedIdsRef.current
        const currentObjects = objectsRef.current
        const startPositions = new Map<string, { x: number; y: number }>()

        // Multi-select: include all selected objects
        if (currentSelectedIds.has(id) && currentSelectedIds.size > 1) {
          for (const obj of currentObjects) {
            if (currentSelectedIds.has(obj.id)) {
              startPositions.set(obj.id, { x: obj.x, y: obj.y })
            }
          }
        }

        // Locked frame: include contained objects
        const draggedObj = currentObjects.find((o) => o.id === id)
        if (
          draggedObj?.type === 'frame' &&
          (draggedObj.properties as unknown as FrameProperties).locked
        ) {
          if (!startPositions.has(id)) {
            startPositions.set(id, { x: draggedObj.x, y: draggedObj.y })
          }
          collectLockedFrameContents(draggedObj, currentObjects, startPositions)
        }

        // Check locked frames in multi-selection
        for (const [selId] of startPositions) {
          if (selId === id) continue
          const selObj = currentObjects.find((o) => o.id === selId)
          if (
            selObj?.type === 'frame' &&
            (selObj.properties as unknown as FrameProperties).locked
          ) {
            collectLockedFrameContents(selObj, currentObjects, startPositions)
          }
        }

        // Only set up multi-drag if there are extra objects to move
        if (startPositions.size > 1) {
          if (!startPositions.has(id)) {
            const obj = currentObjects.find((o) => o.id === id)
            if (obj) startPositions.set(id, { x: obj.x, y: obj.y })
          }
          multiDragRef.current = { draggedId: id, startPositions }
        }
      }

      // Move sibling objects via direct Konva node manipulation
      const multi = multiDragRef.current
      if (multi && multi.draggedId === id) {
        const start = multi.startPositions.get(id)
        if (!start) return
        const dx = x - start.x
        const dy = y - start.y
        const stage = stageRef.current
        if (!stage) return

        for (const [otherId, otherStart] of multi.startPositions) {
          if (otherId === id) continue
          const newX = otherStart.x + dx
          const newY = otherStart.y + dy
          const node = stage.findOne('.' + otherId)
          if (node) {
            node.position({ x: newX, y: newY })
          }
        }
      }
    },
    [onDragMove, stageRef]
  )

  // Wrapped update handler: on drag-end, persists sibling positions
  const handleObjectUpdate = useCallback(
    (id: string, updates: Partial<BoardObject>) => {
      onUpdate(id, updates)

      const multi = multiDragRef.current
      if (
        multi &&
        multi.draggedId === id &&
        'x' in updates &&
        'y' in updates &&
        !('width' in updates)
      ) {
        const start = multi.startPositions.get(id)
        if (start) {
          const dx = (updates.x as number) - start.x
          const dy = (updates.y as number) - start.y

          for (const [otherId, otherStart] of multi.startPositions) {
            if (otherId !== id) {
              onUpdate(otherId, {
                x: otherStart.x + dx,
                y: otherStart.y + dy,
              })
            }
          }
        }
        multiDragRef.current = null
      }
    },
    [onUpdate]
  )

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
        setFocusedObjectId(null)
      }
      if (e.key === 'd' && (e.metaKey || e.ctrlKey) && selectedIds.size > 0) {
        e.preventDefault()
        onDuplicate(selectedObjects)
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
        setFocusedObjectId(null)
        if (connectingFrom) onConnectTo('')
      }
      // Select all: Ctrl/Cmd+A
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const allIds = new Set(navigableObjects.map((o) => o.id))
        setSelectedIds(allIds)
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
      // Tab / Shift+Tab: cycle through objects
      if (e.key === 'Tab' && navigableObjects.length > 0) {
        e.preventDefault()
        const currentIndex = focusedObjectId
          ? navigableObjects.findIndex((o) => o.id === focusedObjectId)
          : -1
        let nextIndex: number
        if (e.shiftKey) {
          nextIndex = currentIndex <= 0 ? navigableObjects.length - 1 : currentIndex - 1
        } else {
          nextIndex = currentIndex >= navigableObjects.length - 1 ? 0 : currentIndex + 1
        }
        const nextObj = navigableObjects[nextIndex]
        setFocusedObjectId(nextObj.id)
        setSelectedIds(new Set([nextObj.id]))
      }
      // Arrow keys: move selected objects
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.size > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 20 : 5
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowUp') dy = -step
        if (e.key === 'ArrowDown') dy = step
        if (e.key === 'ArrowLeft') dx = -step
        if (e.key === 'ArrowRight') dx = step
        for (const obj of selectedObjects) {
          handleObjectUpdate(obj.id, { x: obj.x + dx, y: obj.y + dy })
        }
      }
      // Enter: start editing focused object
      if (e.key === 'Enter' && focusedObjectId && !e.metaKey && !e.ctrlKey) {
        const focusedObj = objects.find((o) => o.id === focusedObjectId)
        if (focusedObj && (focusedObj.type === 'sticky_note' || focusedObj.type === 'text')) {
          e.preventDefault()
          const stage = stageRef.current
          if (stage) {
            const node = stage.findOne('.' + focusedObjectId)
            if (node) {
              node.fire('dblclick')
            }
          }
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
  }, [selectedIds, selectedObjects, onDelete, onDuplicate, connectingFrom, onConnectTo, focusedObjectId, navigableObjects, objects, handleObjectUpdate, stageRef])

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
        setFocusedObjectId(null)
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
      setFocusedObjectId(id)
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

  // Get focus ring position for the focused object
  const focusedObj = focusedObjectId ? objects.find((o) => o.id === focusedObjectId) : null

  return (
    <div
      ref={containerCallbackRef}
      tabIndex={0}
      role="application"
      aria-label="Whiteboard canvas. Use Tab to cycle through objects, arrow keys to move, Enter to edit, Delete to remove."
      className="h-full w-full outline-none"
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
          style={{ background: highContrast ? '#FFFFFF' : '#F9FAFB' }}
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
                    onUpdate={handleObjectUpdate}
                    onDragMove={handleObjectDragMove}
                    highContrast={highContrast}
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
                    onUpdate={handleObjectUpdate}
                    highContrast={highContrast}
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
                    onUpdate={handleObjectUpdate}
                    onDragMove={handleObjectDragMove}
                    stageRef={stageRef}
                    highContrast={highContrast}
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
                    onUpdate={handleObjectUpdate}
                    onDragMove={handleObjectDragMove}
                    highContrast={highContrast}
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
                    onUpdate={handleObjectUpdate}
                    onDragMove={handleObjectDragMove}
                    highContrast={highContrast}
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
                    onUpdate={handleObjectUpdate}
                    onDragMove={handleObjectDragMove}
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
                    onUpdate={handleObjectUpdate}
                    onDragMove={handleObjectDragMove}
                    stageRef={stageRef}
                  />
                )
              }
              return null
            })}
            {/* Focus ring for keyboard-focused object */}
            {focusedObj && (
              <Rect
                x={focusedObj.type === 'circle' ? focusedObj.x - focusedObj.width / 2 - 4 : focusedObj.x - 4}
                y={focusedObj.type === 'circle' ? focusedObj.y - focusedObj.height / 2 - 4 : focusedObj.y - 4}
                width={focusedObj.width + 8}
                height={focusedObj.height + 8}
                stroke="#3B82F6"
                strokeWidth={2}
                dash={[6, 3]}
                listening={false}
              />
            )}
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
        onUpdate={handleObjectUpdate}
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
