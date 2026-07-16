import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInCalendarYears,
  lastDayOfMonth,
} from 'date-fns'
import { sb } from './supabase'
import { ymd, todayStr, localDateOf } from './format'
import type { RecurringRule, TodoTemplate } from '../types'

const HORIZON_DAYS = 60
const LOOKBACK_DAYS = 60

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00')
}

/** 해당 월에서 bymonthday가 가리키는 실제 일(day). -1 = 말일, 없는 날짜는 말일로 보정 */
function resolveMonthday(d: Date, bymonthday: number): number {
  const last = lastDayOfMonth(d).getDate()
  if (bymonthday === -1) return last
  return Math.min(bymonthday, last)
}

function ruleMatches(
  d: Date,
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
  intervalN: number,
  byweekday: number[] | null,
  bymonthday: number | null,
  bymonth: number | null,
  startsOn: Date,
): boolean {
  if (d < startsOn) return false
  switch (freq) {
    case 'daily':
      return differenceInCalendarDays(d, startsOn) % intervalN === 0
    case 'weekly': {
      if (byweekday && byweekday.length > 0 && !byweekday.includes(d.getDay())) return false
      if (!byweekday || byweekday.length === 0) {
        if (d.getDay() !== startsOn.getDay()) return false
      }
      return (
        Math.abs(differenceInCalendarWeeks(d, startsOn, { weekStartsOn: 0 })) % intervalN === 0
      )
    }
    case 'monthly': {
      const day = resolveMonthday(d, bymonthday ?? startsOn.getDate())
      if (d.getDate() !== day) return false
      return Math.abs(differenceInCalendarMonths(d, startsOn)) % intervalN === 0
    }
    case 'yearly': {
      const month = bymonth ?? startsOn.getMonth() + 1
      if (d.getMonth() + 1 !== month) return false
      const day = resolveMonthday(d, bymonthday ?? startsOn.getDate())
      if (d.getDate() !== day) return false
      return Math.abs(differenceInCalendarYears(d, startsOn)) % intervalN === 0
    }
  }
}

function expandDates(
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
  intervalN: number,
  byweekday: number[] | null,
  bymonthday: number | null,
  bymonth: number | null,
  startsOn: string,
  endsOn: string | null,
  from: Date,
  to: Date,
): string[] {
  const starts = parseDate(startsOn)
  const ends = endsOn ? parseDate(endsOn) : null
  const out: string[] = []
  let d = from < starts ? starts : from
  while (d <= to) {
    if (ends && d > ends) break
    if (ruleMatches(d, freq, intervalN, byweekday, bymonthday, bymonth, starts)) {
      out.push(ymd(d))
    }
    d = addDays(d, 1)
  }
  return out
}

export function expandRuleDates(rule: RecurringRule, from: Date, to: Date): string[] {
  return expandDates(
    rule.freq,
    rule.interval_n,
    rule.byweekday != null ? [rule.byweekday] : null,
    rule.bymonthday,
    rule.bymonth,
    rule.starts_on,
    rule.ends_on,
    from,
    to,
  )
}

export function nextOccurrence(rule: RecurringRule): string | null {
  const today = new Date(todayStr() + 'T00:00:00')
  const dates = expandRuleDates(rule, today, addDays(today, 400))
  return dates[0] ?? null
}

const TABLE_BY_KIND = { expense: 'expenses', income: 'incomes', saving: 'savings' } as const

/** 앱 시작 시 1회: 반복 규칙/템플릿 → 실제 행 실체화 (60일치) */
export async function ensureRecurrences(userId: string) {
  const today = new Date(todayStr() + 'T00:00:00')
  const from = addDays(today, -LOOKBACK_DAYS)
  const to = addDays(today, HORIZON_DAYS)

  // ---- 할일 템플릿 ----
  const { data: templates } = await sb()
    .from('todo_templates')
    .select('*')
    .eq('is_active', true)
  for (const t of (templates ?? []) as TodoTemplate[]) {
    const dates = expandDates(
      t.freq,
      t.interval_n,
      t.byweekday,
      t.bymonthday,
      null,
      t.starts_on,
      t.ends_on,
      today,
      to,
    )
    if (!dates.length) continue
    const rows = dates.map((d) => ({
      user_id: userId,
      content: t.content,
      quadrant: t.quadrant,
      due_date: d,
      due_time: t.due_time,
      template_id: t.id,
    }))
    // unique(template_id, due_date)가 중복을 막아줌
    await sb().from('todos').upsert(rows, {
      onConflict: 'template_id,due_date',
      ignoreDuplicates: true,
    })
  }

  // ---- 고정지출/수입/저축 규칙 ----
  const { data: rules } = await sb().from('recurring_rules').select('*').eq('is_active', true)
  for (const r of (rules ?? []) as RecurringRule[]) {
    if (!r.auto_create) continue
    const dates = expandRuleDates(r, from, r.kind === 'expense' ? to : today <= to ? to : today)
    if (!dates.length) continue
    const table = TABLE_BY_KIND[r.kind]
    const { data: existing } = await sb()
      .from(table)
      .select('occurred_at')
      .eq('recurring_id', r.id)
      .gte('occurred_at', from.toISOString())
    const existingDates = new Set(
      (existing ?? []).map((e: { occurred_at: string }) => localDateOf(e.occurred_at)),
    )
    const missing = dates.filter((d) => !existingDates.has(d))
    if (!missing.length) continue
    const rows = missing.map((d) => {
      const base: Record<string, unknown> = {
        user_id: userId,
        amount: r.amount,
        memo: r.name,
        occurred_at: `${d}T12:00:00`,
        recurring_id: r.id,
      }
      if (r.kind === 'saving') {
        base.category_id = r.major_category_id
      } else {
        base.major_category_id = r.major_category_id
        base.minor_category_id = r.minor_category_id
      }
      if (r.kind === 'expense') base.payment_method_id = r.payment_method_id
      return base
    })
    await sb().from(table).insert(rows)
  }
}

/** auto_create=false 규칙 중 오늘(±7일 이내 과거)에 해당하는데 아직 등록 안 된 것 */
export async function pendingConfirmations(): Promise<
  { rule: RecurringRule; date: string }[]
> {
  const today = new Date(todayStr() + 'T00:00:00')
  const from = addDays(today, -7)
  const { data: rules } = await sb()
    .from('recurring_rules')
    .select('*')
    .eq('is_active', true)
    .eq('auto_create', false)
  const out: { rule: RecurringRule; date: string }[] = []
  for (const r of (rules ?? []) as RecurringRule[]) {
    const dates = expandRuleDates(r, from, today)
    if (!dates.length) continue
    const table = TABLE_BY_KIND[r.kind]
    const { data: existing } = await sb()
      .from(table)
      .select('occurred_at')
      .eq('recurring_id', r.id)
      .gte('occurred_at', from.toISOString())
    const existingDates = new Set(
      (existing ?? []).map((e: { occurred_at: string }) => localDateOf(e.occurred_at)),
    )
    for (const d of dates) {
      if (!existingDates.has(d)) out.push({ rule: r, date: d })
    }
  }
  return out
}
