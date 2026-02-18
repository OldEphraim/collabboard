'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Board } from '@/types/board'

export default function Dashboard({
  boards: initialBoards,
  userEmail,
  userId,
}: {
  boards: Board[]
  userEmail: string
  userId: string
}) {
  const [boards, setBoards] = useState(initialBoards)
  const [creating, setCreating] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleCreateBoard() {
    const name = newBoardName.trim() || 'Untitled Board'
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }

    const { data, error } = await supabase
      .from('boards')
      .insert({ name, created_by: user.id })
      .select()
      .single()

    if (data && !error) {
      router.push(`/board/${data.id}`)
    }
    setCreating(false)
    setShowCreateInput(false)
    setNewBoardName('')
  }

  async function handleRename(boardId: string) {
    const name = renameValue.trim()
    if (!name) { setRenamingId(null); return }

    const { error } = await supabase
      .from('boards')
      .update({ name })
      .eq('id', boardId)

    if (!error) {
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, name } : b))
      )
    }
    setRenamingId(null)
  }

  async function handleDelete(boardId: string) {
    const { error } = await supabase
      .from('boards')
      .delete()
      .eq('id', boardId)

    if (!error) {
      setBoards((prev) => prev.filter((b) => b.id !== boardId))
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">CollabBoard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{userEmail}</span>
            <button
              onClick={handleSignOut}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Your Boards</h2>
          {showCreateInput ? (
            <form
              onSubmit={(e) => { e.preventDefault(); handleCreateBoard() }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="Board name"
                autoFocus
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateInput(false); setNewBoardName('') }}
                className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowCreateInput(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + New Board
            </button>
          )}
        </div>

        {boards.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <p className="text-sm text-gray-500">
              No boards yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => {
              const isOwner = board.created_by === userId
              const isRenaming = renamingId === board.id
              return (
                <div
                  key={board.id}
                  className="group relative rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  {isRenaming ? (
                    /* Rename mode — no navigation, full card is the form */
                    <div className="p-6">
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleRename(board.id) }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { setRenamingId(null) }
                          }}
                          autoFocus
                          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          className="rounded p-1 text-green-600 hover:bg-green-50"
                          title="Confirm rename"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="rounded p-1 text-red-500 hover:bg-red-50"
                          title="Cancel rename"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                          </svg>
                        </button>
                      </form>
                      <p className="mt-2 text-xs text-gray-400">
                        {new Date(board.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    /* Normal mode — clickable card */
                    <button
                      onClick={() => router.push(`/board/${board.id}`)}
                      className="w-full p-6 text-left"
                    >
                      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {isOwner ? 'Your board' : 'Shared'}
                      </p>
                      <h3 className="font-medium text-gray-900">{board.name}</h3>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(board.created_at).toLocaleDateString()}
                      </p>
                    </button>
                  )}
                  {isOwner && !isRenaming && (
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingId(board.id)
                          setRenameValue(board.name)
                        }}
                        className="rounded p-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Rename"
                      >
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete "${board.name}"?`)) {
                            handleDelete(board.id)
                          }
                        }}
                        className="rounded p-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
