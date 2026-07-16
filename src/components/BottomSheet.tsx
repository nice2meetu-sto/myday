import { ReactNode, useEffect } from 'react'
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
            className="fixed left-0 right-0 bottom-0 z-50 mx-auto max-w-[520px] bg-white rounded-t-[28px] px-5 pt-2.5 pb-[34px] max-h-[88vh] overflow-y-auto"
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            exit={{ y: '105%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.3, 0.9, 0.35, 1] }}
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
