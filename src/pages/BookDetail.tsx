import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Label, EmptyState, inputCls, Field, SaveButton, SegmentedControl } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { BookCover } from '../components/CoverImg'
import { useBook, useQuotes, updateBookPage, addQuote } from '../lib/books'
import { deleteImage, uploadImage } from '../lib/image'
import { useInvalidate, useUserId } from '../lib/queries'
import { todayStr } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Book, BookQuote } from '../types'

// ---------------- 책 정보 + 필사 수정 시트 ----------------
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
  const [coverMode, setCoverMode] = useState<'keep' | 'upload' | 'url'>('keep')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [quoteEdits, setQuoteEdits] = useState<Record<string, { content: string; page: string }>>({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const loaded = useRef(false)

  if (open && !loaded.current) {
    loaded.current = true
    setTitle(book.title)
    setAuthor(book.author ?? '')
    setPages(book.total_pages ? String(book.total_pages) : '')
    setCoverMode('keep')
    setCoverFile(null)
    setCoverUrl(book.cover_url?.startsWith('http') ? book.cover_url : '')
    setQuoteEdits(
      Object.fromEntries(
        quotes.map((q) => [q.id, { content: q.content, page: q.page ? String(q.page) : '' }]),
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
      updated_at: new Date().toISOString(),
    }
    if (coverMode === 'upload' && coverFile) {
      try {
        const r = await uploadImage('covers', userId, coverFile)
        await deleteImage('covers', book.cover_url)
        patch.cover_url = r.path
      } catch (e) {
        toastError('표지 업로드 실패', e)
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
    // 변경된 필사만 갱신
    for (const q of quotes) {
      const edit = quoteEdits[q.id]
      if (!edit) continue
      const newPage = parseInt(edit.page, 10) || null
      if (edit.content.trim() !== q.content || newPage !== q.page) {
        if (!edit.content.trim()) continue
        await sb()
          .from('book_quotes')
          .update({ content: edit.content.trim(), page: newPage })
          .eq('id', q.id)
      }
    }
    setBusy(false)
    invalidate(['books', 'quotes'])
    toast('수정했어요')
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="책 정보 수정">
      <Field label="제목">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="작가">
        <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} />
      </Field>
      <Field label="전체 쪽수">
        <input
          className={inputCls + ' !w-32'}
          inputMode="numeric"
          value={pages}
          onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ''))}
        />
      </Field>
      <Field label="표지">
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
        <Field label="필사 수정">
          {quotes.map((q) => (
            <div key={q.id} className="bg-[#FAFAF8] rounded-xl p-2.5 mb-2">
              <textarea
                className={inputCls + ' !text-[13px]'}
                rows={2}
                value={quoteEdits[q.id]?.content ?? q.content}
                onChange={(e) =>
                  setQuoteEdits((prev) => ({
                    ...prev,
                    [q.id]: { content: e.target.value, page: prev[q.id]?.page ?? '' },
                  }))
                }
              />
              <input
                className={inputCls + ' !w-24 mt-1.5'}
                inputMode="numeric"
                placeholder="쪽수"
                value={quoteEdits[q.id]?.page ?? ''}
                onChange={(e) =>
                  setQuoteEdits((prev) => ({
                    ...prev,
                    [q.id]: {
                      content: prev[q.id]?.content ?? q.content,
                      page: e.target.value.replace(/[^0-9]/g, ''),
                    },
                  }))
                }
              />
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

  useEffect(() => {
    if (book) setPage(book.current_page)
  }, [book?.id, book?.current_page])

  if (!book) return null

  const total = book.total_pages ?? 0
  const pct = total ? Math.min(100, Math.round((page / total) * 100)) : 0

  const commitPage = async (v: number) => {
    if (v === book.current_page) return
    try {
      await updateBookPage(userId, book, v)
    } catch (e) {
      toastError('저장 실패', e)
      return
    }
    invalidate(['books', 'reading_logs'])
    toast('쪽수를 저장했어요')
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
    toast('필사를 저장했어요')
  }

  const changeStatus = async () => {
    if (book.status === 'want') {
      await sb().from('books').update({ status: 'reading', started_at: todayStr() }).eq('id', book.id)
      toast('읽기 시작!')
    } else if (book.status === 'reading') {
      const ratingStr = prompt('완독! 평점을 남겨보세요 (0~5, 예: 4.5)', '')
      const rating = ratingStr ? Math.min(5, Math.max(0, parseFloat(ratingStr))) : null
      await sb()
        .from('books')
        .update({
          status: 'finished',
          finished_at: todayStr(),
          rating: Number.isFinite(rating) ? rating : null,
          current_page: total || book.current_page,
        })
        .eq('id', book.id)
      toast('완독을 축하해요!')
    } else {
      await sb().from('books').update({ status: 'reading', finished_at: null }).eq('id', book.id)
      toast('다시 읽는 중으로 바꿨어요')
    }
    invalidate(['books'])
  }

  const removeBook = async () => {
    if (!confirm(`'${book.title}'을(를) 삭제할까요? 필사와 기록도 함께 삭제됩니다.`)) return
    await deleteImage('covers', book.cover_url)
    await sb().from('books').delete().eq('id', book.id)
    invalidate(['books', 'quotes', 'reading_logs'])
    nav('/hobby')
  }

  const deleteQuote = (id: string) => {
    const timer = setTimeout(async () => {
      if (confirm('이 필사를 삭제할까요?')) {
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

  const statusLabel =
    book.status === 'want' ? '읽기 시작' : book.status === 'reading' ? '다 읽었어요' : '다시 읽기'

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

      <div className="flex gap-4 mb-3">
        <BookCover title={book.title} coverUrl={book.cover_url} className="w-[110px] h-[164px] rounded-[10px] flex-none" />
        <div className="flex-1 pt-1">
          <div className="text-[15px] font-extrabold leading-snug">{book.title}</div>
          {book.author && <div className="text-[12px] text-sub font-semibold mt-1">{book.author}</div>}
          <div className="text-[11px] text-sub mt-2 leading-relaxed">
            {total ? `${total}쪽` : ''}
            {book.started_at && (
              <>
                <br />
                {book.started_at} 시작
              </>
            )}
            {book.finished_at && (
              <>
                <br />
                {book.finished_at} 완독
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
              {statusLabel}
            </button>
            {book.status === 'reading' && (
              <button
                className="border-0 bg-[#F2F2EF] text-ink rounded-xl px-3 py-2 text-[11px] font-bold"
                onClick={async () => {
                  await sb()
                    .from('books')
                    .update({ status: 'want', started_at: null })
                    .eq('id', book.id)
                  invalidate(['books'])
                  toast('읽고 싶은 책으로 옮겼어요')
                }}
              >
                읽고 싶어요로
              </button>
            )}
          </div>
        </div>
      </div>

      {book.status !== 'want' && (
        <Card className="mb-3">
          <div className="flex justify-between items-baseline">
            <Label>읽은 쪽수</Label>
            <b className="text-[13px] tabular">
              {page}
              {total ? ` / ${total}쪽 · ${pct}%` : '쪽'}
            </b>
          </div>
          {total > 0 ? (
            <input
              type="range"
              min={0}
              max={total}
              value={page}
              className="w-full accent-acc mt-3"
              onChange={(e) => setPage(parseInt(e.target.value, 10))}
              onPointerUp={() => commitPage(page)}
              onKeyUp={(e) => e.key !== 'Tab' && commitPage(page)}
            />
          ) : (
            <div className="flex gap-2 mt-2">
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
        <Label className="mb-2">기억에 남는 문장</Label>
        <textarea
          className={inputCls}
          rows={3}
          placeholder="기억에 남는 문장을 적어두세요"
          value={quoteText}
          onChange={(e) => setQuoteText(e.target.value)}
        />
        <div className="flex gap-2 mt-2">
          <input
            className={inputCls + ' !w-24'}
            inputMode="numeric"
            placeholder="쪽수"
            value={quotePage}
            onChange={(e) => setQuotePage(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <button
            className={`flex-1 border-0 rounded-xl text-[12px] font-bold ${quoteText.trim() ? 'bg-acc text-white' : 'bg-[#DDDDD8] text-white'}`}
            onClick={saveQuote}
            disabled={!quoteText.trim()}
          >
            필사 저장
          </button>
        </div>
      </Card>

      {!quotes?.length && <EmptyState>아직 기록한 문장이 없어요</EmptyState>}
      {(quotes ?? []).map((q) => (
        <div
          key={q.id}
          className="bg-cream rounded-card p-[18px] mb-3 shadow-card select-none"
          onPointerDown={() => deleteQuote(q.id)}
        >
          <p className="m-0 font-serif text-[13px] leading-[1.7] text-[#3d3628]">“{q.content}”</p>
          <div className="mt-2.5 flex justify-between text-[11px] font-semibold text-[#9a8b70]">
            <span>{q.page ? `${q.page}쪽` : ''}</span>
            <span>
              {new Date(q.created_at).getMonth() + 1}월 {new Date(q.created_at).getDate()}일
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
