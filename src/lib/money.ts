import { useQuery } from '@tanstack/react-query'
import { sb } from './supabase'
import type { MoneyEntry, MoneyKind, Saving } from '../types'

const TABLE: Record<MoneyKind, string> = {
  expense: 'expenses',
  income: 'incomes',
  saving: 'savings',
}

export function useMoneyRange(kind: MoneyKind, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['money', kind, fromISO, toISO],
    queryFn: async () => {
      let q = sb()
        .from(TABLE[kind])
        .select('*')
        .gte('occurred_at', fromISO)
        .lt('occurred_at', toISO)
        .order('occurred_at', { ascending: false })
      if (kind === 'expense') q = q.eq('is_skipped', false)
      const { data, error } = await q
      if (error) throw error
      return data as (MoneyEntry | Saving)[]
    },
  })
}

export interface SummaryRow {
  month: string
  kind: MoneyKind
  total: number
}

export function useSummaryView() {
  return useQuery({
    queryKey: ['summary'],
    queryFn: async () => {
      const { data, error } = await sb().from('v_monthly_summary').select('*')
      if (error) throw error
      return (data as { month: string; kind: MoneyKind; total: number }[]).map((r) => ({
        month: r.month.slice(0, 7),
        kind: r.kind,
        total: Number(r.total),
      })) as SummaryRow[]
    },
  })
}

export function sumAmount(rows: { amount: number }[] | undefined): number {
  return (rows ?? []).reduce((s, r) => s + Number(r.amount), 0)
}

export function monthRange(anchor: Date): { from: string; to: string } {
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function yearRange(anchor: Date): { from: string; to: string } {
  const from = new Date(anchor.getFullYear(), 0, 1)
  const to = new Date(anchor.getFullYear() + 1, 0, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}
