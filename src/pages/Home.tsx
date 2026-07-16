import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { Card, Label, EmptyState, Field, inputCls, SaveButton } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { MoneySheet } from '../components/MoneySheet'
import { DateStrip } from '../components/DateStrip'
import { BookCover, DiaryPhoto } from '../components/CoverImg'
import { useBooks, updateBookPage, addQuote } from '../lib/books'
import { pendingConfirmations } from '../lib/recurrence'
import { useInvalidate, useUserId, useCategories, catName, catIcon } from '../lib/queries'
import { fmt, ymd, todayStr, fmtTimeHM, fmtDot, dayStartISO, nextDayStartISO, todoCompare } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Book, BookQuote, Diary, MoneyEntry, Todo } from '../types'

// ---------------- 인사말 (고정 이름 + 매일 바뀌는 랜덤 문구) ----------------
const GREETINGS = [
  '오늘도 행복한 하루 되세요☺️',
  '행운 가득한 하루 되세요🍀',
  '즐거운 일만 가득하길!💃🕺',
  '오늘도 화이팅!💪',
  '오늘은 라떼 마시기☕️',
  '행운을 빌어요🍀🍀🍀',
  '기쁜일만 있을거에요!🌈',
]

function Greeting() {
  // 날짜 기반 시드 — 하루 동안 같은 문구, 매일 바뀜
  const today = todayStr()
  let h = 0
  for (let i = 0; i < today.length; i++) h = (h * 31 + today.charCodeAt(i)) % 99991
  const phrase = GREETINGS[h % GREETINGS.length]
  return (
    <div className="pt-2 pb-3 px-0.5">
      <h1 className="text-[24px] font-extrabold tracking-tight leading-[1.35] m-0">
        수민님,
        <br />
        {phrase}
      </h1>
    </div>
  )
}

// ---------------- 날씨 (서울 고정, Open-Meteo) ----------------
const WEATHER_MAP: [number[], string, string][] = [
  [[0], '☀️', '맑음'],
  [[1, 2], '🌤️', '대체로 맑음'],
  [[3], '☁️', '흐림'],
  [[45, 48], '🌫️', '안개'],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67], '🌧️', '비'],
  [[71, 73, 75, 77, 85, 86], '🌨️', '눈'],
  [[80, 81, 82], '🌦️', '소나기'],
  [[95, 96, 99], '⛈️', '뇌우'],
]

function Weather() {
  const { data } = useQuery({
    queryKey: ['weather'],
    queryFn: async () => {
      const r = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,weather_code&daily=precipitation_probability_max&forecast_days=1&timezone=Asia%2FSeoul',
      )
      if (!r.ok) throw new Error('weather fail')
      return (await r.json()) as {
        current: { temperature_2m: number; weather_code: number }
        daily?: { precipitation_probability_max?: number[] }
      }
    },
    staleTime: 30 * 60 * 1000,
    retry: 0,
  })
  if (!data) return null
  const code = data.current.weather_code
  const [, icon, label] = WEATHER_MAP.find(([codes]) => codes.includes(code)) ?? [[], '☀️', '']
  const rain = data.daily?.precipitation_probability_max?.[0]
  return (
    <div className="flex items-center gap-2 text-[13px] text-sub font-semibold px-0.5 pt-1 pb-2.5">
      {icon} <b className="text-ink text-[15px]">{Math.round(data.current.temperature_2m)}°</b>
      {label}
      {rain != null && <span>· 💧{rain}%</span>}
      <span>· 서울</span>
    </div>
  )
}

// ---------------- 필사 랜덤 ----------------
function RandomQuote() {
  const { data: books } = useBooks()
  const [seed, setSeed] = useState(0)
  const { data: quotes } = useQuery({
    queryKey: ['quotes', 'all', 'nolimit'],
    queryFn: async () => {
      const { data, error } = await sb().from('book_quotes').select('*')
      if (error) throw error
      return data as BookQuote[]
    },
  })
  const quote = useMemo(() => {
    if (!quotes?.length) return null
    return quotes[Math.floor(Math.abs(Math.sin(seed + 1)) * 7919) % quotes.length]
  }, [quotes, seed])
  if (!quote) return null
  const book = (books ?? []).find((b) => b.id === quote.book_id)
  return (
    <div
      className="bg-cream rounded-[18px] px-4 py-3.5 mb-3 cursor-pointer"
      onClick={() => setSeed((s) => s + 1)}
    >
      <p className="m-0 font-serif text-[12.5px] leading-[1.6] text-[#3d3628]">“{quote.content}”</p>
      {book && (
        <cite className="block mt-1.5 not-italic text-[10px] font-semibold text-[#9a8b70]">
          — {book.title}
          {book.author ? ` · ${book.author}` : ''}
        </cite>
      )}
    </div>
  )
}

