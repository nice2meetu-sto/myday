import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, Label, EmptyState, inputCls, Field, SaveButton, SegmentedControl } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { BookCover } from '../components/CoverImg'
import { useBook, useQuotes, updateBookPage, addQuote, isVideo, unitOf, kindLabel, hasProgress } from '../lib/books'
import { deleteImage, uploadImage } from '../lib/image'
import { useInvalidate, useUserId } from '../lib/queries'
import { todayStr, ymd, fmtSlash } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Book, BookQuote, ReadingLog } from '../types'

// ---------------- 완료 시 평점 + 후기 시트 ----------------
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // 별 하나당 왼쪽 절반 = 0.5, 오른쪽 절반 = 1.0
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => {
        const full = value >= i
        const half = !full && value >= i - 0.5
        return (
          <span key={i} className="relative w-8 h-8 text-[26px] leading-8 select-none">
            <span className="absolute inset-0 text-[#E2E0DA]">★</span>
            {(full || half) && (
              <span
                className="absolute inset-0 text-[#E8B84B] overflow-hidden"
                style={{ width: full ? '100%' : '50%' }}
              >
                ★
              </span>
            )}
            <button
              className="absolute left-0 top-0 w-1/2 h-full opacity-0"
              onClick={() => onChange(value === i - 0.5 ? 0 : i - 0.5)}
              aria-label={`${i - 0.5}점`}
            />
            <button
              className="absolute right-0 top-0 w-1/2 h-full opacity-0"
              onClick={() => onChange(value === i ? 0 : i)}
              aria-label={`${i}점`}
            />
          </span>
        )
      })}
      <b className="ml-1.5 text-[13px] tabular text-sub">{value ? value.toFixed(1) : '-'}</b>
    </div>
  )
}

function FinishSheet({
  book,
  open,
  onClose,
}: {
  book: Book
  open: boolean
  onClose: () => void
}) {
  const invalidate = useInvalidate()
  const video = isVideo(book)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [date, setDate] = useState(todayStr())
  const loaded = useRef(false)

  if (open && !loaded.current) {
    loaded.current = true
    setRating(book.rating ?? 0)
    setReview(book.review ?? '')
    setDate(book.finished_at ?? todayStr())
  }
  if (!open && loaded.current) loaded.current = false

  const save = async (withReview: boolean) => {
    const day = date || todayStr()
    const patch: Record<string, unknown> = {
      status: 'finished',
      finished_at: day,
      updated_at: new Date().toISOString(),
    }
    if (withReview) {
      patch.rating = rating || null
      patch.review = review.trim() || null
    }
    // 완료하면 진행도 100%로 (영화는 분량이 없으니 1편으로)
    patch.current_page = book.total_pages ? book.total_pages : hasProgress(book) ? book.current_page : 1
    const { error } = await sb().from('books').update(patch).eq('id', book.id)
    if (error) {
      toastError('저장 실패', error)
      return
    }
    // 영화는 진행 기록이 없어 통계 달력에 안 뜨므로, 본 날 1편짜리 기록을 남긴다
    if (!hasProgress(book)) {
      const { data: existing } = await sb()
        .from('reading_logs')
        .select('id')
        .eq('book_id', book.id)
        .limit(1)
      if (existing?.length) {
        await sb()
          .from('reading_logs')
          .update({ log_date: day, created_at: new Date(`${day}T12:00:00`).toISOString() })
          .eq('id', existing[0].id)
      } else {
        await sb().from('reading_logs').insert({
          user_id: book.user_id,
          book_id: book.id,
          log_date: day,
          end_page: 1,
          pages_read: 1,
          created_at: new Date(`${day}T12:00:00`).toISOString(),
        })
      }
    }
    invalidate(['books', 'reading_logs'])
    toast(video ? '완주를 축하해요!' : '완독을 축하해요!')
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={video ? '다 봤어요' : '다 읽었어요'}>
      <Field label="평점">
        <StarPicker value={rating} onChange={setRating} />
      </Field>
      <Field label="후기">
        <textarea
          className={inputCls}
          rows={5}
          placeholder={video ? '어떤 점이 좋았나요?' : '어떤 점이 좋았나요?'}
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
      </Field>
      <Field label={video ? '다 본 날' : '다 읽은 날'}>
        <input
          type="date"
          className={inputCls}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <button
          className="flex-1 border-0 rounded-[14px] py-[13px] font-bold text-[13px] bg-[#F2F2EF]"
          onClick={() => save(false)}
        >
          건너뛰기
        </button>
        <div className="flex-1">
          <SaveButton onClick={() => save(true)} />
        </div>
      </div>
    </BottomSheet>
  )
}

