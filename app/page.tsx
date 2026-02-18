import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/ui/Dashboard'

export default async function Home() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: boards } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: false })

  return <Dashboard boards={boards ?? []} userEmail={user.email ?? ''} userId={user.id} />
}
