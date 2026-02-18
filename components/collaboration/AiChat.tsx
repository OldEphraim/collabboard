'use client'

import { useState, useRef, useEffect } from 'react'
import type { BoardObject } from '@/types/board'

interface AiResult {
  action: 'create' | 'update' | 'delete'
  object: BoardObject
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AiChatProps {
  boardId: string
  onResults: (results: AiResult[]) => void
}

export default function AiChat({ boardId, onResults }: AiChatProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const res = await fetch('/api/ai-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, boardId }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.error || 'Something went wrong'}` },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.message || 'Done.' },
        ])
        if (data.results?.length > 0) {
          onResults(data.results)
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Network error'}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg hover:bg-purple-700 transition-colors"
        title="AI Assistant"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="absolute bottom-4 right-4 z-30 flex w-80 flex-col rounded-lg border border-gray-200 bg-white shadow-xl" style={{ maxHeight: '60vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-900">AI Assistant</span>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ minHeight: '120px', maxHeight: '40vh' }}>
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 py-4 text-center">
            Ask me to create, modify, or arrange objects on the board.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm rounded-md px-2.5 py-1.5 ${
              msg.role === 'user'
                ? 'ml-6 bg-purple-50 text-purple-900'
                : 'mr-6 bg-gray-50 text-gray-800'
            }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="mr-6 flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-sm text-gray-400">
            <span className="animate-pulse">Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 px-3 py-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Create a SWOT analysis"
            disabled={loading}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
