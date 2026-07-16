import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useSession, Login, KeySetup } from './auth/Auth'
import { getStoredAnonKey } from './lib/supabase'
import { ensureRecurrences } from './lib/recurrence'
import { seedDefaults } from './lib/seed'
import { TabBar } from './components/TabBar'
import { Toast } from './components/Toast'
import HomePage from './pages/Home'
import ExpensePage from './pages/Expense'
import ExpenseEditPage from './pages/ExpenseEdit'
import HobbyPage from './pages/Hobby'
import BookDetailPage from './pages/BookDetail'
import TodoPage from './pages/Todo'
import DiaryPage from './pages/Diary'

export default function App() {
  const { session, loading } = useSession()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!session) return
    ;(window as unknown as { __uid: string }).__uid = session.user.id
    ;(async () => {
      try {
        await seedDefaults(session.user.id)
        await ensureRecurrences(session.user.id)
      } catch (e) {
        console.error('startup sync failed', e)
      }
      setReady(true)
    })()
  }, [session?.user.id])

  if (!getStoredAnonKey()) return <KeySetup />
  if (loading) return <div className="min-h-screen" />
  if (!session) return <Login />
  if (!ready)
    return (
      <div className="min-h-screen flex items-center justify-center text-sub text-[13px] font-semibold">
        불러오는 중…
      </div>
    )

  return (
    <div className="mx-auto max-w-[520px] min-h-screen px-4 pb-[100px] pt-1">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/expense" element={<ExpensePage />} />
        <Route path="/expense/edit" element={<ExpenseEditPage />} />
        <Route path="/hobby" element={<HobbyPage />} />
        <Route path="/hobby/:bookId" element={<BookDetailPage />} />
        <Route path="/todo" element={<TodoPage />} />
        <Route path="/diary" element={<DiaryPage />} />
      </Routes>
      <TabBar />
      <Toast />
    </div>
  )
}
