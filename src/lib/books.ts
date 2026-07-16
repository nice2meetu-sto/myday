import { useQuery } from '@tanstack/react-query'
import { sb } from './supabase'
import { todayStr } from './format'
import type { Book, BookQuote } from '../types'

export function useBooks() {
  return useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('books')
        .select('*')
        .order('shelf_order')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Book[]
    },
  })
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: ['books', id],
    queryFn: async () => {
      const { data, error } = await sb().from('books').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Book
    },
    enabled: !!id,
  })
}

export function useQuotes(bookId?: string, limit?: number) {
  return useQuery({
    queryKey: ['quotes', bookId ?? 'all', limit ?? 'nolimit'],
    queryFn: async () => {
      let q = sb()
        .from('book_quotes')
        .select('*')
        .order('created_at', { ascending: false })
      if (bookId) q = q.eq('book_id', bookId)
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) throw error
      return data as BookQuote[]
    },
  })
}

/**
 * 페이지 갱신 공용 헬퍼 — books.current_page 갱신 + reading_logs 삽입.
 * 홈 카드 시트와 책 상세 슬라이더 둘 다 반드시 이걸 사용해야 통계가 정확함.
 */
export async function updateBookPage(userId: string, book: Book, newPage: number) {
  const pagesRead = Math.max(0, newPage - book.current_page)
  const patch: Record<string, unknown> = {
    current_page: newPage,
    updated_at: new Date().toISOString(),
  }
  if (book.status === 'want') {
    patch.status = 'reading'
    patch.started_at = todayStr()
  }
  await sb().from('books').update(patch).eq('id', book.id)
  await sb().from('reading_logs').insert({
    user_id: userId,
    book_id: book.id,
    log_date: todayStr(),
    end_page: newPage,
    pages_read: pagesRead,
  })
}

export async function addQuote(userId: string, bookId: string, content: string, page: number | null) {
  await sb().from('book_quotes').insert({
    user_id: userId,
    book_id: bookId,
    content,
    page,
  })
}
