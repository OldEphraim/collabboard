import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BoardLoader from '@/components/canvas/BoardLoader'
import type { Board } from '@/types/board'

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: board } = await supabase
    .from('boards')
    .select('*')
    .eq('id', id)
    .single()

  if (!board) {
    notFound()
  }

  return (
    <BoardLoader
      board={board as Board}
      userId={user.id}
      userEmail={user.email ?? 'Anonymous'}
    />
  )
}
