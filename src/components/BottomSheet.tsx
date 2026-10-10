import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const FIELDS = 'input, textarea, select, [contenteditable="true"]'

/**
 * 상단 고정 팝업 — 화면 위 7dvh 부터 떠 있어서 키보드가 올라와도 움직이지 않는다.
 * 위치는 내용에 따라:
 *  - 입력칸이 있는 팝업 → 위쪽 고정 (키보드에 안 걸리게)
 *  - 조회만 하는 팝업 → 남는 공간 안에서 세로 가운데
 * anchor 로 직접 지정할 수도 있다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  anchor,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  anchor?: 'top' | 'center'
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  // 기본값은 상단 — 입력 팝업이 깜빡이며 올라가는 일이 없게
  const [hasField, setHasField] = useState(true)
  /**
   * 팝업을 연 탭의 pointerup 뒤에 따라오는 click 이 갓 그려진 팝업에 떨어지는 걸 막는다.
   * (할일 카드를 탭했는데 그 자리에 생긴 '완료' 버튼이나 덮개가 같이 눌리던 문제)
   */
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!open) {
      setArmed(false)
      return
    }
    const t = setTimeout(() => setArmed(true), 250)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // 입력칸 유무 감지 — 조건부로 나중에 생기는 입력칸(반복 설정 등)도 따라가게 관찰
  useLayoutEffect(() => {
    if (!open || anchor) return
    const el = boxRef.current
    if (!el) return
    const check = () => setHasField(!!el.querySelector(FIELDS))
    check()
    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [open, anchor])

  const pinTop = anchor ? anchor === 'top' : hasField

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={`fixed inset-0 bg-black/35 z-40 ${armed ? '' : 'pointer-events-none'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* 위아래 여백을 뺀 영역 안에서 정렬 — 가운데라도 최대 높이(83dvh)에
              걸리면 결국 위쪽 7dvh 에 딱 붙는다 */}
          <div
            className={`fixed inset-0 z-50 flex justify-center pointer-events-none ${
              pinTop ? 'items-start' : 'items-center'
            }`}
            style={{ paddingTop: '7dvh', paddingBottom: '10dvh' }}
          >
            <motion.div
              ref={boxRef}
              className={`w-[92%] max-w-[440px] bg-white rounded-[26px] px-5 pt-4 pb-6 overflow-y-auto border border-black/10 ${
                armed ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              style={{ maxHeight: '83dvh' }}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onFocusCapture={(e) => {
                const t = e.target as HTMLElement
                if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
                  setTimeout(() => t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 200)
                }
              }}
            >
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-[16px] font-extrabold m-0 tracking-tight">{title ?? ''}</h2>
                <button
                  className="w-[28px] h-[28px] rounded-full border-0 bg-[#F2F2EF] text-sub text-[13px] font-bold flex items-center justify-center"
                  onClick={onClose}
                >
                  ✕
                </button>
              </div>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
