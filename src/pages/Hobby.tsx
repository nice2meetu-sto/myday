import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { motion } from 'framer-motion'
import { Card, Label, SegmentedControl, AddButton, PageHead, EmptyState, Field, inputCls, SaveButton, ChipRow, PeriodNav, popIn } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { BookCover, coverFallbackColor } from '../components/CoverImg'
import { useBooks, useQuotes, kindIcon, kindLabel, unitOf, logUnitOf, hasProgress, isVideo } from '../lib/books'
import { uploadImage } from '../lib/image'
import { useInvalidate, useUserId } from '../lib/queries'
import { ymd, todayStr, DAY_NAMES, dayStartISO, nextDayStartISO, localDateOf } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Book, BookQuote, ReadingLog } from '../types'

// 종류 선택값 — 저장 시 kind/video_type으로 분해
type EntryKind = 'book' | 'movie' | 'drama'
const KIND_OPTIONS: { value: EntryKind; label: string }[] = [
  { value: 'book', label: '📖 책' },
  { value: 'movie', label: '🎬 영화' },
  { value: 'drama', label: '📺 드라마' },
]
function splitKind(k: EntryKind) {
  return k === 'book'
    ? { kind: 'book' as const, video_type: null }
    : { kind: 'video' as const, video_type: k }
}

// ---------------- 작품 추가 시트 ----------------
function AddBookSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [entryKind, setEntryKind] = useState<EntryKind>('book')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [pages, setPages] = useState('')
  const [status, setStatus] = useState<'want' | 'reading'>('want')
  const [coverMode, setCoverMode] = useState<'upload' | 'url'>('upload')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [urlError, setUrlError] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const meta = splitKind(entryKind)
  const isVid = meta.kind === 'video'

  const save = async () => {
    if (!title.trim()) {
      toast('제목을 입력해주세요')
      return
    }
    setBusy(true)
    let cover: string | null = null
    if (coverMode === 'upload' && coverFile) {
      try {
        const r = await uploadImage('covers', userId, coverFile)
        cover = r.path
      } catch {
        toast('이미지 업로드에 실패했어요 · 이미지 없이 저장합니다')
      }
    } else if (coverMode === 'url' && coverUrl.trim()) {
      cover = coverUrl.trim()
    }
    const { error } = await sb().from('books').insert({
      user_id: userId,
      title: title.trim(),
      author: author.trim() || null,
      kind: meta.kind,
      video_type: meta.video_type,
      total_pages: parseInt(pages, 10) || null,
      cover_url: cover,
      status,
      started_at: status === 'reading' ? todayStr() : null,
    })
    setBusy(false)
    if (error) {
      toastError('저장 실패', error)
      return
    }
    invalidate(['books'])
    toast(`${KIND_OPTIONS.find((k) => k.value === entryKind)!.label.slice(2)}을(를) 추가했어요`)
    setTitle('')
    setAuthor('')
    setPages('')
    setCoverFile(null)
    setCoverUrl('')
    setStatus('want')
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="추가하기">
      <Field label="종류">
        <ChipRow options={KIND_OPTIONS} value={entryKind} onChange={setEntryKind} />
      </Field>
      <Field label="제목">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <Field label={isVid ? '감독 · 출연' : '작가'}>
        <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} />
      </Field>
      <div className="flex gap-3">
        {/* 영화는 진행률 개념이 없어 분량 입력을 두지 않는다 */}
        {entryKind !== 'movie' && (
          <div className="w-[38%]">
            <Field label={entryKind === 'drama' ? '전체 화수' : '전체 쪽수'}>
              <input className={inputCls} inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
          </div>
        )}
        <div className="flex-1">
          <Field label="상태">
            <ChipRow
              options={[
                { value: 'want', label: isVid ? '보고 싶어요' : '읽고 싶어요' },
                { value: 'reading', label: isVid ? '보는 중' : '읽는 중' },
              ]}
              value={status}
              onChange={setStatus}
            />
          </Field>
        </div>
      </div>
      <Field label={isVid ? '포스터 (선택)' : '표지 (선택)'}>
        <SegmentedControl
          className="mb-2"
          options={[
            { value: 'upload', label: '사진 업로드' },
            { value: 'url', label: 'URL 붙여넣기' },
          ]}
          value={coverMode}
          onChange={setCoverMode}
        />
        {coverMode === 'upload' ? (
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
        ) : (
          <>
            <input
              className={inputCls}
              placeholder="https://..."
              value={coverUrl}
              onChange={(e) => {
                setCoverUrl(e.target.value)
                setUrlError(false)
              }}
            />
            {coverUrl.trim() && (
              <div className="mt-2 flex justify-center">
                <img
                  src={coverUrl.trim()}
                  alt=""
                  className="h-28 rounded-lg shadow-card object-cover"
                  onError={() => setUrlError(true)}
                  onLoad={() => setUrlError(false)}
                />
              </div>
            )}
            {urlError && (
              <p className="text-[11px] text-sub mt-1">이미지를 불러올 수 없어요</p>
            )}
          </>
        )}
      </Field>
      <SaveButton onClick={save} disabled={busy}>
        {busy ? '저장 중…' : '저장'}
      </SaveButton>
    </BottomSheet>
  )
}

