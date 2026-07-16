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

/** '7/17' 형식 */
export function fmtSlash(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 할일 정렬: 미완료 우선 → 날짜/시간 있는 것 먼저 시간순 → 나머지 가나다 */
export function todoCompare(
  a: { is_done: boolean; due_date: string | null; due_time: string | null; content: string },
  b: { is_done: boolean; due_date: string | null; due_time: string | null; content: string },
): number {
  if (a.is_done !== b.is_done) return a.is_done ? 1 : -1
  const ad = a.due_date ?? ''
  const bd = b.due_date ?? ''
  if (ad && bd && ad !== bd) return ad < bd ? -1 : 1
  if (ad && !bd) return -1
  if (!ad && bd) return 1
  const at = a.due_time ?? ''
  const bt = b.due_time ?? ''
  if (at && bt && at !== bt) return at < bt ? -1 : 1
  if (at && !bt) return -1
  if (!at && bt) return 1
  return a.content.localeCompare(b.content, 'ko')
}