// ---------------- 읽은 기록 목록/수정 시트 ----------------
function timeHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ReadingLogsSheet({
  book,
  open,
  onClose,
}: {
  book: Book
  open: boolean
  onClose: () => void
}) {
  const bookId = book.id
  const unit = unitOf(book)
  const invalidate = useInvalidate()
  const [editId, setEditId] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [pageInput, setPageInput] = useState('')

  const { data: logs, refetch } = useQuery({
    queryKey: ['reading_logs', 'book', bookId],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('reading_logs')
        .select('*')
        .eq('book_id', bookId)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ReadingLog[]
    },
    enabled: open,
  })

  const startEdit = (l: ReadingLog) => {
    setEditId(l.id)
    setDate(l.log_date)
    setTime(timeHM(l.created_at))
    setPageInput(String(l.end_page))
  }

  // 기록 변경 후 현재 진행도를 남은 기록의 최대값으로 재계산
  const syncBookPage = async () => {
    const { data } = await sb().from('reading_logs').select('end_page').eq('book_id', bookId)
    if (data && data.length) {
      const maxEnd = Math.max(...data.map((r) => r.end_page))
      await sb().from('books').update({ current_page: maxEnd }).eq('id', bookId)
    }
  }

  const save = async (l: ReadingLog) => {
    const p = parseInt(pageInput, 10)
    if (!date || !p) {
      toast(`일자와 ${unit}수를 확인해주세요`)
      return
    }
    const { error } = await sb()
      .from('reading_logs')
      .update({
        log_date: date,
        end_page: p,
        // 진행도를 고치면 그날 진행량도 같은 만큼 보정
        pages_read: Math.max(0, l.pages_read + (p - l.end_page)),
        created_at: new Date(`${date}T${time || '12:00'}:00`).toISOString(),
      })
      .eq('id', l.id)
    if (error) {
      toastError('저장 실패', error)
      return
    }
    await syncBookPage()
    invalidate(['books', 'reading_logs'])
    refetch()
    setEditId(null)
    toast('수정했어요')
  }

  const remove = async (l: ReadingLog) => {
    if (!confirm('이 기록을 삭제할까요?')) return
    await sb().from('reading_logs').delete().eq('id', l.id)
    await syncBookPage()
    invalidate(['books', 'reading_logs'])
    refetch()
    setEditId(null)
    toast('삭제했어요')
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={isVideo(book) ? '본 기록' : '읽은 기록'}>
      {!logs?.length && <EmptyState>아직 기록이 없어요</EmptyState>}
      {logs?.map((l) => (
        <div key={l.id} className="border-b border-line last:border-0">
          {editId === l.id ? (
            <div className="py-2.5">
              <div className="flex gap-2">
                <Field label="일자">
                  <input
                    type="date"
                    className={inputCls}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <Field label="시간">
                  <input
                    type="time"
                    className={inputCls}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </Field>
                <Field label={`${unit}수`}>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                </Field>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 border-0 rounded-[14px] py-[11px] font-bold text-[13px] bg-[#F2F2EF] text-warn"
                  onClick={() => remove(l)}
                >
                  삭제
                </button>
                <button
                  className="flex-1 border-0 rounded-[14px] py-[11px] font-bold text-[13px] bg-[#F2F2EF]"
                  onClick={() => setEditId(null)}
                >
                  취소
                </button>
                <button
                  className="flex-1 border-0 rounded-[14px] py-[11px] font-bold text-[13px] bg-acc text-white"
                  onClick={() => save(l)}
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 py-2.5 cursor-pointer"
              onClick={() => startEdit(l)}
            >
              <span className="text-[11px] text-sub font-bold tabular flex-none w-20">
                {fmtSlash(l.log_date)} {timeHM(l.created_at)}
              </span>
              <span className="text-[13px] font-semibold flex-1 tabular">
                {l.end_page}
                {unit}까지
              </span>
              {l.pages_read > 0 && (
                <span className="text-[11px] text-[#9AA05E] font-bold tabular">
                  +{l.pages_read}
                  {unit}
                </span>
              )}
              <span className="text-sub text-[12px] flex-none">›</span>
            </div>
          )}
        </div>
      ))}
    </BottomSheet>
  )
}

