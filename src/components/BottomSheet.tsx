import { ReactNode, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// 상단 고정 팝업 — 화면 위 7% 지점부터 떠 있어서 키보드가 올라와도 움직이지 않는다
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/35 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed left-1/2 top-[7dvh] z-50 w-[92%] max-w-[440px] bg-white rounded-[26px] px-5 pt-4 pb-6 overflow-y-auto border border-black/10"
            style={{ x: '-50%', maxHeight: '83dvh' }}
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
        </>
      )}
    </AnimatePresence>
  )
}