// ---------------- 보관함 뷰 ----------------
type ShelfFilter = 'all' | 'book' | 'movie' | 'drama'
const SHELF_FILTERS: { value: ShelfFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'book', label: '📖 책' },
  { value: 'movie', label: '🎬 영화' },
  { value: 'drama', label: '📺 드라마' },
]
function matchFilter(b: Book, f: ShelfFilter): boolean {
  if (f === 'all') return true
  if (f === 'book') return b.kind !== 'video'
  return b.kind === 'video' && b.video_type === f
}

function ShelfView() {
  const nav = useNavigate()
  const { data: books } = useBooks()
  const invalidate = useInvalidate()
  const readingShelfRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ book: Book; x: number; y: number; over: boolean } | null>(null)
  const [filter, setFilter] = useState<ShelfFilter>('all')

  const list = (books ?? []).filter((b) => matchFilter(b, filter))
  const reading = list.filter((b) => b.status === 'reading')
  const want = list.filter((b) => b.status === 'want')
  const finished = list.filter((b) => b.status === 'finished')

  // 섹션 제목 — 필터가 걸리면 그 종류에 맞는 동사로
  const verb = (s: 'want' | 'reading' | 'finished') => {
    if (filter === 'all')
      return s === 'want' ? '보고 싶은 것' : s === 'reading' ? '지금 보는 중' : '다 본 것'
    const vid = filter !== 'book'
    if (s === 'want') return vid ? '보고 싶은 것' : '읽고 싶은 책'
    if (s === 'reading') return vid ? '지금 보는 중' : '지금 읽는 중'
    return vid ? '다 본 것' : '다 읽은 책'
  }

  const startReading = async (b: Book) => {
    await sb().from('books').update({ status: 'reading', started_at: todayStr() }).eq('id', b.id)
    invalidate(['books'])
    toast(`'${b.title}' ${isVideo(b) ? '보기' : '읽기'} 시작!`)
  }

  // 읽고 싶은 책 → 읽는 중 드래그
  const onWantPointerDown = (b: Book, e: React.PointerEvent) => {
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false
    const timer = setTimeout(() => {
      dragging = true
      setDrag({ book: b, x: startX, y: startY, over: false })
      if (navigator.vibrate) navigator.vibrate(10)
    }, 300)
    const isOver = (x: number, y: number) => {
      const r = readingShelfRef.current?.getBoundingClientRect()
      return !!r && y > r.top && y < r.bottom && x > r.left && x < r.right
    }
    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
          clearTimeout(timer)
          cleanup()
        }
        return
      }
      ev.preventDefault()
      setDrag({ book: b, x: ev.clientX, y: ev.clientY, over: isOver(ev.clientX, ev.clientY) })
    }
    const onUp = (ev: PointerEvent) => {
      clearTimeout(timer)
      cleanup()
      if (dragging) {
        if (isOver(ev.clientX, ev.clientY)) startReading(b)
        setDrag(null)
      } else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 8) {
        nav(`/hobby/${b.id}`)
      }
    }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-3 mt-0.5 no-scrollbar">
        {SHELF_FILTERS.map((f) => (
          <span
            key={f.value}
            className={`flex-none rounded-[10px] px-3 py-2 text-[11px] font-bold cursor-pointer ${
              filter === f.value ? 'bg-acc text-white' : 'bg-white shadow-card border border-black/10'
            }`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </span>
        ))}
      </div>

      <h3 className="text-[13px] font-extrabold mx-0.5 mt-1 mb-2">{verb('reading')}</h3>
      <div
        ref={readingShelfRef}
        className={`flex gap-3.5 overflow-x-auto px-1.5 pt-2.5 pb-4 -mx-1.5 rounded-[18px] snap-x snap-mandatory no-scrollbar transition-colors ${
          drag ? 'bg-pale/50 outline outline-[1.5px] outline-paled' : ''
        }`}
      >
        {!reading.length && (
          <div className="w-full py-6 text-center text-[12px] text-sub font-medium">
            아직 없어요
          </div>
        )}
        {reading.map((b) => {
          const pct = b.total_pages ? Math.min(100, Math.round((b.current_page / b.total_pages) * 100)) : 0
          const showProgress = hasProgress(b) && !!b.total_pages
          return (
            <div
              key={b.id}
              className="flex-none w-32 snap-center cursor-pointer select-none"
              onClick={() => nav(`/hobby/${b.id}`)}
            >
              <BookCover title={b.title} coverUrl={b.cover_url} className="w-32 h-[190px] rounded-[10px]" />
              <p className="mt-2 mb-0.5 text-[12px] font-bold tracking-tight truncate">
                {kindIcon(b)} {b.title}
              </p>
              <small className="text-[10px] text-sub">
                {showProgress ? `${pct}% · ${b.current_page}${unitOf(b)}` : kindLabel(b)}
              </small>
              {showProgress && (
                <div className="h-1 bg-line rounded mt-1 overflow-hidden">
                  <i className="block h-full bg-acc rounded" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <h3 className="text-[13px] font-extrabold mx-0.5 mt-4 mb-2">{verb('want')}</h3>
      <div className="flex gap-3.5 overflow-x-auto px-1.5 pt-1 pb-4 -mx-1.5 no-scrollbar">
        {!want.length && (
          <div className="w-full py-4 text-center text-[12px] text-sub font-medium">
            추가해보세요
          </div>
        )}
        {want.map((b) => (
          <div
            key={b.id}
            className={`flex-none w-[78px] cursor-grab select-none ${drag?.book.id === b.id ? 'opacity-30' : ''}`}
            style={{ touchAction: 'pan-x' }}
            onPointerDown={(e) => onWantPointerDown(b, e)}
          >
            <BookCover title={b.title} coverUrl={b.cover_url} thumb className="w-[78px] h-[116px] rounded-lg shadow-card pointer-events-none" />
          </div>
        ))}
      </div>

      <h3 className="text-[13px] font-extrabold mx-0.5 mt-4 mb-2">{verb('finished')}</h3>
      <div className="flex gap-3.5 overflow-x-auto px-1.5 pt-1 pb-4 -mx-1.5 no-scrollbar">
        {!finished.length && (
          <div className="w-full py-4 text-center text-[12px] text-sub font-medium">
            아직 없어요
          </div>
        )}
        {finished.map((b) => (
          <div key={b.id} className="flex-none w-[78px] cursor-pointer" onClick={() => nav(`/hobby/${b.id}`)}>
            <BookCover title={b.title} coverUrl={b.cover_url} thumb className="w-[78px] h-[116px] rounded-lg shadow-card" />
            <small className="text-[10px] text-sub block mt-1 truncate">
              {b.rating != null ? `★ ${b.rating}` : kindIcon(b)}
            </small>
          </div>
        ))}
      </div>

      {drag && (
        <div
          className="fixed z-[99] pointer-events-none opacity-90 -rotate-3 scale-105 drop-shadow-2xl"
          style={{ left: drag.x - 39, top: drag.y - 70 }}
        >
          <BookCover title={drag.book.title} coverUrl={drag.book.cover_url} thumb className="w-[78px] h-[116px] rounded-lg" />
        </div>
      )}
    </div>
  )
}

// ---------------- 통계 뷰 ----------------
function StatsView() {
  const { data: books } = useBooks()
  const [anchor, setAnchor] = useState(() => new Date())
  const [selDay, setSelDay] = useState<string | null>(null)
  const [barSel, setBarSel] = useState<string | null>(null)

  const from = ymd(startOfMonth(anchor))
  const to = ymd(endOfMonth(anchor))

  const { data: logs } = useQuery({
    queryKey: ['reading_logs', from],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('reading_logs')
        .select('*')
        .gte('log_date', from)
        .lte('log_date', to)
      if (error) throw error
      return data as ReadingLog[]
    },
  })

  const { data: monthQuotes } = useQuery({
    queryKey: ['quotes', 'month', from],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('book_quotes')
        .select('*')
        .gte('created_at', dayStartISO(from))
        .lt('created_at', nextDayStartISO(to))
      if (error) throw error
      return data as BookQuote[]
    },
  })

  const { data: allLogs12m } = useQuery({
    queryKey: ['reading_logs', '12m'],
    queryFn: async () => {
      const start = ymd(startOfMonth(addMonths(new Date(), -11)))
      const { data, error } = await sb().from('reading_logs').select('*').gte('log_date', start)
      if (error) throw error
      return data as ReadingLog[]
    },
  })

  const bookMap = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])

  const byDay = useMemo(() => {
    const map = new Map<string, ReadingLog[]>()
    ;(logs ?? []).forEach((l) => {
      if (!map.has(l.log_date)) map.set(l.log_date, [])
      map.get(l.log_date)!.push(l)
    })
    return map
  }, [logs])

  const monthStart = startOfMonth(anchor)
  const firstWeekday = monthStart.getDay()
  const daysInMonth = endOfMonth(anchor).getDate()

  // 선택한 날 상세: 책별 합산
  const dayDetail = useMemo(() => {
    if (!selDay) return null
    const dayLogs = byDay.get(selDay) ?? []
    if (!dayLogs.length) return null
    const byBook = new Map<string, { pages: number; end: number }>()
    dayLogs
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((l) => {
        const cur = byBook.get(l.book_id) ?? { pages: 0, end: 0 }
        cur.pages += l.pages_read
        cur.end = l.end_page
        byBook.set(l.book_id, cur)
      })
    const quotes = (monthQuotes ?? []).filter((q) => localDateOf(q.created_at) === selDay)
    return { byBook: [...byBook.entries()], quotes }
  }, [selDay, byDay, monthQuotes])

  // 월별 완독 (최근 12개월)
  const finishedByMonth = useMemo(() => {
    const out: { key: string; label: string; books: Book[] }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = addMonths(new Date(), -i)
      const key = format(d, 'yyyy-MM')
      out.push({
        key,
        label: `${d.getMonth() + 1}월`,
        books: (books ?? []).filter((b) => b.finished_at?.startsWith(key)),
      })
    }
    return out
  }, [books])
  const maxFinished = Math.max(1, ...finishedByMonth.map((m) => m.books.length))

  // 이번달 진행량 — 단위가 다르니 종류별로 따로 집계 (쪽 / 화 / 편)
  const thisMonthTotals = useMemo(() => {
    let pages = 0
    let eps = 0
    let movies = 0
    ;(allLogs12m ?? [])
      .filter((l) => l.log_date.startsWith(format(new Date(), 'yyyy-MM')))
      .forEach((l) => {
        const b = bookMap.get(l.book_id)
        if (b && isVideo(b)) {
          if (b.video_type === 'movie') movies += l.pages_read
          else eps += l.pages_read
        } else {
          pages += l.pages_read
        }
      })
    return { pages, eps, movies }
  }, [allLogs12m, bookMap])

  return (
    <div>
      <Card className="mb-3 mt-1">
        <PeriodNav
          label={format(anchor, 'yyyy년 M월')}
          onPrev={() => {
            setAnchor(addMonths(anchor, -1))
            setSelDay(null)
          }}
          onNext={() => {
            setAnchor(addMonths(anchor, 1))
            setSelDay(null)
          }}
        />
        <div className="grid grid-cols-7 gap-0.5 mb-1.5">
          {DAY_NAMES.map((d) => (
            <span key={d} className="text-center text-[9px] text-sub font-bold">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`e${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1
            const dateStr = ymd(new Date(anchor.getFullYear(), anchor.getMonth(), d))
            const dayLogs = byDay.get(dateStr) ?? []
            const bookIds = [...new Set(dayLogs.map((l) => l.book_id))]
            const firstBook = bookIds.length ? bookMap.get(bookIds[0]) : undefined
            return (
              <div
                key={d}
                className={`aspect-square relative rounded-[9px] cursor-pointer text-[11px] font-semibold overflow-hidden flex items-center justify-center ${
                  selDay === dateStr ? 'ring-2 ring-[#C9A86A]' : ''
                } ${!firstBook && selDay === dateStr ? 'bg-cream' : ''}`}
                onClick={() => setSelDay(selDay === dateStr ? null : dateStr)}
              >
                {firstBook ? (
                  <>
                    {/* 읽은 날: 칸 가득 표지 */}
                    <BookCover
                      title={firstBook.title}
                      coverUrl={firstBook.cover_url}
                      thumb
                      className="absolute inset-0 w-full h-full"
                    />
                    <span className="absolute top-0.5 left-1 text-[9px] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
                      {d}
                    </span>
                    {bookIds.length > 1 && (
                      <span className="absolute bottom-0.5 right-1 text-[8px] font-bold text-white bg-black/45 rounded px-1">
                        +{bookIds.length - 1}
                      </span>
                    )}
                  </>
                ) : (
                  <span>{d}</span>
                )}
              </div>
            )
          })}
        </div>
        {dayDetail && selDay && (
          <div className="mt-3 pt-3 border-t border-line">
            <Label className="mb-2">
              {new Date(selDay + 'T00:00:00').getMonth() + 1}월 {new Date(selDay + 'T00:00:00').getDate()}일
            </Label>
            {dayDetail.byBook.map(([bookId, v]) => {
              const b = bookMap.get(bookId)
              return (
                <div key={bookId} className="flex items-center gap-2 py-1 text-[13px]">
                  <span className="block w-3.5 h-[19px] rounded-[3px] flex-none overflow-hidden bg-[#DDD]">
                    {b && (
                      <BookCover title={b.title} coverUrl={b.cover_url} thumb className="w-full h-full" />
                    )}
                  </span>
                  <b className="flex-1 truncate">{b?.title ?? '삭제된 항목'}</b>
                  <span className="font-bold">
                    +{v.pages}
                    {logUnitOf(b)}
                  </span>
                  {/* 영화는 1편 완료라 구간 표시가 의미 없다 */}
                  {hasProgress(b) && (
                    <span className="text-sub text-[11px]">
                      ({v.end - v.pages}→{v.end})
                    </span>
                  )}
                </div>
              )
            })}
            {dayDetail.quotes.map((q) => (
              <div
                key={q.id}
                className="mt-2 px-3.5 py-3 bg-cream rounded-xl font-serif text-[12px] leading-relaxed text-[#3d3628]"
              >
                “{q.content}”
                <span className="block mt-1 font-sans text-[10px] font-semibold text-[#9a8b70]">
                  — {bookMap.get(q.book_id)?.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <Label>월별 완료</Label>
        <div className="flex items-end gap-2 h-[90px] mt-2.5">
          {finishedByMonth.map((m) => (
            <div
              key={m.key}
              className="flex-1 flex flex-col justify-end items-center gap-1 cursor-pointer"
              onClick={() => setBarSel(barSel === m.key ? null : m.key)}
            >
              <b className="text-[10px] text-[#9a8b70]">{m.books.length || ''}</b>
              <i
                className="block w-full rounded-t-[5px] bg-cream border border-[#E8DCC4]"
                style={{ height: `${Math.max(4, (m.books.length / maxFinished) * 70)}px` }}
              />
              <small className="text-[8px] text-sub font-bold">{m.label}</small>
            </div>
          ))}
        </div>
        {barSel && (
          <div className="mt-2 text-[12px] font-semibold">
            {finishedByMonth
              .find((m) => m.key === barSel)
              ?.books.map((b) => (
                <div key={b.id} className="py-0.5">
                  {kindIcon(b)} {b.title}
                  {b.rating != null && <span className="text-sub ml-1">★ {b.rating}</span>}
                </div>
              )) ?? null}
            {!finishedByMonth.find((m) => m.key === barSel)?.books.length && (
              <span className="text-sub">완료한 게 없어요</span>
            )}
          </div>
        )}
        <div className="text-[12px] text-sub mt-2.5">
          {thisMonthTotals.pages || thisMonthTotals.eps || thisMonthTotals.movies ? (
            <>
              이번달{' '}
              {[
                thisMonthTotals.pages ? `${thisMonthTotals.pages}쪽` : null,
                thisMonthTotals.eps ? `${thisMonthTotals.eps}화` : null,
                thisMonthTotals.movies ? `${thisMonthTotals.movies}편` : null,
              ]
                .filter(Boolean)
                .join(' · ')}{' '}
              봤어요
            </>
          ) : (
            '이번달 기록이 아직 없어요'
          )}
        </div>
      </Card>
    </div>
  )
}

// ---------------- 후기 목록 (다 보고 남긴 평점·후기) ----------------
function ReviewList() {
  const nav = useNavigate()
  const { data: books } = useBooks()

  const reviewed = useMemo(
    () =>
      (books ?? [])
        .filter((b) => b.status === 'finished' && (b.review || b.rating != null))
        .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? '')),
    [books],
  )

  if (!reviewed.length)
    return <EmptyState>다 보고 나서 남긴 후기가 여기에 모여요</EmptyState>

  return (
    <div>
      {reviewed.map((b) => (
        <motion.div
          {...popIn}
          whileTap={{ scale: 0.98 }}
          key={b.id}
          className="bg-white rounded-card p-3.5 mb-3 shadow-card border border-black/10 cursor-pointer flex gap-3.5"
          onClick={() => nav(`/hobby/${b.id}`)}
        >
          <BookCover
            title={b.title}
            coverUrl={b.cover_url}
            thumb
            className="w-[62px] h-[92px] rounded-lg flex-none"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-bold leading-snug truncate">
                  {kindIcon(b)} {b.title}
                </div>
                {b.author && (
                  <div className="text-[10px] text-sub font-semibold mt-0.5 truncate">{b.author}</div>
                )}
              </div>
              {b.rating != null && (
                <b className="text-[12px] text-[#E8B84B] flex-none tabular">★ {b.rating}</b>
              )}
            </div>
            {b.review ? (
              <p className="mt-1.5 mb-0 text-[12.5px] leading-[1.6] text-[#444] line-clamp-4">
                {b.review}
              </p>
            ) : (
              <p className="mt-1.5 mb-0 text-[12px] text-sub">별점만 남겼어요</p>
            )}
            {b.finished_at && (
              <div className="text-[10px] text-sub font-semibold mt-1.5">
                {new Date(b.finished_at + 'T00:00:00').getMonth() + 1}월{' '}
                {new Date(b.finished_at + 'T00:00:00').getDate()}일
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ---------------- 문장 뷰 ----------------
const PAGE_SIZE = 20

function QuotesView() {
  const { data: books } = useBooks()
  const invalidate = useInvalidate()
  const [mode, setMode] = useState<'quote' | 'review'>('quote')
  const [filter, setFilter] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const { data: quotes } = useQuotes(filter ?? undefined)

  const bookMap = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])
  const visible = (quotes ?? []).slice(0, limit)

  const onLongPress = (q: BookQuote, e: React.PointerEvent) => {
    const timer = setTimeout(async () => {
      if (confirm('이 문장을 삭제할까요?')) {
        await sb().from('book_quotes').delete().eq('id', q.id)
        invalidate(['quotes'])
        toast('삭제했어요')
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

  const booksWithQuotes = (books ?? []).filter((b) => (quotes ?? []).some((q) => q.book_id === b.id) || filter === b.id)

  if (mode === 'review')
    return (
      <div>
        <SegmentedControl
          className="mb-3.5 mt-0.5"
          options={[
            { value: 'quote', label: '문장' },
            { value: 'review', label: '후기' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <ReviewList />
      </div>
    )

  return (
    <div>
      <SegmentedControl
        className="mb-3 mt-0.5"
        options={[
          { value: 'quote', label: '문장' },
          { value: 'review', label: '후기' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className="flex gap-1.5 overflow-x-auto pb-3 no-scrollbar">
        <span
          className={`flex-none rounded-[10px] px-3 py-2 text-[11px] font-bold cursor-pointer ${!filter ? 'bg-acc text-white' : 'bg-white shadow-card'}`}
          onClick={() => setFilter(null)}
        >
          전체
        </span>
        {(filter ? (books ?? []) : booksWithQuotes).map((b) => (
          <span
            key={b.id}
            className={`flex-none rounded-[10px] px-3 py-2 text-[11px] font-bold cursor-pointer ${filter === b.id ? 'bg-acc text-white' : 'bg-white shadow-card'}`}
            onClick={() => setFilter(filter === b.id ? null : b.id)}
          >
            {kindIcon(b)} {b.title}
          </span>
        ))}
      </div>
      {!visible.length && <EmptyState>아직 기록한 문장이 없어요</EmptyState>}
      {visible.map((q) => (
        <motion.div
          {...popIn}
          key={q.id}
          className="bg-cream rounded-card p-[18px] mb-3 shadow-card border border-black/10 select-none"
          onPointerDown={(e) => onLongPress(q, e)}
        >
          <p className="m-0 font-serif text-[13px] leading-[1.7] text-[#3d3628]">“{q.content}”</p>
          <div className="mt-2.5 flex justify-between text-[11px] font-semibold text-[#9a8b70]">
            <span>
              {bookMap.get(q.book_id)?.title ?? ''}
              {bookMap.get(q.book_id)?.author ? ` · ${bookMap.get(q.book_id)!.author}` : ''}
              {q.page ? ` · ${q.page}${unitOf(bookMap.get(q.book_id))}` : ''}
            </span>
            <span>
              {new Date(q.created_at).getMonth() + 1}월 {new Date(q.created_at).getDate()}일
            </span>
          </div>
        </motion.div>
      ))}
      {(quotes ?? []).length > limit && (
        <button
          className="w-full border-0 bg-white shadow-card rounded-xl text-[12px] font-bold py-3 mb-3"
          onClick={() => setLimit(limit + PAGE_SIZE)}
        >
          더 보기
        </button>
      )}
    </div>
  )
}

export default function HobbyPage() {
  const [view, setView] = useState<'shelf' | 'stats' | 'quotes'>('shelf')
  const [addOpen, setAddOpen] = useState(false)

  // 탭바에서 후기 탭 재탭 → 보관함/통계/문장 순환
  useEffect(() => {
    const onRetap = () =>
      setView((v) => (v === 'shelf' ? 'stats' : v === 'stats' ? 'quotes' : 'shelf'))
    window.addEventListener('tab-retap:/hobby', onRetap)
    return () => window.removeEventListener('tab-retap:/hobby', onRetap)
  }, [])
  return (
    <div>
      <PageHead title="후기" right={<AddButton onClick={() => setAddOpen(true)} />} />
      <SegmentedControl
        className="mb-3.5"
        options={[
          { value: 'shelf', label: '보관함' },
          { value: 'stats', label: '통계' },
          { value: 'quotes', label: '문장' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'shelf' && <ShelfView />}
      {view === 'stats' && <StatsView />}
      {view === 'quotes' && <QuotesView />}
      <AddBookSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
