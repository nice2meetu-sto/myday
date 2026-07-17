import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path: '/', label: '홈' },
  { path: '/expense', label: '소비' },
  { path: '/hobby', label: '취미' },
  { path: '/todo', label: '할일' },
  { path: '/diary', label: '일기' },
]

// 키보드가 올라오면 탭바를 숨긴다 (키보드 위로 떠오르는 것 방지)
// 뷰포트 높이 비교는 안드로이드에서 layout viewport도 같이 줄어 감지가 안 되므로
// 입력 요소 포커스 여부로 판단한다 — 키보드 높이 설정과 무관하게 동작
const NO_KEYBOARD_TYPES = new Set([
  'checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color',
])
function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      if (el.tagName === 'INPUT')
        return !NO_KEYBOARD_TYPES.has((el as HTMLInputElement).type)
      return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
    }
    const update = () => {
      clearTimeout(t)
      // 입력창 사이 포커스 이동 시 깜빡임 방지용 짧은 지연
      t = setTimeout(() => setOpen(isTyping()), 80)
    }
    window.addEventListener('focusin', update)
    window.addEventListener('focusout', update)
    update()
    return () => {
      clearTimeout(t)
      window.removeEventListener('focusin', update)
      window.removeEventListener('focusout', update)
    }
  }, [])
  return open
}

export function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const keyboardOpen = useKeyboardOpen()
  const isActive = (p: string) =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  if (keyboardOpen) return null
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-[16px] pt-2 pointer-events-none">
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
