import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { motion } from 'framer-motion'
import { AddButton, PageHead, EmptyState, Field, inputCls, SaveButton, popIn, PeriodNav } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { DiaryPhoto, PhotoLightbox } from '../components/CoverImg'
import { uploadImage, deleteImage } from '../lib/image'
import { useInvalidate, useUserId } from '../lib/queries'
import { fmtDateKo, fmtTimeHM, todayStr, ymd, DAY_NAMES } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Diary } from '../types'

const PAGE = 30

/**
 * 기분 5종 — 색은 앱 팔레트로 맞췄다.
 * v 는 예전 5단계(아주 좋음~힘듦)에 쓰던 값을 그대로 이어받는다.
 * (5 아주 좋음→행복, 4 좋음→감동, 3 보통→보통, 2 별로→슬픔, 1 힘듦→멘붕)
 */
export const MOODS: { v: number; emoji: string; label: string; color: string; good?: boolean }[] = [
  { v: 5, emoji: '😊', label: '행복', color: '#C7CE9A', good: true },
  { v: 3, emoji: '😐', label: '보통', color: '#F3CE62' },
  { v: 2, emoji: '😢', label: '슬픔', color: '#A3C4EB' },
  { v: 1, emoji: '🤯', label: '멘붕', color: '#D1CDC6' },
  { v: 4, emoji: '🥹', label: '감동', color: '#E9A8B5', good: true },
]
export const moodOf = (v: number | null | undefined) => MOODS.find((m) => m.v === v)

/** 기분 선택 줄 — 이모지 하나 탭으로 고르고, 다시 누르면 해제 */
function MoodPicker({
  value,
  onChange,
  size = 'md',
}: {
  value: number | null
  onChange: (v: number | null) => void
  size?: 'md' | 'sm'
}) {
  const box = size === 'md' ? 'h-11 text-[22px]' : 'h-9 text-[18px]'
  return (
    <div className="flex gap-1.5">
      {MOODS.map((m) => {
        const on = value === m.v
        return (
          <button
            key={m.v}
            className={`flex-1 ${box} rounded-xl border leading-none transition-all ${
              on ? 'border-transparent scale-[1.06]' : 'border-black/10 bg-white grayscale opacity-55'
            }`}
            style={on ? { background: m.color } : undefined}
            onClick={() => onChange(on ? null : m.v)}
            aria-label={m.label}
          >
            {m.emoji}
          </button>
        )
      })}
    </div>
  )
}

function useDiaries(limit: number) {
  return useQuery({
    queryKey: ['diaries', limit],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('diaries')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('entry_time', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (error) throw error
      return data as Diary[]
    },
  })
}

export function DiarySheet({
  open,
  onClose,
  edit,
  initialDate,
}: {
  open: boolean
  onClose: () => void
  edit?: Diary | null
  initialDate?: string
}) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const loaded = useRef<string | null>(null)

  if (open && edit && loaded.current !== edit.id) {
    loaded.current = edit.id
    setDate(edit.entry_date)
    setTime(edit.entry_time?.slice(0, 5) ?? '')
    setContent(edit.content ?? '')
    setMood(edit.mood ?? null)
    setFile(null)
  }
  if (open && !edit && loaded.current !== 'new') {
    loaded.current = 'new'
    setDate(initialDate ?? todayStr())
    const now = new Date()
    setTime(
      `${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`,
    )
    setContent('')
    setMood(null)
    setFile(null)
  }
  if (!open && loaded.current) loaded.current = null

  const save = async () => {
    if (!content.trim() && !file && mood == null && !edit?.photo_url) {
      toast('기분이나 내용, 사진 중 하나는 남겨주세요')
      return
    }
    setBusy(true)
    let photoPath: string | null | undefined = undefined
    if (file) {
      try {
        const r = await uploadImage('diary', userId, file)
        photoPath = r.path
        if (edit?.photo_url) await deleteImage('diary', edit.photo_url)
      } catch {
        toast('사진 업로드에 실패했어요 · 글만 저장합니다')
        photoPath = edit ? undefined : null
      }
    }
    const row: Record<string, unknown> = {
      entry_date: date,
      entry_time: time || null,
      content: content.trim() || null,
      mood,
      updated_at: new Date().toISOString(),
    }
    if (photoPath !== undefined) row.photo_url = photoPath
    const { error } = edit
      ? await sb().from('diaries').update(row).eq('id', edit.id)
      : await sb()
          .from('diaries')
          .insert({ ...row, user_id: userId, photo_url: photoPath ?? null })
    setBusy(false)
    if (error) {
      toastError('저장 실패', error)
      return
    }
    invalidate(['diaries'])
    toast(edit ? '수정했어요' : '일기를 기록했어요')
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={edit ? '일기 수정' : '일기 쓰기'}>
      <div className="flex gap-2">
        <Field label="날짜">
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="시간">
          <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="오늘의 기분">
        <MoodPicker value={mood} onChange={setMood} />
      </Field>
      <Field label="사진 (선택)">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="w-full border-[1.5px] border-dashed border-line rounded-xl py-3 text-[12px] font-semibold text-sub bg-transparent"
          onClick={() => fileRef.current?.click()}
        >
          {file ? `📎 ${file.name}` : edit?.photo_url ? '사진 바꾸기' : '사진 선택'}
        </button>
      </Field>
      <Field label="오늘의 기록">
        <textarea
          className={inputCls}
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="오늘 어땠나요?"
        />
      </Field>
      <SaveButton onClick={save} disabled={busy}>
        {busy ? '저장 중…' : '저장'}
      </SaveButton>
    </BottomSheet>
  )
}

