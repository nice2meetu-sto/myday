import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useSession, Login, KeySetup } from './auth/Auth'
import { getStoredAnonKey, sb } from './lib/supabase'
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

function DbSetupNeeded({ detail }: { detail: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] bg-white rounded-card shadow-card p-6">
        <h1 className="text-[20px] font-extrabold m-0 mb-2">⚠️ DB 설정이 필요해요</h1>
        <p className="text-[13px] leading-relaxed text-[#444]">
          데이터 테이블이 아직 만들어지지 않았어요. 딱 한 번만 해주면 됩니다:
        </p>
        <ol className="text-[13px] leading-relaxed text-[#444] pl-5 my-3">
          <li>
            Supabase 대시보드 → <b>SQL Editor</b> 열기
          </li>
          <li>
            GitHub 저장소의 <b>supabase/migration.sql</b> 내용 전체를 복사해 붙여넣기
          </li>
          <li>
            <b>Run</b> 실행 → "Success" 확인
          </li>
        </ol>
        <p className="text-[11px] text-sub leading-relaxed break-all">오류 상세: {detail}</p>
        <button
          className="w-full border-0 bg-ink text-white rounded-[14px] py-[13px] font-bold text-[13px] mt-3"
          onClick={() => location.reload()}
        >
          완료했어요 · 다시 확인
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { session, loading } = useSession()
  const [ready, setReady] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    ;(window as unknown as { __uid: string }).__uid = session.user.id
    ;(async () => {
      // 테이블 존재 여부 프로브 — 마이그레이션 미실행이면 안내 화면으로
      const probe = await sb().from('categories').select('id').limit(1)
      if (probe.error) {
        setDbError(probe.error.message)
        return
      }
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
  if (dbError) return <DbSetupNeeded detail={dbError} />
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