// ---------------- 작품 정보 + 문장 수정 시트 ----------------
function BookEditSheet({
  book,
  quotes,
  open,
  onClose,
}: {
  book: Book
  quotes: BookQuote[]
  open: boolean
  onClose: () => void
}) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [pages, setPages] = useState('')
  const [startedAt, setStartedAt] = useState('')
  const [coverMode, setCoverMode] = useState<'keep' | 'upload' | 'url'>('keep')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [quoteEdits, setQuoteEdits] = useState<
    Record<string, { content: string; page: string; date: string }>
  >({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const loaded = useRef(false)

  if (open && !loaded.current) {
    loaded.current = true
    setTitle(book.title)
    setAuthor(book.author ?? '')
    setPages(book.total_pages ? String(book.total_pages) : '')
    setStartedAt(book.started_at ?? '')
    setCoverMode('keep')
    setCoverFile(null)
    setCoverUrl(book.cover_url?.startsWith('http') ? book.cover_url : '')
    setQuoteEdits(
      Object.fromEntries(
        quotes.map((q) => [
          q.id,
          {
            content: q.content,
            page: q.page ? String(q.page) : '',
            date: ymd(new Date(q.created_at)),
          },
        ]),
      ),
    )
  }
  if (!open && loaded.current) loaded.current = false

  const save = async () => {
    if (!title.trim()) {
      toast('제목을 입력해주세요')
      return
    }
    setBusy(true)
    const patch: Record<string, unknown> = {
      title: title.trim(),
      author: author.trim() || null,
      total_pages: parseInt(pages, 10) || null,
      started_at: startedAt || null,
      updated_at: new Date().toISOString(),
    }
    if (coverMode === 'upload' && coverFile) {
      try {
        const r = await uploadImage('covers', userId, coverFile)
        await deleteImage('covers', book.cover_url)
        patch.cover_url = r.path
      } catch (e) {
        toastError('이미지 업로드 실패', e)
      }
    } else if (coverMode === 'url') {
      if (coverUrl.trim() !== (book.cover_url ?? '')) {
        await deleteImage('covers', book.cover_url)
        patch.cover_url = coverUrl.trim() || null
      }
    }
    const { error } = await sb().from('books').update(patch).eq('id', book.id)
    if (error) {
      setBusy(false)
      toastError('저장 실패', error)
      return
    }
    // 변경된 문장만 갱신 (내용/위치/기록일)
    for (const q of quotes) {
      const edit = quoteEdits[q.id]
      if (!edit) continue
      const newPage = parseInt(edit.page, 10) || null
      const origDate = ymd(new Date(q.created_at))
      const dateChanged = edit.date && edit.date !== origDate
      if (edit.content.trim() !== q.content || newPage !== q.page || dateChanged) {
        if (!edit.content.trim()) continue
        const upd: Record<string, unknown> = { content: edit.content.trim(), page: newPage }
        if (dateChanged) {
          upd.created_at = new Date(edit.date + 'T12:00:00').toISOString()
        }
        await sb().from('book_quotes').update(upd).eq('id', q.id)
      }
    }
    setBusy(false)
    invalidate(['books', 'quotes'])
    toast('수정했어요')
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="정보 수정">
      <Field label="제목">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={isVideo(book) ? '감독 · 출연' : '작가'}>
        <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} />
      </Field>
      <div className="flex gap-3">
        <div className="w-[38%]">
          <Field label={isVideo(book) ? '전체 화수' : '전체 쪽수'}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={pages}
              onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="읽기 시작한 날">
            <input
              type="date"
              className={inputCls}
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label={isVideo(book) ? '포스터' : '표지'}>
        <SegmentedControl
          className="mb-2"
          options={[
            { value: 'keep', label: '그대로' },
            { value: 'upload', label: '사진 교체' },
            { value: 'url', label: 'URL' },
          ]}
          value={coverMode}
          onChange={setCoverMode}
        />
        {coverMode === 'upload' && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            />
            <button
              className="w-full border-[1.5px] border-dashed border-line rounded-xl py-3 text-[12px] font-semibold text-sub bg-transparent"
              onClick={() => fileRef.current?.click()}
            >
              {coverFile ? `📎 ${coverFile.name}` : '사진 선택'}
            </button>
          </>
        )}
        {coverMode === 'url' && (
          <input
            className={inputCls}
            placeholder="https://..."
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
          />
        )}
      </Field>
      {quotes.length > 0 && (
        <Field label={isVideo(book) ? '대사 수정' : '필사 수정'}>
          {quotes.map((q) => (
            <div key={q.id} className="bg-[#FAFAF8] rounded-xl p-2.5 mb-2">
              <textarea
                className={inputCls + ' !text-[13px]'}
                rows={2}
                value={quoteEdits[q.id]?.content ?? q.content}
                onChange={(e) =>
                  setQuoteEdits((prev) => ({
                    ...prev,
                    [q.id]: { ...prev[q.id], content: e.target.value },
                  }))
                }
              />
              <div className="flex gap-2 mt-1.5">
                <input
                  className={inputCls + ' !w-20'}
                  inputMode="numeric"
                  placeholder={unitOf(book)}
                  value={quoteEdits[q.id]?.page ?? ''}
                  onChange={(e) =>
                    setQuoteEdits((prev) => ({
                      ...prev,
                      [q.id]: {
                        ...prev[q.id],
                        content: prev[q.id]?.content ?? q.content,
                        page: e.target.value.replace(/[^0-9]/g, ''),
                      },
                    }))
                  }
                />
                <input
                  type="date"
                  className={inputCls + ' flex-1'}
                  value={quoteEdits[q.id]?.date ?? ''}
                  onChange={(e) =>
                    setQuoteEdits((prev) => ({
                      ...prev,
                      [q.id]: {
                        ...prev[q.id],
                        content: prev[q.id]?.content ?? q.content,
                        date: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
          ))}
        </Field>
      )}
      <SaveButton onClick={save} disabled={busy}>
        {busy ? '저장 중…' : '저장'}
      </SaveButton>
    </BottomSheet>
  )
}

export default function BookDetailPage() {
  const { bookId } = useParams()
  const nav = useNavigate()
  const userId = useUserId()
  const invalidate = useInvalidate()
  const { data: book } = useBook(bookId)
  const { data: quotes } = useQuotes(bookId)

  const [page, setPage] = useState(0)
  const [quoteText, setQuoteText] = useState('')
  const [quotePage, setQuotePage] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)

  useEffect(() => {
    if (book) setPage(book.current_page)
  }, [book?.id, book?.current_page])

  if (!book) return null

  const total = book.total_pages ?? 0
  const pct = total ? Math.min(100, Math.round((page / total) * 100)) : 0
  const video = isVideo(book)
  const unit = unitOf(book)

  const commitPage = async (v: number) => {
    if (v === book.current_page) return
    try {
      await updateBookPage(userId, book, v)
    } catch (e) {
      toastError('저장 실패', e)
      return
    }
    invalidate(['books', 'reading_logs'])
    toast(video ? '진행도를 저장했어요' : '쪽수를 저장했어요')
  }

  const saveQuote = async () => {
    if (!quoteText.trim()) return
    try {
      await addQuote(userId, book.id, quoteText.trim(), parseInt(quotePage, 10) || null)
    } catch (e) {
      toastError('저장 실패', e)
      return
    }
    invalidate(['quotes'])
    setQuoteText('')
    setQuotePage('')
    toast('저장했어요')
  }

  const changeStatus = async () => {
    if (book.status === 'want') {
      await sb().from('books').update({ status: 'reading', started_at: todayStr() }).eq('id', book.id)
      toast(video ? '보기 시작!' : '읽기 시작!')
    } else if (book.status === 'reading') {
      // 완료 처리는 평점 + 후기 시트에서
      setFinishOpen(true)
      return
    } else {
      await sb().from('books').update({ status: 'reading', finished_at: null }).eq('id', book.id)
      // 영화는 완료 시 자동 생성한 1편 기록을 되돌린다
      if (!hasProgress(book)) {
        await sb().from('reading_logs').delete().eq('book_id', book.id)
      }
      toast(video ? '다시 보는 중으로 바꿨어요' : '다시 읽는 중으로 바꿨어요')
    }
    invalidate(['books', 'reading_logs'])
  }

  const removeBook = async () => {
    if (!confirm(`'${book.title}'을(를) 삭제할까요? 문장과 기록도 함께 삭제됩니다.`)) return
    await deleteImage('covers', book.cover_url)
    await sb().from('books').delete().eq('id', book.id)
    invalidate(['books', 'quotes', 'reading_logs'])
    nav('/hobby')
  }

  const deleteQuote = (id: string) => {
    const timer = setTimeout(async () => {
      if (confirm('이 문장을 삭제할까요?')) {
        await sb().from('book_quotes').delete().eq('id', id)
        invalidate(['quotes'])
      }
    }, 550)
    const clear = () => {
      clearTimeout(timer)
      document.removeEventListener('pointerup', clear)
      document.removeEventListener('pointermove', clear)
    }
    document.addEventListener('pointerup', clear)
    document.addEventListener('pointermove', clear)
  }

  const actionLabel =
    book.status === 'want'
      ? video
        ? '보기 시작'
        : '읽기 시작'
      : book.status === 'reading'
        ? video
          ? '다 봤어요'
          : '다 읽었어요'
        : video
          ? '다시 보기'
          : '다시 읽기'

  return (
    <div>
      <div className="flex items-center gap-3 mt-1.5 mb-3.5">
        <button
          className="w-[34px] h-[34px] rounded-[11px] border-0 bg-white shadow-card text-[16px]"
          onClick={() => nav('/hobby')}
        >
          ‹
        </button>
        <h1 className="text-[20px] font-extrabold tracking-tight m-0 flex-1 truncate">{book.title}</h1>
        <button
          className="border-0 bg-transparent text-[11px] text-sub font-bold"
          onClick={() => setEditOpen(true)}
        >
          수정
        </button>
        <button className="border-0 bg-transparent text-[11px] text-sub font-bold" onClick={removeBook}>
          삭제
        </button>
      </div>
      <BookEditSheet book={book} quotes={quotes ?? []} open={editOpen} onClose={() => setEditOpen(false)} />
      <ReadingLogsSheet book={book} open={logsOpen} onClose={() => setLogsOpen(false)} />
      <FinishSheet book={book} open={finishOpen} onClose={() => setFinishOpen(false)} />

      <div className="flex gap-4 mb-3">
        <BookCover title={book.title} coverUrl={book.cover_url} className="w-[110px] h-[164px] rounded-[10px] flex-none" />
        <div className="flex-1 pt-1">
          <div className="text-[15px] font-extrabold leading-snug">{book.title}</div>
          {book.author && <div className="text-[12px] text-sub font-semibold mt-1">{book.author}</div>}
          <div className="text-[11px] text-sub mt-2 leading-relaxed">
            {kindLabel(book)}
            {total ? ` · ${total}${unit}` : ''}
            {book.started_at && (
              <>
                <br />
                {book.started_at} 시작
              </>
            )}
            {book.finished_at && (
              <>
                <br />
                {book.finished_at} {video ? '완주' : '완독'}
              </>
            )}
            {book.rating != null && (
              <>
                <br />★ {book.rating}
              </>
            )}
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            <button
              className="border-0 bg-acc text-white rounded-xl px-4 py-2 text-[11px] font-bold"
              onClick={changeStatus}
            >
              {actionLabel}
            </button>
            {book.status === 'finished' && (
              <button
                className="border-0 bg-[#F2F2EF] text-ink rounded-xl px-3 py-2 text-[11px] font-bold"
                onClick={() => setFinishOpen(true)}
              >
                후기 수정
              </button>
            )}
            {book.status === 'reading' && (
              <button
                className="border-0 bg-[#F2F2EF] text-ink rounded-xl px-3 py-2 text-[11px] font-bold"
                onClick={async () => {
                  await sb()
                    .from('books')
                    .update({ status: 'want', started_at: null })
                    .eq('id', book.id)
                  invalidate(['books'])
                  toast(video ? '보고 싶은 것으로 옮겼어요' : '읽고 싶은 책으로 옮겼어요')
                }}
              >
                {video ? '보고 싶어요로' : '읽고 싶어요로'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 후기 */}
      {book.review && (
        <Card className="mb-3 cursor-pointer" onClick={() => setFinishOpen(true)}>
          <div className="flex justify-between items-baseline mb-1.5">
            <Label>후기</Label>
            {book.rating != null && <b className="text-[13px] text-[#E8B84B]">★ {book.rating}</b>}
          </div>
          <p className="m-0 text-[13px] leading-[1.7] text-[#444] whitespace-pre-wrap">
            {book.review}
          </p>
        </Card>
      )}

      {book.status !== 'want' && hasProgress(book) && (
        <Card className="mb-3 cursor-pointer" onClick={() => setLogsOpen(true)}>
          <div className="flex justify-between items-baseline">
            <Label>{video ? '본 화수' : '읽은 쪽수'}</Label>
            <b className="text-[13px] tabular">
              {page}
              {total ? ` / ${total}${unit} · ${pct}%` : unit}
            </b>
          </div>
          {total > 0 ? (
            <input
              type="range"
              min={0}
              max={total}
              value={page}
              className="w-full accent-acc mt-3"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setPage(parseInt(e.target.value, 10))}
              onPointerUp={() => commitPage(page)}
              onKeyUp={(e) => e.key !== 'Tab' && commitPage(page)}
            />
          ) : (
            <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
              <input
                className={inputCls}
                inputMode="numeric"
                value={page || ''}
                onChange={(e) => setPage(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
              />
              <button className="border-0 bg-acc text-white rounded-xl px-4 text-[12px] font-bold" onClick={() => commitPage(page)}>
                저장
              </button>
            </div>
          )}
        </Card>
      )}

      <Card className="mb-3">
        <Label className="mb-2">{video ? '기억에 남는 대사' : '기억에 남는 문장'}</Label>
        <textarea
          className={inputCls}
          rows={3}
          placeholder={video ? '기억에 남는 대사를 적어두세요' : '기억에 남는 문장을 적어두세요'}
          value={quoteText}
          onChange={(e) => setQuoteText(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <input
            className={inputCls + ' !w-24'}
            inputMode="numeric"
            placeholder={unit}
            value={quotePage}
            onChange={(e) => setQuotePage(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <button
            className={`flex-1 border-0 rounded-xl text-[12px] font-bold ${quoteText.trim() ? 'bg-acc text-white' : 'bg-[#DDDDD8] text-white'}`}
            onClick={saveQuote}
            disabled={!quoteText.trim()}
          >
            저장
          </button>
        </div>
      </Card>

      {!quotes?.length && <EmptyState>아직 기록한 문장이 없어요</EmptyState>}
      {(quotes ?? []).map((q) => (
        <div
          key={q.id}
          className="bg-cream rounded-card p-[18px] mb-3 shadow-card border border-black/10 select-none"
          onPointerDown={() => deleteQuote(q.id)}
        >
          <p className="m-0 font-serif text-[13px] leading-[1.7] text-[#3d3628]">“{q.content}”</p>
          <div className="mt-2.5 flex justify-between text-[11px] font-semibold text-[#9a8b70]">
            <span>{q.page ? `${q.page}${unit}` : ''}</span>
            <span>
              {new Date(q.created_at).getMonth() + 1}월 {new Date(q.created_at).getDate()}일
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
