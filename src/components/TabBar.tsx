import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path: '/', label: '홈' },
  { path: '/expense', label: '소비' },
  { path: '/hobby', label: '취미' },
  { path: '/todo', label: '할일' },
  { path: '/diary', label: '일기' },
]

export function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const isActive = (p: string) =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-[26px] pt-2 pointer-events-none">
      <div className="mx-auto max-w-[420px] bg-white/45 backdrop-blur-xl backdrop-saturate-150 border border-white/50 rounded-[26px] p-[5px] flex pointer-events-auto shadow-[inset_0_1px_0_rgba(255,255,255,.5)]">
        {TABS.map((t) => (
          <button
            key={t.path}
            className={`flex-1 border-0 py-[9px] rounded-[22px] text-[11px] font-bold transition-all ${
              isActive(t.path) ? 'bg-acc text-white' : 'bg-transparent text-sub'
            }`}
            onClick={() => {
              if (isActive(t.path)) {
                window.dispatchEvent(new Event(`tab-retap:${t.path}`))
              } else {
                nav(t.path)
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
