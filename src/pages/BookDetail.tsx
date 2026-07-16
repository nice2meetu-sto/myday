import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Label, EmptyState, inputCls } from '../components/common'
import { BookCover } from '../components/CoverImg'
import { useBook, useQuotes, updateBookPage, addQuote } from '../lib/books'
import { deleteImage } from '../lib/image'
import { useInvalidate, useUserId } from '../lib/queries'
import { todayStr } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast } from '../stores/ui'

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

  useEffect(() => {
    if (book) setPage(book.current_page)
  }, [book?.id, book?.current_page])

  if (!book) return null

  const total = book.total_pages ?? 0
  const pct = total ? Math.min(100, Math.round((page / total) * 100)) : 0

  const commitPage = async (v: number) => {
    if (v === book.current_page) return
    await updateBookPage(userId, book, v)
    invalidate(['books', 'reading_logs'])
    toast('쪽수를 저장했어요')
  }

  const saveQuote = async () => {
    if (!quoteText.trim()) return
    await addQuote(userId, book.id, quoteText.trim(), parseInt(quotePage, 10) || null)
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
        <button className="border-0 bg-transparent text-[11px] text-sub font-bold" onClick={removeBook}>
          삭제
        </button>
      </div>

      <div className="flex gap-4 mb-3">
        <BookCover title={book.title} coverUrl={book.cover_url} className="w-[110px] h-[164px] rounded-[10px] shadow-[0_10px_26px_rgba(0,0,0,.18)] flex-none" />
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
          <button
            className="mt-3 border-0 bg-ink text-white rounded-xl px-4 py-2 text-[11px] font-bold"
            onClick={changeStatus}
          >
            {statusLabel}
          </button>
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
              className="w-full accent-ink mt-3"
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
              <button className="border-0 bg-ink text-white rounded-xl px-4 text-[12px] font-bold" onClick={() => commitPage(page)}>
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
            className={`flex-1 border-0 rounded-xl text-[12px] font-bold ${quoteText.trim() ? 'bg-ink text-white' : 'bg-[#DDDDD8] text-white'}`}
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
