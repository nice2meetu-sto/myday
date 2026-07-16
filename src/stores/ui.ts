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

/** 저장 실패 등 — 실제 원인 메시지를 함께 보여준다 */
export function toastError(prefix: string, e: unknown) {
  const raw =
    (e as { message?: string; error_description?: string })?.message ??
    (e as { error_description?: string })?.error_description ??
    String(e)
  let hint = raw
  if (/schema cache|does not exist|relation|PGRST205/i.test(raw)) {
    hint = 'DB 테이블이 없어요 — supabase/migration.sql을 실행해주세요'
  } else if (/row-level security|policy/i.test(raw)) {
    hint = '권한(RLS) 오류 — migration.sql의 정책이 적용됐는지 확인해주세요'
  }
  useToast.getState().show(`${prefix} · ${hint}`)
  console.error(prefix, e)
}
