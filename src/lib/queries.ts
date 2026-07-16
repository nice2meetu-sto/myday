import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb } from './supabase'
import type { Category, PaymentMethod, MoneyKind } from '../types'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('categories')
        .select('*')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data as Category[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment_methods'],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('payment_methods')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as PaymentMethod[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function majorsOf(cats: Category[] | undefined, kind: MoneyKind, includeArchived = false) {
  return (cats ?? []).filter(
    (c) => c.kind === kind && !c.parent_id && (includeArchived || !c.is_archived),
  )
}

export function minorsOf(
  cats: Category[] | undefined,
  parentId: string | null,
  includeArchived = false,
) {
  if (!parentId) return []
  return (cats ?? []).filter(
    (c) => c.parent_id === parentId && (includeArchived || !c.is_archived),
  )
}

export function catName(cats: Category[] | undefined, id: string | null | undefined): string {
  if (!id) return ''
  return (cats ?? []).find((c) => c.id === id)?.name ?? ''
}

export function catIcon(cats: Category[] | undefined, id: string | null | undefined): string {
  if (!id) return ''
  return (cats ?? []).find((c) => c.id === id)?.icon ?? ''
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

export function useUserId(): string {
  // App 레벨에서 세션 보장 후 렌더되므로 캐시된 세션에서 동기 조회
  return (window as unknown as { __uid: string }).__uid
}