// ---------------- 고정지출 확인 카드 ----------------
function PendingRecurring() {
  const invalidate = useInvalidate()
  const userId = useUserId()
  const { data: pending, refetch } = useQuery({
    queryKey: ['pending-recurring'],
    queryFn: pendingConfirmations,
    staleTime: 60 * 1000,
  })
  if (!pending?.length) return null
  const confirmOne = async (i: number) => {
    const { rule, date } = pending[i]
    const table = rule.kind === 'expense' ? 'expenses' : rule.kind === 'income' ? 'incomes' : 'savings'
    const base: Record<string, unknown> = {
      user_id: userId,
      amount: rule.amount,
      memo: rule.name,
      occurred_at: `${date}T12:00:00`,
      recurring_id: rule.id,
    }
    if (rule.kind === 'saving') base.category_id = rule.major_category_id
    else {
      base.major_category_id = rule.major_category_id
      base.minor_category_id = rule.minor_category_id
    }
    if (rule.kind === 'expense') base.payment_method_id = rule.payment_method_id
    await sb().from(table).insert(base)
    invalidate(['money', 'summary'])
    refetch()
    toast('등록했어요')
  }
  return (
    <>
      {pending.map((p, i) => (
        <Card key={`${p.rule.id}-${p.date}`} className="mb-3 !py-3.5" onClick={() => confirmOne(i)}>
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold">
              💡 {p.rule.name} {p.rule.kind === 'income' ? '들어올' : '낼'} 날이에요
              <span className="block text-[11px] text-sub font-semibold mt-0.5 tabular">
                {new Date(p.date + 'T00:00:00').getMonth() + 1}월{' '}
                {new Date(p.date + 'T00:00:00').getDate()}일 · {fmt(p.rule.amount)}원 · 탭해서 등록
              </span>
            </div>
          </div>
        </Card>
      ))}
    </>
  )
}

// ---------------- 그날의 소비 카드 ----------------
function DayExpenseCard({ date, onOpen }: { date: string; onOpen: () => void }) {
  const { data: cats } = useCategories()
  const { data: rows } = useQuery({
    queryKey: ['money', 'day', date],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('expenses')
        .select('*')
        .eq('is_skipped', false)
        .gte('occurred_at', dayStartISO(date))
        .lt('occurred_at', nextDayStartISO(date))
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return data as MoneyEntry[]
    },
  })
  const total = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const isToday = date === todayStr()
  return (
    <Card onClick={onOpen} className="h-[180px] flex flex-col overflow-hidden">
      <Label>{isToday ? '오늘' : fmtDot(date)} 소비</Label>
      <div className="text-[24px] font-bold tracking-tighter tabular mt-0.5">{fmt(total)}</div>
      <div className="mt-2 flex-1 overflow-y-auto no-scrollbar">
        {(rows ?? []).map((r) => (
          <div
            key={r.id}
            className="flex justify-between text-[12px] py-[5px] border-b border-line last:border-0"
          >
            <span className="truncate mr-1">
              {(catIcon(cats, r.major_category_id) || catIcon(cats, r.minor_category_id)) && (
                <span className="mr-1">
                  {catIcon(cats, r.major_category_id) || catIcon(cats, r.minor_category_id)}
                </span>
              )}
              {r.memo || catName(cats, r.major_category_id) || '소비'}
            </span>
            <span className="tabular flex-none">{fmt(Number(r.amount))}</span>
          </div>
        ))}
        {!rows?.length && <div className="text-[11px] text-sub py-1">탭해서 기록하기</div>}
      </div>
    </Card>
  )
}

