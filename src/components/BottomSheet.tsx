import { ReactNode, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

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
  // 모바일 키보드가 올라오면 시트를 그만큼 위로 밀어서 입력창이 가려지지 않게
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!open) {
      setInset(0)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    const vv = window.visualViewport
    const onViewport = () => {
      if (!vv) return
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    }
    vv?.addEventListener('resize', onViewport)
    vv?.addEventListener('scroll', onViewport)
    onViewport()
    return () => {
      window.removeEventListener('keydown', onKey)
      vv?.removeEventListener('resize', onViewport)
      vv?.removeEventListener('scroll', onViewport)
    }
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
            className="fixed left-0 right-0 bottom-0 z-50 mx-auto max-w-[520px] bg-white rounded-t-[28px] px-5 pt-2.5 overflow-y-auto"
            style={{
              paddingBottom: 34 + inset,
              maxHeight: `calc(88dvh - ${inset}px)`,
              bottom: 0,
              transform: inset ? `translateY(-${inset}px)` : undefined,
            }}
            initial={{ y: '105%' }}
            animate={{ y: inset ? -inset : 0 }}
            exit={{ y: '105%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.3, 0.9, 0.35, 1] }}
            onFocusCapture={(e) => {
              const t = e.target as HTMLElement
              if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
                setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200)
              }
            }}
          >
            <div className="w-[38px] h-1 rounded bg-[#E2E2DE] mx-auto mb-4" />
            {title && (
              <h2 className="text-[16px] font-extrabold m-0 mb-3.5 tracking-tight">{title}</h2>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
