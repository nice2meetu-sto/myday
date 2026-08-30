import { useQuery } from '@tanstack/react-query'
import { sb } from './supabase'
import { todayStr } from './format'
import type { Book, BookKind, BookQuote, VideoType } from '../types'

// ---------------- 종류별 표현 (책 / 영상) ----------------
type KindLike = { kind?: BookKind | null; video_type?: VideoType | null } | null | undefined

export function isVideo(b: KindLike): boolean {
  return b?.kind === 'video'
}

/** 단위 — 책은 쪽, 드라마는 화, 영화는 분(장면 위치) */
export function unitOf(b: KindLike): string {
  if (!isVideo(b)) return '쪽'
  return b?.video_type === 'movie' ? '분' : '화'
}

/** 영화는 진행률 개념이 없어 진행 슬라이더를 쓰지 않는다 */
export function hasProgress(b: KindLike): boolean {
  return !(isVideo(b) && b?.video_type === 'movie')
}

/** 기록 단위 — 책은 쪽, 드라마는 화, 영화는 편(완료 시 1편으로 기록) */
export function logUnitOf(b: KindLike): string {
  if (!isVideo(b)) return '쪽'
  return b?.video_type === 'movie' ? '편' : '화'
}

export function kindIcon(b: KindLike): string {
  if (!isVideo(b)) return '📖'
  return b?.video_type === 'drama' ? '📺' : '🎬'
}

export function kindLabel(b: KindLike): string {
  if (!isVideo(b)) return '책'
  return b?.video_type === 'drama' ? '드라마' : '영화'
}

/** 만든이 라벨 — 책은 저자, 영상은 감독 */
export function creatorLabel(b: KindLike): string {
  return isVideo(b) ? '감독' : '저자'
}

/** 상태 동사 — 책은 읽다, 영상은 보다 */
export function statusLabel(b: KindLike, s: 'want' | 'reading' | 'finished'): string {
  const video = isVideo(b)
  if (s === 'want') return video ? '보고 싶어요' : '읽고 싶어요'
  if (s === 'reading') return video ? '보는 중' : '읽는 중'
  return video ? '다 봤어요' : '다 읽었어요'
}

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
export async function updateBookPage(
  userId: string,
  book: Book,
  newPage: number,
  logDate?: string,
) {
  const date = logDate ?? todayStr()
  const pagesRead = Math.max(0, newPage - book.current_page)
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  // 과거 날짜 기록 시 현재 쪽수를 뒤로 되돌리지 않도록 (앞으로 나아갈 때만 갱신)
  if (newPage > book.current_page) patch.current_page = newPage
  if (book.status === 'want') {
    patch.status = 'reading'
    patch.started_at = date
  }
  const r1 = await sb().from('books').update(patch).eq('id', book.id)
  if (r1.error) throw r1.error
  const r2 = await sb().from('reading_logs').insert({
    user_id: userId,
    book_id: book.id,
    log_date: date,
    end_page: newPage,
    pages_read: pagesRead,
  })
  if (r2.error) throw r2.error
}

export async function addQuote(
  userId: string,
  bookId: string,
  content: string,
  page: number | null,
  createdAt?: string,
) {
  const row: Record<string, unknown> = {
    user_id: userId,
    book_id: bookId,
    content,
    page,
  }
  // 과거 날짜를 고른 경우 created_at을 그 날 정오로 (오늘이면 기본값 now 유지)
  if (createdAt) row.created_at = `${createdAt}T12:00:00`
  const { error } = await sb().from('book_quotes').insert(row)
  if (error) throw error
}
