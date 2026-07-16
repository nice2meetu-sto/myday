import { create } from 'zustand'

interface ToastState {
  message: string | null
  action: { label: string; fn: () => void } | null
  show: (message: string, action?: { label: string; fn: () => void }) => void
  clear: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  message: null,
  action: null,
  show: (message, action) => {
    set({ message, action: action ?? null })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ message: null, action: null }), 3000)
  },
  clear: () => {
    clearTimeout(toastTimer)
    set({ message: null, action: null })
  },
}))

export function toast(message: string, action?: { label: string; fn: () => void }) {
  useToast.getState().show(message, action)
}
