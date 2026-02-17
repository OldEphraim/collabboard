'use client'

import dynamic from 'next/dynamic'
import type { Board } from '@/types/board'

const BoardWrapper = dynamic(
  () => import('@/components/canvas/BoardWrapper'),
  { ssr: false }
)

interface BoardLoaderProps {
  board: Board
  userId: string
  userEmail: string
}

export default function BoardLoader({ board, userId, userEmail }: BoardLoaderProps) {
  return <BoardWrapper board={board} userId={userId} userEmail={userEmail} />
}
