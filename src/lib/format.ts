export function fmt(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

export function fmtWon(n: number): string {
  return `${fmt(n)}원`
}

/** 만원 이상 축약: 123456 → 12.3만 */
export function fmtShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 10000) {
    const man = n / 10000
    return `${man >= 100 ? Math.round(man).toLocaleString('ko-KR') : Math.round(man * 10) / 10}만`
  }
  return fmt(n)
}

export function parseAmount(s: string): number {
  return parseInt(s.replace(/[^0-9]/g, ''), 10) || 0
}

export function commaInput(s: string): string {
  const v = s.replace(/[^0-9]/g, '')
  return v ? parseInt(v, 10).toLocaleString('ko-KR') : ''
}

export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return ymd(new Date())
}

/** '7.11.' 형식 짧은 날짜 */
export function fmtDot(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}.${d.getDate()}.`
}

/**
 * KST(로컬) 기준 하루 범위 → timestamptz 필터용 절대시각.
 * 문자열 비교(UTC 해석)로 날짜가 밀리는 문제 방지.
 */
export function dayStartISO(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toISOString()
}

export function nextDayStartISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

/** timestamptz → 로컬(KST) 기준 yyyy-MM-dd */
export function localDateOf(iso: string): string {
  return ymd(new Date(iso))
}

export function fmtDateKo(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${DAY_NAMES[d.getDay()]}`
}

export function fmtTimeHM(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5)
}
