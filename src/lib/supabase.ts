import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://ukdqgghzxwbyiqometsp.supabase.co'

// anon key는 공개 가능한 키(publishable key)라 코드에 넣어도 안전 — 데이터는 RLS가 보호.
// 우선순위: 빌드 환경변수 → localStorage → 아래 기본값
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrZHFnZ2h6eHdieWlxb21ldHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDAyMjUsImV4cCI6MjA5OTc3NjIyNX0.NyMLagry9HNyTdX5Gh8p-vpW4PPewlJX7iKxUotP5rQ'

const KEY_STORAGE = 'myday-anon-key'

export function getStoredAnonKey(): string | null {
  const env = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (env && env.length > 20) return env
  return localStorage.getItem(KEY_STORAGE) ?? DEFAULT_ANON_KEY
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
