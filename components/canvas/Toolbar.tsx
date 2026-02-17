'use client'

interface ToolbarProps {
  onCreateStickyNote: () => void
  onCreateRectangle: () => void
}

export default function Toolbar({
  onCreateStickyNote,
  onCreateRectangle,
}: ToolbarProps) {
  return (
    <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-md">
      <button
        onClick={onCreateStickyNote}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-yellow-50 hover:text-yellow-700"
        title="Add Sticky Note"
      >
        <span className="text-lg leading-none">📝</span>
        <span>Sticky Note</span>
      </button>
      <div className="w-px bg-gray-200" />
      <button
        onClick={onCreateRectangle}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700"
        title="Add Rectangle"
      >
        <span className="text-lg leading-none">▭</span>
        <span>Rectangle</span>
      </button>
    </div>
  )
}