// ---------------- 월별 사진 달력 ----------------
function DiaryCalendar({
  onOpen,
  selDay,
  onSelDay,
}: {
  onOpen: (d: Diary) => void
  selDay: string | null
  onSelDay: (d: string | null) => void
}) {
  const [anchor, setAnchor] = useState(() => new Date())
  const from = ymd(startOfMonth(anchor))
  const to = ymd(endOfMonth(anchor))
  const { data: monthDiaries } = useQuery({
    queryKey: ['diaries', 'cal', from],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('diaries')
        .select('*')
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('entry_time', { ascending: false, nullsFirst: false })
      if (error) throw error
      return data as Diary[]
    },
  })

  const byDate = useMemo(() => {
    const map = new Map<string, Diary[]>()
    ;(monthDiaries ?? []).forEach((d) => {
      if (!map.has(d.entry_date)) map.set(d.entry_date, [])
      map.get(d.entry_date)!.push(d)
    })
    return map
  }, [monthDiaries])

  const firstWeekday = startOfMonth(anchor).getDay()
  const daysInMonth = endOfMonth(anchor).getDate()

  return (
    <motion.div {...popIn} className="bg-white rounded-card p-4 mb-3 shadow-card border border-black/10">
      <PeriodNav
        label={format(anchor, 'yyyy년 M월')}
        onPrev={() => {
          setAnchor(addMonths(anchor, -1))
          onSelDay(null)
        }}
        onNext={() => {
          setAnchor(addMonths(anchor, 1))
          onSelDay(null)
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
          const day = i + 1
          const dateStr = ymd(new Date(anchor.getFullYear(), anchor.getMonth(), day))
          const entries = byDate.get(dateStr) ?? []
          const withPhoto = entries.find((e) => e.photo_url)
          // 그날 기록된 기분 중 하나 (여러 개면 첫 기록)
          const mood = moodOf(entries.find((e) => e.mood != null)?.mood)
          return (
            <div
              key={day}
              className={`aspect-square relative rounded-[9px] overflow-hidden cursor-pointer flex items-center justify-center text-[11px] font-semibold ${
                selDay === dateStr ? 'ring-2 ring-acc' : ''
              }`}
              onClick={() => onSelDay(selDay === dateStr ? null : dateStr)}
            >
              {withPhoto ? (
                <>
                  {/* 사진 있는 날: 칸 가득 사진 + 기분은 모서리 점으로 */}
                  <DiaryPhoto path={withPhoto.photo_url} thumb className="absolute inset-0 w-full h-full" />
                  <span className="absolute top-0.5 left-1 text-[9px] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
                    {day}
                  </span>
                  {mood && (
                    <i
                      className="absolute top-1 right-1 w-2 h-2 rounded-full ring-1 ring-white/80"
                      style={{ background: mood.color }}
                    />
                  )}
                  {entries.length > 1 && (
                    <span className="absolute bottom-0.5 right-1 text-[8px] font-bold text-white bg-black/45 rounded px-1">
                      +{entries.length - 1}
                    </span>
                  )}
                </>
              ) : entries.length ? (
                // 사진 없는 날: 기분 색으로, 기분도 없으면 기존 연두색
                <div
                  className={`absolute inset-0 flex items-center justify-center ${mood ? '' : 'bg-sage'}`}
                  style={mood ? { background: mood.color } : undefined}
                >
                  <span className={`text-[11px] font-bold ${mood ? 'text-black/55' : 'text-[#3d5548]'}`}>
                    {day}
                  </span>
                </div>
              ) : (
                <span>{day}</span>
              )}
            </div>
          )
        })}
      </div>
      {/* 선택한 날짜의 일기 — 달력 아래에 표시 */}
      {selDay && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="text-[11px] font-extrabold text-sub mb-2">{fmtDateKo(selDay)}</div>
          {!(byDate.get(selDay)?.length ?? 0) && (
            <div className="text-[12px] text-sub py-2">이 날은 기록이 없어요</div>
          )}
          {(byDate.get(selDay) ?? []).map((d) => (
            <div
              key={d.id}
              className="bg-[#FAFAF8] rounded-2xl mb-2 cursor-pointer p-3 flex gap-3 items-center"
              onClick={() => onOpen(d)}
            >
              {d.photo_url && (
                <DiaryPhoto path={d.photo_url} thumb className="w-12 h-12 rounded-xl flex-none" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {moodOf(d.mood) && <span className="text-[13px]">{moodOf(d.mood)!.emoji}</span>}
                  {d.entry_time && (
                    <time className="text-[10px] text-sub font-bold">{fmtTimeHM(d.entry_time)}</time>
                  )}
                </div>
                {d.content ? (
                  <p className="mt-0.5 mb-0 text-[13px] leading-[1.55] text-[#333] line-clamp-2">
                    {d.content}
                  </p>
                ) : (
                  <p className="mt-0.5 mb-0 text-[12px] text-sub">
                    {d.photo_url ? '(사진 일기)' : `(${moodOf(d.mood)?.label ?? '기록'})`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 날짜를 안 고른 평소에는 이 달 통계로 아래를 채운다 */}
      {!selDay && <DiaryStats monthDiaries={monthDiaries ?? []} anchor={anchor} onOpen={onOpen} />}
    </motion.div>
  )
}

// ---------------- 오늘 기분 한 줄 기록 ----------------
export function QuickMood() {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const today = todayStr()
  const { data: rows } = useQuery({
    queryKey: ['diaries', 'today', today],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('diaries')
        .select('*')
        .eq('entry_date', today)
        .order('entry_time', { ascending: false, nullsFirst: false })
      if (error) throw error
      return data as Diary[]
    },
  })
  // 오늘 기분이 적힌 항목 우선, 없으면 오늘 첫 항목에 기분을 붙인다
  const current = (rows ?? []).find((d) => d.mood != null) ?? rows?.[0] ?? null

  const set = async (v: number | null) => {
    if (current) {
      // 기분만 있던 빈 기록에서 기분을 지우면 그 기록도 함께 정리
      if (v == null && !current.content && !current.photo_url) {
        await sb().from('diaries').delete().eq('id', current.id)
      } else {
        await sb()
          .from('diaries')
          .update({ mood: v, updated_at: new Date().toISOString() })
          .eq('id', current.id)
      }
    } else if (v != null) {
      const now = new Date()
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const { error } = await sb()
        .from('diaries')
        .insert({ user_id: userId, entry_date: today, entry_time: hm, mood: v })
      if (error) {
        toastError('저장 실패', error)
        return
      }
    }
    invalidate(['diaries'])
    if (v != null) toast(`오늘 기분 · ${moodOf(v)!.label}`)
  }

  return (
    <div className="bg-card rounded-card shadow-card border border-black/10 p-3.5 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-bold">오늘 기분은?</span>
        {current?.mood != null && (
          <span className="text-[11px] text-sub font-semibold">{moodOf(current.mood)!.label}</span>
        )}
      </div>
      <MoodPicker value={current?.mood ?? null} onChange={set} size="sm" />
    </div>
  )
}

// ---------------- 달력 아래 통계 (날짜 미선택 시) ----------------
function DiaryStats({
  monthDiaries,
  anchor,
  onOpen,
}: {
  monthDiaries: Diary[]
  anchor: Date
  onOpen: (d: Diary) => void
}) {
  const today = todayStr()

  // 연속 기록용 — 최근 1년치 날짜만 가볍게
  const { data: recentDates } = useQuery({
    queryKey: ['diaries', 'streak'],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('diaries')
        .select('entry_date')
        .gte('entry_date', ymd(addDays(new Date(today + 'T00:00:00'), -400)))
      if (error) throw error
      return new Set((data as { entry_date: string }[]).map((d) => d.entry_date))
    },
  })

  // 한 달 전 오늘 · 1년 전 오늘
  const memoryDates = useMemo(() => {
    const base = new Date(today + 'T00:00:00')
    return [
      { label: '한 달 전 오늘', date: ymd(addMonths(base, -1)) },
      { label: '1년 전 오늘', date: ymd(addMonths(base, -12)) },
    ]
  }, [today])

  const { data: memories } = useQuery({
    queryKey: ['diaries', 'memories', memoryDates.map((m) => m.date).join()],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('diaries')
        .select('*')
        .in('entry_date', memoryDates.map((m) => m.date))
        .order('entry_time', { ascending: false, nullsFirst: false })
      if (error) throw error
      return data as Diary[]
    },
  })

  const streak = useMemo(() => {
    if (!recentDates) return 0
    let n = 0
    let d = new Date(today + 'T00:00:00')
    // 오늘 아직 안 썼으면 어제부터 세서, 하루 안 썼다고 바로 끊기지 않게
    if (!recentDates.has(ymd(d))) {
      d = addDays(d, -1)
      if (!recentDates.has(ymd(d))) return 0
    }
    while (recentDates.has(ymd(d))) {
      n++
      d = addDays(d, -1)
    }
    return n
  }, [recentDates, today])

  const wroteToday = recentDates?.has(today) ?? false
  const dayCount = new Set(monthDiaries.map((d) => d.entry_date)).size
  const daysInMonth = endOfMonth(anchor).getDate()

  // 기분 분포
  const moodCounts = useMemo(() => {
    const m = new Map<number, number>()
    monthDiaries.forEach((d) => {
      if (d.mood != null) m.set(d.mood, (m.get(d.mood) ?? 0) + 1)
    })
    return m
  }, [monthDiaries])
  // 한 달 전 / 1년 전 중 실제로 기록이 있는 것만
  const hits = memoryDates
    .map((m) => ({ label: m.label, hit: (memories ?? []).find((d) => d.entry_date === m.date) }))
    .filter((x): x is { label: string; hit: Diary } => !!x.hit)

  const moodTotal = [...moodCounts.values()].reduce((a, b) => a + b, 0)
  const goodDays = MOODS.filter((m) => m.good).reduce((s, m) => s + (moodCounts.get(m.v) ?? 0), 0)

  return (
    <div className="mt-3 pt-3 border-t border-line">
      {/* 쓴 날 / 연속 기록 */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 bg-[#FAFAF8] rounded-2xl px-3 py-2.5">
          <div className="text-[10px] text-sub font-bold">이 달 기록</div>
          <div className="text-[17px] font-extrabold tabular mt-0.5">
            {dayCount}
            <span className="text-[11px] text-sub font-bold"> / {daysInMonth}일</span>
          </div>
        </div>
        <div className="flex-1 bg-[#FAFAF8] rounded-2xl px-3 py-2.5">
          <div className="text-[10px] text-sub font-bold">연속 기록</div>
          <div className="text-[17px] font-extrabold tabular mt-0.5">
            {streak}
            <span className="text-[11px] text-sub font-bold">
              일{streak > 0 && !wroteToday ? ' (어제까지)' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* 기분 분포 */}
      <div className="text-[10px] text-sub font-bold mb-1.5">이 달 기분</div>
      {moodTotal ? (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden mb-2">
            {MOODS.filter((m) => moodCounts.get(m.v)).map((m) => (
              <i
                key={m.v}
                className="block h-full"
                style={{
                  width: `${((moodCounts.get(m.v) ?? 0) / moodTotal) * 100}%`,
                  background: m.color,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold mb-1">
            {MOODS.filter((m) => moodCounts.get(m.v)).map((m) => (
              <span key={m.v} className="flex items-center gap-1">
                {m.emoji}
                <b className="tabular">{moodCounts.get(m.v)}</b>
              </span>
            ))}
            {goodDays > 0 && (
              <span className="text-sub">
                · 좋은 날 <b className="text-ink">{goodDays}일</b>
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="text-[12px] text-sub py-1 mb-1">아직 기분 기록이 없어요</div>
      )}

      {/* 그날의 기억 — 기록이 있는 날만 (둘 다 없으면 통째로 숨김) */}
      {hits.length > 0 && (
        <>
          <div className="text-[10px] text-sub font-bold mt-3 mb-1.5">그날의 기억</div>
          {hits.map(({ label, hit }) => (
            <div
              key={hit.id}
              className="flex gap-2.5 items-center py-1.5 cursor-pointer"
              onClick={() => onOpen(hit)}
            >
              <span className="text-[10px] text-sub font-bold flex-none w-[62px]">{label}</span>
              {hit.photo_url && (
                <DiaryPhoto path={hit.photo_url} thumb className="w-7 h-7 rounded-lg flex-none" />
              )}
              {moodOf(hit.mood) && <span className="text-[13px]">{moodOf(hit.mood)!.emoji}</span>}
              <span className="text-[12px] text-[#444] truncate flex-1">
                {hit.content || (hit.photo_url ? '(사진 일기)' : moodOf(hit.mood)?.label)}
              </span>
              <span className="text-sub text-[11px] flex-none">›</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default function DiaryPage() {
  const [limit, setLimit] = useState(PAGE)
  const [search, setSearch] = useState('')
  const { data: diaries } = useDiaries(limit)
  const invalidate = useInvalidate()
  const [writing, setWriting] = useState(false)
  const [selDay, setSelDay] = useState<string | null>(null)
  const [detail, setDetail] = useState<Diary | null>(null)
  const [editing, setEditing] = useState<Diary | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  const [moodFilter, setMoodFilter] = useState<number | null>(null)
  const [moodOpen, setMoodOpen] = useState(false)

  const searching = !!search.trim() || moodFilter != null
  const grouped = useMemo(() => {
    const map = new Map<string, Diary[]>()
    const q = search.trim()
    if (!q && moodFilter == null) return []
    ;(diaries ?? [])
      .filter((d) => (!q || (d.content ?? '').includes(q)) && (moodFilter == null || d.mood === moodFilter))
      .forEach((d) => {
        if (!map.has(d.entry_date)) map.set(d.entry_date, [])
        map.get(d.entry_date)!.push(d)
      })
    // 같은 날짜는 시간순 (오름차순 아님 — 최신이 위)
    return [...map.entries()]
  }, [diaries, search, moodFilter])
  const hitCount = grouped.reduce((s, [, items]) => s + items.length, 0)

  const remove = async (d: Diary) => {
    if (!confirm('이 일기를 삭제할까요?')) return
    await deleteImage('diary', d.photo_url)
    await sb().from('diaries').delete().eq('id', d.id)
    invalidate(['diaries'])
    setDetail(null)
    toast('삭제했어요')
  }

  return (
    <div>
      <PageHead title="일기" right={<AddButton onClick={() => setWriting(true)} />} />
      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 min-w-0 border border-black/10 rounded-xl px-3.5 py-[10px] font-semibold text-[13px] outline-none bg-white placeholder:text-[#B8B8B4]"
          placeholder="🔍 일기 내용 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`flex-none w-11 rounded-xl border text-[18px] leading-none transition-all ${
            moodFilter != null
              ? 'border-transparent'
              : `bg-white ${moodOpen ? 'border-acc' : 'border-black/10'}`
          }`}
          style={moodFilter != null ? { background: moodOf(moodFilter)!.color } : undefined}
          onClick={() => setMoodOpen(!moodOpen)}
          aria-label="기분으로 보기"
        >
          {moodFilter != null ? moodOf(moodFilter)!.emoji : '💭'}
        </button>
      </div>
      {moodOpen && (
        <motion.div {...popIn} className="bg-white rounded-card border border-black/10 p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold">기분으로 보기</span>
            {moodFilter != null && (
              <button
                className="border-0 bg-transparent text-[11px] font-bold text-sub p-0"
                onClick={() => setMoodFilter(null)}
              >
                전체 보기
              </button>
            )}
          </div>
          <MoodPicker value={moodFilter} onChange={setMoodFilter} size="sm" />
        </motion.div>
      )}
      {searching && (
        <div className="text-[11px] font-bold text-sub mx-0.5 mb-1">
          {moodFilter != null && `${moodOf(moodFilter)!.emoji} ${moodOf(moodFilter)!.label} · `}
          {hitCount}개
        </div>
      )}
      {/* 검색 중에는 달력 숨김, 평소에는 달력만 (일자 탭 → 그날 일기) */}
      {!searching && (
        <DiaryCalendar onOpen={(d) => setDetail(d)} selDay={selDay} onSelDay={setSelDay} />
      )}
      {searching && !grouped.length && (
        <EmptyState>
          {search.trim() ? '검색 결과가 없어요' : '이 기분으로 기록한 날이 없어요'}
        </EmptyState>
      )}
      {grouped.map(([date, items]) => (
        <div key={date}>
          <div className="text-[11px] font-extrabold text-sub mx-0.5 mt-3.5 mb-2">
            {fmtDateKo(date)}
          </div>
          {items.map((d) => (
            <motion.div
              {...popIn}
              whileTap={{ scale: 0.98 }}
              key={d.id}
              className="bg-white rounded-card mb-3 shadow-card border border-black/10 cursor-pointer p-3 flex gap-3 items-center"
              onClick={() => setDetail(d)}
            >
              {d.photo_url && (
                <DiaryPhoto
                  path={d.photo_url}
                  thumb
                  className="w-14 h-14 rounded-[14px] flex-none"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {moodOf(d.mood) && <span className="text-[13px]">{moodOf(d.mood)!.emoji}</span>}
                  {d.entry_time && (
                    <time className="text-[10px] text-sub font-bold">{fmtTimeHM(d.entry_time)}</time>
                  )}
                </div>
                {d.content ? (
                  <p className="mt-1 mb-0 text-[13px] leading-[1.6] text-[#333] line-clamp-3">
                    {d.content}
                  </p>
                ) : (
                  <p className="mt-1 mb-0 text-[12px] text-sub">
                    {d.photo_url ? '(사진 일기)' : `(${moodOf(d.mood)?.label ?? '기록'})`}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ))}
      {searching && (diaries ?? []).length >= limit && (
        <button
          className="w-full border-0 bg-white shadow-card rounded-xl text-[12px] font-bold py-3 mb-3"
          onClick={() => setLimit(limit + PAGE)}
        >
          더 보기
        </button>
      )}

      {/* 상세 */}
      <BottomSheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${fmtDateKo(detail.entry_date)}${detail.entry_time ? ' · ' + fmtTimeHM(detail.entry_time) : ''}` : ''}
      >
        {/* 사진은 왼쪽에 띄워두고 글이 길면 사진 아래로도 흘러내리게 */}
        <div className="overflow-hidden">
          {detail?.photo_url && (
            <DiaryPhoto
              path={detail.photo_url}
              className="w-[110px] h-[110px] rounded-2xl float-left mr-3 mb-2"
              onClick={() => setZoom(detail.photo_url)}
            />
          )}
          {detail?.content && (
            <p className="text-[14px] leading-[1.7] text-[#333] whitespace-pre-wrap m-0">
              {detail.content}
            </p>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            className="flex-1 border-0 bg-[#F6F6F3] rounded-xl text-[13px] font-bold py-3"
            onClick={() => {
              setEditing(detail)
              setDetail(null)
            }}
          >
            수정
          </button>
          <button
            className="flex-1 border-0 bg-[#F6F6F3] rounded-xl text-[13px] font-bold py-3 text-warn"
            onClick={() => detail && remove(detail)}
          >
            삭제
          </button>
        </div>
      </BottomSheet>

      <PhotoLightbox path={zoom} onClose={() => setZoom(null)} />

      <DiarySheet open={writing} onClose={() => setWriting(false)} initialDate={selDay ?? undefined} />
      <DiarySheet open={!!editing} onClose={() => setEditing(null)} edit={editing} />
    </div>
  )
}
