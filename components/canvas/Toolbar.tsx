'use client'

import { useHighContrast } from '@/lib/hooks/useHighContrast'

interface ToolbarProps {
  onCreateStickyNote: () => void
  onCreateRectangle: () => void
  onCreateCircle: () => void
  onCreateLine: () => void
  onCreateText: () => void
  onCreateFrame: () => void
  onStartConnector: () => void
  connectingFrom: string | null
}

export default function Toolbar({
  onCreateStickyNote,
  onCreateRectangle,
  onCreateCircle,
  onCreateLine,
  onCreateText,
  onCreateFrame,
  onStartConnector,
  connectingFrom,
}: ToolbarProps) {
  const highContrast = useHighContrast()
  const hcBorder = highContrast ? ' border-2 border-gray-900' : ''
  const focusRing = 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'

  return (
    <div
      role="toolbar"
      aria-label="Board creation tools"
      className={`absolute left-4 top-4 z-10 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-md${hcBorder}`}
    >
      <button
        onClick={onCreateStickyNote}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-yellow-50 hover:text-yellow-700 ${focusRing}`}
        aria-label="Add sticky note"
      >
        <span className="text-sm leading-none" aria-hidden="true">&#x1F4DD;</span>
        <span>Note</span>
      </button>
      <div className="w-px bg-gray-200" aria-hidden="true" />
      <button
        onClick={onCreateRectangle}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 ${focusRing}`}
        aria-label="Add rectangle"
      >
        <span className="text-sm leading-none" aria-hidden="true">&#x25AD;</span>
        <span>Rect</span>
      </button>
      <button
        onClick={onCreateCircle}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 ${focusRing}`}
        aria-label="Add circle"
      >
        <span className="text-sm leading-none" aria-hidden="true">&#x25CB;</span>
        <span>Circle</span>
      </button>
      <button
        onClick={onCreateLine}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 ${focusRing}`}
        aria-label="Add line"
      >
        <span className="text-sm leading-none" aria-hidden="true">&#x2571;</span>
        <span>Line</span>
      </button>
      <div className="w-px bg-gray-200" aria-hidden="true" />
      <button
        onClick={onCreateText}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 ${focusRing}`}
        aria-label="Add text"
      >
        <span className="text-sm leading-none" aria-hidden="true">T</span>
        <span>Text</span>
      </button>
      <button
        onClick={onCreateFrame}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 ${focusRing}`}
        aria-label="Add frame"
      >
        <span className="text-sm leading-none" aria-hidden="true">&#x2B1C;</span>
        <span>Frame</span>
      </button>
      <div className="w-px bg-gray-200" aria-hidden="true" />
      <button
        onClick={onStartConnector}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
          connectingFrom
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
        } ${focusRing}`}
        aria-label="Connect two objects"
        aria-pressed={!!connectingFrom}
      >
        <span className="text-sm leading-none" aria-hidden="true">&#x2197;</span>
        <span>Connect</span>
      </button>
    </div>
  )
}
