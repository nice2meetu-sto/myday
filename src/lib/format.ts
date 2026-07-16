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

export function fmtDateKo(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${DAY_NAMES[d.getDay()]}`
}

export function fmtTimeHM(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5)
}