// ---------------- 그날의 할일 카드 ----------------
function DayTodoCard({ date }: { date: string }) {
  const invalidate = useInvalidate()
  const isToday = date === todayStr()
  const { data: todos } = useQuery({
    queryKey: ['todos', 'day', date],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('todos')
        .select('*')
        .eq('is_skipped', false)
        .eq('due_date', date)
        .order('is_done')
        .order('sort_order')
      if (error) throw error
      return data as Todo[]
    },
  })
  const toggle = async (t: Todo) => {
    await sb()
      .from('todos')
      .update({ is_done: !t.is_done, done_at: !t.is_done ? new Date().toISOString() : null })
      .eq('id', t.id)
    invalidate(['todos'])
  }
  const list = (todos ?? []).slice().sort(todoCompare)
  const allDone = (todos ?? []).length > 0 && (todos ?? []).every((t) => t.is_done)
  return (
    <Card className="!p-3.5 h-[180px] flex flex-col overflow-hidden">
      <Label className="mb-2">
        {isToday ? '오늘 할일' : `${fmtDot(date)} 할일`}
        {allDone && isToday && <span className="ml-1 text-[#9AA05E]">· 다 했어요 🎉</span>}
      </Label>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!todos?.length && <div className="text-[11px] text-sub py-1">할일이 없어요</div>}
        {list.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-[11px] py-[9px] mb-1.5 text-[11px] font-semibold leading-snug cursor-pointer transition-colors flex items-center gap-1 ${
              t.is_done ? 'bg-transparent text-[#C4C4C0] line-through font-medium' : 'bg-[#F6F6F3]'
            }`}
            onClick={() => toggle(t)}
          >
            {t.template_id && <span className="text-[#9AA05E] text-[9px]">↻</span>}
            <span className="flex-1">{t.content}</span>
            {t.due_time && (
              <span className="text-sub text-[10px] flex-none tabular no-underline">
                {fmtTimeHM(t.due_time)}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ---------------- 읽는 중 책 카드 + 시트 ----------------
function ReadingCard() {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const { data: books } = useBooks()
  const [open, setOpen] = useState(false)
  const [pageInput, setPageInput] = useState('')
  const [quoteInput, setQuoteInput] = useState('')
  const [quotePage, setQuotePage] = useState('')

  const { data: lastLog } = useQuery({
    queryKey: ['reading_logs', 'latest'],
    queryFn: async () => {
      const { data } = await sb()
        .from('reading_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
      return data?.[0] ?? null
    },
  })

  const book: Book | undefined = useMemo(() => {
    const reading = (books ?? []).filter((b) => b.status === 'reading')
    if (lastLog) {
      const b = reading.find((x) => x.id === lastLog.book_id)
      if (b) return b
    }
    return reading[0]
  }, [books, lastLog])

  if (!book)
    return (
      <Card className="h-[120px] overflow-hidden">
        <Label>읽는 중</Label>
        <EmptyState>읽는 중인 책이 없어요</EmptyState>
      </Card>
    )

  const pct = book.total_pages
    ? Math.min(100, Math.round((book.current_page / book.total_pages) * 100))
    : 0

  const save = async () => {
    const p = parseInt(pageInput.replace(/[^0-9]/g, ''), 10)
    let saved = false
    try {
      if (p && p !== book.current_page) {
        await updateBookPage(userId, book, p)
        saved = true
      }
      if (quoteInput.trim()) {
        await addQuote(userId, book.id, quoteInput.trim(), parseInt(quotePage, 10) || null)
        saved = true
      }
    } catch (e) {
      toastError('저장 실패', e)
      return
    }
    if (!saved) {
      toast('변경된 내용이 없어요')
      return
    }
    invalidate(['books', 'reading_logs', 'quotes'])
    toast(quoteInput.trim() ? '쪽수와 필사를 저장했어요' : '쪽수를 저장했어요')
    setQuoteInput('')
    setQuotePage('')
    setOpen(false)
  }

  return (
    <>
      <Card
        className="h-[120px] overflow-hidden !p-3.5"
        onClick={() => {
          setPageInput(String(book.current_page))
          setOpen(true)
        }}
      >
        <Label>읽는 중</Label>
        <div className="flex gap-2.5 mt-1 items-center">
          <BookCover title={book.title} coverUrl={book.cover_url} thumb className="w-8 h-[46px] rounded-md flex-none shadow-card" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-snug truncate">{book.title}</div>
            <div className="text-[11px] text-sub mt-1 tabular">
              {book.current_page}
              {book.total_pages ? ` / ${book.total_pages}쪽` : '쪽'}
            </div>
          </div>
        </div>
        <div className="h-[5px] bg-line rounded-lg overflow-hidden mt-2">
          <i className="block h-full bg-acc rounded-lg" style={{ width: `${pct}%` }} />
        </div>
      </Card>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={book.title}>
        <Field label="읽은 쪽수">
          <input
            className={inputCls}
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </Field>
        <Field label="필사 문장 (선택)">
          <textarea
            className={inputCls}
            rows={3}
            placeholder="기억에 남는 문장을 적어두세요"
            value={quoteInput}
            onChange={(e) => setQuoteInput(e.target.value)}
          />
          <input
            className={inputCls + ' !w-24 mt-2'}
            inputMode="numeric"
            placeholder="쪽수"
            value={quotePage}
            onChange={(e) => setQuotePage(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </Field>
        <SaveButton onClick={save} />
      </BottomSheet>
    </>
  )
}

// ---------------- 메모 ----------------
function MemoCard() {
  const userId = useUserId()
  const [text, setText] = useState<string | null>(null)
  const noteId = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const { data: note, isFetched } = useQuery({
    queryKey: ['notes'],
    queryFn: async () => {
      const { data } = await sb().from('notes').select('*').limit(1)
      return data?.[0] ?? null
    },
  })

  useEffect(() => {
    if (isFetched && text === null) {
      setText(note?.content ?? '')
      noteId.current = note?.id ?? null
    }
  }, [isFetched, note])

  const onChange = (v: string) => {
    setText(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      if (noteId.current) {
        await sb()
          .from('notes')
          .update({ content: v, updated_at: new Date().toISOString() })
          .eq('id', noteId.current)
      } else {
        const { data } = await sb()
          .from('notes')
          .insert({ user_id: userId, content: v })
          .select()
          .single()
        if (data) noteId.current = data.id
      }
    }, 800)
  }

  return (
    <Card className="!p-3.5 h-[120px] flex flex-col overflow-hidden">
      <Label>메모</Label>
      <textarea
        className="w-full border-0 outline-none resize-none text-[13px] text-[#555] leading-relaxed mt-1.5 flex-1 bg-transparent overflow-y-auto"
        value={text ?? ''}
        placeholder="메모…"
        onChange={(e) => onChange(e.target.value)}
      />
    </Card>
  )
}

// ---------------- 일기 카드 (오늘 = 어제 일기, 과거 날짜 = 그 날짜 일기) ----------------
function DayDiaryCard({ date }: { date: string }) {
  const isToday = date === todayStr()
  const target = isToday ? ymd(addDays(new Date(date + 'T00:00:00'), -1)) : date
  const label = isToday ? '어제 일기' : `${fmtDot(target)} 일기`
  const { data: diaries } = useQuery({
    queryKey: ['diaries', 'day', target],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('diaries')
        .select('*')
        .eq('entry_date', target)
        .order('entry_time', { ascending: false, nullsFirst: false })
      if (error) throw error
      return data as Diary[]
    },
  })
  const latest = diaries?.[0]
  return (
    <Card className="flex gap-3 items-center !p-3 h-[104px] overflow-hidden">
      {latest?.photo_url && (
        <DiaryPhoto path={latest.photo_url} thumb className="w-14 h-14 rounded-[14px] flex-none" />
      )}
      <div className="min-w-0 flex-1 h-full flex flex-col py-0.5">
        <Label className="flex-none">
          {label}
          {latest?.entry_time && (
            <span className="ml-1 font-semibold">{fmtTimeHM(latest.entry_time)}</span>
          )}
          {(diaries?.length ?? 0) > 1 && (
            <span className="ml-1.5 bg-sage rounded-md px-1.5 py-0.5 text-[9px] text-[#3d5548] font-bold">
              +{diaries!.length - 1}개 더
            </span>
          )}
        </Label>
        {latest ? (
          <div className="mt-1 flex-1 overflow-y-auto no-scrollbar">
            <p className="m-0 text-[13px] leading-[1.55] text-[#444]">
              {latest.content ?? '(사진 일기)'}
            </p>
          </div>
        ) : (
          <p className="mt-1 mb-0 text-[12px] text-sub">
            {isToday ? '어제는 기록이 없어요' : '이 날은 기록이 없어요'}
          </p>
        )}
      </div>
    </Card>
  )
}

export default function HomePage() {
  const [selDate, setSelDate] = useState(todayStr())
  const [expenseOpen, setExpenseOpen] = useState(false)
  return (
    <div>
      <Greeting />
      <Weather />
      <RandomQuote />
      <PendingRecurring />
      <div className="mb-3">
        <DayDiaryCard date={selDate} />
      </div>
      <DateStrip selected={selDate} onSelect={setSelDate} />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <DayExpenseCard date={selDate} onOpen={() => setExpenseOpen(true)} />
        <DayTodoCard date={selDate} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ReadingCard />
        <MemoCard />
      </div>
      <MoneySheet open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </div>
  )
}
