import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, getStoredAnonKey, storeAnonKey, clearAnonKey } from '../lib/supabase'
import { Field, inputCls, SaveButton } from '../components/common'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const client = getSupabase()
    if (!client) {
      setLoading(false)
      return
    }
    client.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return { session, loading }
}

/** anon key 미설정 시 최초 1회 입력 화면 (env로 빌드하면 나오지 않음) */
export function KeySetup() {
  const [key, setKey] = useState('')
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] bg-white rounded-card shadow-card p-6">
        <h1 className="text-[22px] font-extrabold m-0 mb-2">마이데이 설정</h1>
        <p className="text-[13px] text-sub leading-relaxed mb-4">
          Supabase 프로젝트의 <b>anon public key</b>를 입력해주세요.
          <br />
          (대시보드 → Settings → API Keys)
        </p>
        <Field label="anon key">
          <textarea
            className={inputCls}
            rows={4}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="eyJhbGciOi..."
          />
        </Field>
        <SaveButton
          disabled={key.trim().length < 20}
          onClick={() => {
            storeAnonKey(key)
            location.reload()
          }}
        >
          저장하고 시작
        </SaveButton>
      </div>
    </div>
  )
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const client = getSupabase()
    if (!client) return
    setBusy(true)
    setErr('')
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) {
      // 계정이 없으면 가입 시도 (1인용 앱)
      const { error: e2 } = await client.auth.signUp({ email, password })
      if (e2) setErr(error.message)
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] bg-white rounded-card shadow-card p-6">
        <h1 className="text-[22px] font-extrabold m-0 mb-1">마이데이</h1>
        <p className="text-[13px] text-sub mb-5">개인 기록 앱 · 로그인</p>
        <Field label="이메일">
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="비밀번호">
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>
        {err && <p className="text-[12px] text-warn mb-2">{err}</p>}
        <SaveButton onClick={submit} disabled={busy || !email || password.length < 6}>
          {busy ? '확인 중…' : '로그인'}
        </SaveButton>
        {!(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) &&
          getStoredAnonKey() && (
            <button
              className="mt-4 w-full border-0 bg-transparent text-[11px] text-sub underline"
              onClick={() => {
                clearAnonKey()
                location.reload()
              }}
            >
              anon key 다시 입력
            </button>
          )}
      </div>
    </div>
  )
}
