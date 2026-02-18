'use client'

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
  return (
    <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-md">
      <button
        onClick={onCreateStickyNote}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-yellow-50 hover:text-yellow-700"
        title="Add Sticky Note"
      >
        <span className="text-sm leading-none">📝</span>
        <span>Note</span>
      </button>
      <div className="w-px bg-gray-200" />
      <button
        onClick={onCreateRectangle}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700"
        title="Add Rectangle"
      >
        <span className="text-sm leading-none">▭</span>
        <span>Rect</span>
      </button>
      <button
        onClick={onCreateCircle}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700"
        title="Add Circle"
      >
        <span className="text-sm leading-none">○</span>
        <span>Circle</span>
      </button>
      <button
        onClick={onCreateLine}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
        title="Add Line"
      >
        <span className="text-sm leading-none">╱</span>
        <span>Line</span>
      </button>
      <div className="w-px bg-gray-200" />
      <button
        onClick={onCreateText}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
        title="Add Text"
      >
        <span className="text-sm leading-none">T</span>
        <span>Text</span>
      </button>
      <button
        onClick={onCreateFrame}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
        title="Add Frame"
      >
        <span className="text-sm leading-none">⬜</span>
        <span>Frame</span>
      </button>
      <div className="w-px bg-gray-200" />
      <button
        onClick={onStartConnector}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
          connectingFrom
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        title="Connect two objects"
      >
        <span className="text-sm leading-none">↗</span>
        <span>Connect</span>
      </button>
    </div>
  )
}
