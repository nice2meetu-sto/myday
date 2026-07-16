import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://ukdqgghzxwbyiqometsp.supabase.co'

// anon key는 빌드 환경변수 → 없으면 localStorage(최초 1회 입력)에서 읽는다.
// anon key는 공개 가능한 키이므로 클라이언트 저장에 문제 없음 (RLS로 보호).
const KEY_STORAGE = 'myday-anon-key'

export function getStoredAnonKey(): string | null {
  const env = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (env && env.length > 20) return env
  return localStorage.getItem(KEY_STORAGE)
}

export function storeAnonKey(key: string) {
  localStorage.setItem(KEY_STORAGE, key.trim())
}

export function clearAnonKey() {
  localStorage.removeItem(KEY_STORAGE)
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (client) return client
  const key = getStoredAnonKey()
  if (!key) return null
  client = createClient(SUPABASE_URL, key)
  return client
}

/** 로그인 이후에만 호출되는 곳에서 사용 — null이면 throw */
export function sb(): SupabaseClient {
  const c = getSupabase()
  if (!c) throw new Error('Supabase not configured')
  return c
}
