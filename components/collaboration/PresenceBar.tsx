'use client'

import type { PresenceUser } from '@/lib/hooks/usePresence'

interface PresenceBarProps {
  users: PresenceUser[]
  currentUserId: string
}

export default function PresenceBar({ users, currentUserId }: PresenceBarProps) {
  return (
    <div className="flex items-center gap-1.5">
      {users.map((user) => (
        <div
          key={user.userId}
          className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1"
          title={user.userId === currentUserId ? `${user.name} (you)` : user.name}
        >
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: user.color }}
          />
          <span className="max-w-[80px] truncate text-xs text-gray-600">
            {user.userId === currentUserId ? 'You' : user.name}
          </span>
        </div>
      ))}
    </div>
  )
}
