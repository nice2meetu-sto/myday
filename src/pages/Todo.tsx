import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { Card, SegmentedControl, AddButton, PageHead, EmptyState, Field, inputCls, SaveButton, ChipRow, PeriodNav } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { useInvalidate, useUserId } from '../lib/queries'
import { ensureRecurrences } from '../lib/recurrence'
import { ymd, todayStr, fmtDateKo, DAY_NAMES, fmtTimeHM } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Quadrant, Todo, TodoTemplate } from '../types'

const QUADS: { key: Quadrant; label: string; hi?: boolean }[] = [
  { key: 'ui', label: '급함 · 중요', hi: true },
  { key: 'ni', label: '안급함 · 중요' },
  { key: 'un', label: '급함 · 안중요' },
  { key: 'nn', label: '안급함 · 안중요' },
]

type PickTarget =
  | { type: 'quad'; quad: Quadrant }
  | { type: 'cell'; date: string }

interface PickState {
  todo: Todo
  dragging: boolean
  x: number
  y: number
  hover: string | null // 'q:ui' | 'c:2026-07-21'
}

function useTodosMatrix() {
  const today = todayStr()
  return useQuery({
    queryKey: ['todos', 'matrix', today],
    queryFn: async () => {
      // 기간(미래 포함) 상관없이 미완료는 전부 표시, 완료는 오늘 것만.
      // 단 반복 인스턴스는 오늘까지만 (60일치 미래분이 사분면을 채우지 않게)
      const { data, error } = await sb()
        .from('todos')
        .select('*')
        .eq('is_skipped', false)
        .or(`is_done.eq.false,and(is_done.eq.true,due_date.eq.${today})`)
        .order('is_done')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return (data as Todo[]).filter(
        (t) => !(t.template_id && t.due_date && t.due_date > today),
      )
    },
  })
}

function useTodosMonth(anchor: Date) {
  const from = ymd(startOfMonth(anchor))
  const to = ymd(endOfMonth(anchor))
  return useQuery({
    queryKey: ['todos', 'month', from],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('todos')
        .select('*')
        .eq('is_skipped', false)
        .gte('due_date', from)
        .lte('due_date', to)
        .order('is_done')
        .order('due_time', { nullsFirst: false })
      if (error) throw error
      return data as Todo[]
    },
  })
}

function useTodosNoDate() {
  return useQuery({
    queryKey: ['todos', 'nodate'],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('todos')
        .select('*')
        .eq('is_skipped', false)
        .is('due_date', null)
        .eq('is_done', false)
        .order('created_at')
      if (error) throw error
      return data as Todo[]
    },
  })
}

export default function TodoPage() {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [view, setView] = useState<'mx' | 'cal'>('mx')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [pick, setPick] = useState<PickState | null>(null)
  const [swipeMenu, setSwipeMenu] = useState<Todo | null>(null)
  const [editTodo, setEditTodo] = useState<Todo | null>(null)
  const [editTemplate, setEditTemplate] = useState<TodoTemplate | null>(null)
  const pickRef = useRef<PickState | null>(null)
  pickRef.current = pick

  const today = todayStr()
  const { data: matrixTodos } = useTodosMatrix()
  const [anchor, setAnchor] = useState(() => new Date())
  const [selDate, setSelDate] = useState(today)
  const { data: monthTodos } = useTodosMonth(anchor)
  const { data: noDateTodos } = useTodosNoDate()

  const refresh = () => invalidate(['todos'])

  // ---------- mutations ----------
  const toggleDone = async (t: Todo) => {
    const done = !t.is_done
    const patch: Record<string, unknown> = {
      is_done: done,
      done_at: done ? new Date().toISOString() : null,
    }
    // 기간 미정 할일 완료 시 due_date를 오늘로 (매트릭스에서 바로 사라지지 않게)
    if (done && !t.due_date) patch.due_date = today
    await sb().from('todos').update(patch).eq('id', t.id)
    refresh()
  }

  const placeTodo = async (t: Todo, target: PickTarget) => {
    if (target.type === 'quad') {
      await sb().from('todos').update({ quadrant: target.quad, sort_order: Date.now() % 1000000 }).eq('id', t.id)
      toast(`'${QUADS.find((q) => q.key === target.quad)?.label}'로 옮겼어요`)
    } else {
      const prev = t.due_date
      await sb().from('todos').update({ due_date: target.date }).eq('id', t.id)
      const d = new Date(target.date + 'T00:00:00')
      toast(`${d.getMonth() + 1}월 ${d.getDate()}일로 옮겼어요`, {
        label: '되돌리기',
        fn: async () => {
          await sb().from('todos').update({ due_date: prev }).eq('id', t.id)
          refresh()
        },
      })
    }
    refresh()
  }

  // ---------- unified pick & drag ----------
  const cancelPick = () => {
    setPick(null)
    document.body.classList.remove('moving')
  }

  const findTarget = (x: number, y: number): PickTarget | null => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const q = el.closest('[data-quad]') as HTMLElement | null
    if (q) return { type: 'quad', quad: q.dataset.quad as Quadrant }
    const c = el.closest('[data-caldate]') as HTMLElement | null
    if (c) return { type: 'cell', date: c.dataset.caldate! }
    return null
  }

  const onCardPointerDown = (t: Todo, e: React.PointerEvent) => {
    if (t.is_done) return
    const startX = e.clientX
    const startY = e.clientY
    let lifted = false
    let dragged = false
    let swiped = false

    const timer = setTimeout(() => {
      lifted = true
      setPick({ todo: t, dragging: false, x: startX, y: startY, hover: null })
      document.body.classList.add('moving')
      if (navigator.vibrate) navigator.vibrate(10)
    }, 400)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!lifted) {
        if (Math.hypot(dx, dy) > 8) {
          clearTimeout(timer)
          if (dx < -40 && Math.abs(dy) < 30) swiped = true
        }
        return
      }
      ev.preventDefault()
      dragged = true
      const target = findTarget(ev.clientX, ev.clientY)
      setPick((p) =>
        p
          ? {
              ...p,
              dragging: true,
              x: ev.clientX,
              y: ev.clientY,
              hover: target
                ? target.type === 'quad'
                  ? `q:${target.quad}`
                  : `c:${target.date}`
                : null,
            }
          : p,
      )
    }

    const onUp = (ev: PointerEvent) => {
      clearTimeout(timer)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      if (lifted) {
        if (dragged) {
          const target = findTarget(ev.clientX, ev.clientY)
          if (target) placeTodo(t, target)
          cancelPick()
        }
        // dragged=false → picked 유지: 탭-투-플레이스 모드
      } else {
        if (swiped) {
          setSwipeMenu(t)
          return
        }
        const cur = pickRef.current
        if (cur) {
          cancelPick()
        } else {
          toggleDone(t)
        }
      }
    }
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
  }

  const onTargetTap = (target: PickTarget) => {
    const cur = pickRef.current
    if (!cur) return false
    placeTodo(cur.todo, target)
    cancelPick()
    return true
  }

  // ---------- quick add ----------
  const [quick, setQuick] = useState('')
  const quickAdd = async () => {
    const v = quick.trim()
    if (!v) return
    await sb().from('todos').insert({ user_id: userId, content: v })
    setQuick('')
    refresh()
  }

  // ---------- card render ----------
  const TodoCard = ({
    t,
    chip = false,
    timeRight = false,
  }: {
    t: Todo
    chip?: boolean
    timeRight?: boolean
  }) => {
    const isPicked = pick?.todo.id === t.id
    return (
      <div
        className={`select-none transition-all ${
          chip
            ? 'flex-none bg-[#F6F6F3] rounded-xl px-3 py-2 text-[11px] font-semibold cursor-pointer'
            : `bg-[#F6F6F3] rounded-xl px-[11px] py-[9px] mb-1.5 text-[11px] font-semibold leading-snug cursor-pointer flex gap-1.5 ${timeRight ? 'items-center' : 'items-start'}`
        } ${t.is_done ? '!bg-transparent text-[#C4C4C0] line-through font-medium' : ''} ${
          isPicked && !pick?.dragging ? 'scale-[1.04] !bg-white shadow-lg outline outline-2 outline-paled no-underline' : ''
        } ${isPicked && pick?.dragging ? 'opacity-25' : ''}`}
        style={{ touchAction: t.is_done ? 'auto' : 'none' }}
        onPointerDown={(e) => onCardPointerDown(t, e)}
        onClick={() => {
          if (t.is_done && !pickRef.current) toggleDone(t)
        }}
      >
        {t.template_id && <i className="not-italic text-[#9AA05E] text-[9px] mt-px flex-none">↻</i>}
        <span className={timeRight ? 'flex-1' : ''}>
          {t.content}
          {t.due_time && !timeRight && (
            <span className="text-sub ml-1">{fmtTimeHM(t.due_time)}</span>
          )}
        </span>
        {timeRight && t.due_time && (
          <span className="text-sub text-[10px] flex-none tabular">{fmtTimeHM(t.due_time)}</span>
        )}
      </div>
    )
  }

  // ---------- matrix ----------
  const unclassified = (matrixTodos ?? []).filter((t) => !t.quadrant && !t.is_done)
  const matrixView = (
    <>
      <Card className="!p-3 mb-2.5">
        <input
          className="w-full border-0 bg-[#F6F6F3] rounded-xl px-[13px] py-[11px] text-[12px] font-semibold outline-none placeholder:text-[#B8B8B4]"
          placeholder="할일 빠른 추가"
          enterKeyHint="done"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              quickAdd()
            }
          }}
        />
        {unclassified.length > 0 && (
          <div className="flex gap-[7px] overflow-x-auto pt-2.5 no-scrollbar">
            {unclassified.map((t) => (
              <TodoCard key={t.id} t={t} chip />
            ))}
          </div>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-[9px]">
        {QUADS.map((q) => {
          const items = (matrixTodos ?? []).filter((t) => t.quadrant === q.key)
          const undone = items.filter((t) => !t.is_done).length
          const isHover = pick?.hover === `q:${q.key}`
          return (
            <div
              key={q.key}
              data-quad={q.key}
              className={`quad bg-white rounded-[18px] p-2.5 min-h-[176px] shadow-card transition-colors ${
                isHover ? '!bg-pale outline outline-[1.5px] outline-paled' : ''
              }`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[data-tcard]')) return
                onTargetTap({ type: 'quad', quad: q.key })
              }}
            >
              <header className="flex justify-between items-center mx-1 mt-0.5 mb-2">
                <h4 className={`text-[10px] font-extrabold m-0 ${q.hi ? 'text-[#C05555]' : ''}`}>
                  {q.label}
                </h4>
                <span className="text-[9px] text-sub font-bold bg-[#F2F2EF] px-1.5 py-0.5 rounded-[7px]">
                  {undone}/{items.length}
                </span>
              </header>
              {items.map((t) => (
                <div key={t.id} data-tcard>
                  <TodoCard t={t} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </>
  )

  // ---------- calendar ----------
  const monthStart = startOfMonth(anchor)
  const firstWeekday = monthStart.getDay()
  const daysInMonth = endOfMonth(anchor).getDate()
  const byDate = useMemo(() => {
    const map = new Map<string, Todo[]>()
    ;(monthTodos ?? []).forEach((t) => {
      if (!t.due_date) return
      if (!map.has(t.due_date)) map.set(t.due_date, [])
      map.get(t.due_date)!.push(t)
    })
    return map
  }, [monthTodos])

  const dayList = byDate.get(selDate) ?? []

  const calView = (
    <>
      <div className="bg-white rounded-card p-4 shadow-card">
        <PeriodNav
          label={format(anchor, 'yyyy년 M월')}
          onPrev={() => setAnchor(addMonths(anchor, -1))}
          onNext={() => setAnchor(addMonths(anchor, 1))}
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
            <div key={`e${i}`} className="cal-cell cal-out aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1
            const dateStr = ymd(new Date(anchor.getFullYear(), anchor.getMonth(), d))
            const items = byDate.get(dateStr) ?? []
            const isToday = dateStr === today
            const isSel = dateStr === selDate && !isToday
            const isHover = pick?.hover === `c:${dateStr}`
            return (
              <div
                key={d}
                data-caldate={dateStr}
                className={`cal-cell aspect-square flex flex-col items-center justify-center gap-[3px] rounded-[11px] cursor-pointer text-[12px] font-semibold transition-transform ${
                  isToday ? 'cal-today bg-ink text-white' : isSel ? 'bg-pale' : ''
                } ${isHover ? '!bg-pale scale-[1.12] outline outline-[1.5px] outline-paled' : ''}`}
                onClick={(e) => {
                  if (onTargetTap({ type: 'cell', date: dateStr })) {
                    ;(e.currentTarget as HTMLElement).classList.add('landed')
                    return
                  }
                  setSelDate(dateStr)
                }}
              >
                <span>{d}</span>
                <div className="flex gap-0.5 h-1">
                  {items.slice(0, 3).map((t, k) => (
                    <i
                      key={k}
                      className="w-1 h-1 rounded-full"
                      style={{ background: t.is_done ? '#DDD' : '#C9CFA0' }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {(noDateTodos?.length ?? 0) > 0 && (
        <>
          <h3 className="text-[13px] font-extrabold mx-0.5 mt-4 mb-2">기간 미정</h3>
          <Card className="!p-3">
            <div className="flex gap-[7px] flex-wrap">
              {(noDateTodos ?? []).map((t) => (
                <TodoCard key={t.id} t={t} chip />
              ))}
            </div>
          </Card>
        </>
      )}
      <h3 className="text-[13px] font-extrabold mx-0.5 mt-4 mb-2">{fmtDateKo(selDate)}</h3>
      <Card className="!p-3">
        {!dayList.length && <EmptyState>이 날은 할일이 없어요</EmptyState>}
        {dayList.map((t) => (
          <TodoCard key={t.id} t={t} timeRight />
        ))}
      </Card>
    </>
  )

  return (
    <div>
      <PageHead
        title="할일"
        right={
          <>
            <AddButton light icon="↻" onClick={() => setTemplatesOpen(true)} />
            <AddButton onClick={() => setSheetOpen(true)} />
          </>
        }
      />
      <SegmentedControl
        className="mb-3.5"
        options={[
          { value: 'mx', label: '매트릭스' },
          { value: 'cal', label: '캘린더' },
        ]}
        value={view}
        onChange={(v) => {
          cancelPick()
          setView(v)
        }}
      />
      {view === 'mx' ? matrixView : calView}

      {/* 드래그 고스트 */}
      {pick?.dragging && (
        <div
          className="fixed z-[99] pointer-events-none bg-white rounded-xl px-[11px] py-[9px] text-[11px] font-semibold shadow-xl outline outline-2 outline-paled -rotate-2"
          style={{ left: pick.x - 60, top: pick.y - 18, maxWidth: 180 }}
        >
          {pick.todo.content}
        </div>
      )}

      <TodoSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <TodoSheet open={!!editTodo} onClose={() => setEditTodo(null)} edit={editTodo} />
      <SwipeMenuSheet
        todo={swipeMenu}
        onClose={() => setSwipeMenu(null)}
        onEditTodo={(t) => {
          setSwipeMenu(null)
          setEditTodo(t)
        }}
        onEditTemplate={(tpl) => {
          setSwipeMenu(null)
          setEditTemplate(tpl)
        }}
      />
      <TemplateListSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onEdit={(tpl) => {
          setTemplatesOpen(false)
          setEditTemplate(tpl)
        }}
      />
      <TemplateEditSheet template={editTemplate} onClose={() => setEditTemplate(null)} />
    </div>
  )
}

// ---------------- 할일 입력/수정 시트 ----------------
function TodoSheet({
  open,
  onClose,
  edit,
}: {
  open: boolean
  onClose: () => void
  edit?: Todo | null
}) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [content, setContent] = useState('')
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [monthday, setMonthday] = useState('1')
  const loaded = useRef<string | null>(null)

  if (open && edit && loaded.current !== edit.id) {
    loaded.current = edit.id
    setContent(edit.content)
    setQuadrant(edit.quadrant)
    setDueDate(edit.due_date ?? '')
    setDueTime(edit.due_time?.slice(0, 5) ?? '')
    setRepeat(false)
  }
  if (!open && loaded.current) loaded.current = null

  const save = async () => {
    if (!content.trim()) {
      toast('내용을 입력해주세요')
      return
    }
    if (edit) {
      const { error } = await sb()
        .from('todos')
        .update({
          content: content.trim(),
          quadrant,
          due_date: dueDate || null,
          due_time: dueTime || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', edit.id)
      if (error) {
        toastError('저장 실패', error)
        return
      }
      invalidate(['todos'])
      toast('수정했어요')
      onClose()
      return
    }
    if (repeat) {
      const { error } = await sb()
        .from('todo_templates')
        .insert({
          user_id: userId,
          content: content.trim(),
          quadrant,
          due_time: dueTime || null,
          freq,
          interval_n: 1,
          byweekday: freq === 'weekly' ? (weekdays.length ? weekdays : [new Date().getDay()]) : null,
          bymonthday: freq === 'monthly' ? parseInt(monthday, 10) || 1 : null,
          starts_on: dueDate || todayStr(),
        })
      if (error) {
        toastError('저장 실패', error)
        return
      }
      await ensureRecurrences(userId)
    } else {
      const { error } = await sb().from('todos').insert({
        user_id: userId,
        content: content.trim(),
        quadrant,
        due_date: dueDate || null,
        due_time: dueTime || null,
      })
      if (error) {
        toastError('저장 실패', error)
        return
      }
    }
    invalidate(['todos'])
    toast('할일을 추가했어요')
    setContent('')
    setQuadrant(null)
    setDueDate('')
    setDueTime('')
    setRepeat(false)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={edit ? '할일 수정' : '할일 추가'}>
      <Field label="내용">
        <input className={inputCls} value={content} onChange={(e) => setContent(e.target.value)} autoFocus />
      </Field>
      <Field label="구분 (선택)">
        <ChipRow
          allowNull
          options={QUADS.map((q) => ({ value: q.key as Quadrant | null, label: q.label }))}
          value={quadrant}
          onChange={setQuadrant}
        />
      </Field>
      <div className="flex gap-2">
        <Field label="일자 (선택)">
          <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="시간 (선택)">
          <input type="time" className={inputCls} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </Field>
      </div>
      {!edit && (
        <label className="flex items-center justify-between text-[12px] font-bold py-1 mb-2">
          <span>반복</span>
          <input type="checkbox" className="w-5 h-5 accent-ink" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
        </label>
      )}
      {repeat && (
        <div className="bg-[#FAFAF8] rounded-xl p-3 mb-3">
          <SegmentedControl
            className="mb-2.5"
            options={[
              { value: 'daily', label: '매일' },
              { value: 'weekly', label: '매주' },
              { value: 'monthly', label: '매월' },
            ]}
            value={freq}
            onChange={setFreq}
          />
          {freq === 'weekly' && (
            <div className="flex gap-1">
              {DAY_NAMES.map((d, i) => (
                <span
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold cursor-pointer ${
                    weekdays.includes(i) ? 'bg-ink text-white' : 'bg-[#F2F2EF]'
                  }`}
                  onClick={() =>
                    setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))
                  }
                >
                  {d}
                </span>
              ))}
            </div>
          )}
          {freq === 'monthly' && (
            <div className="flex items-center gap-2 text-[12px] font-semibold">
              <input
                className="w-12 border-[1.5px] border-line rounded-lg px-2 py-1.5 text-center font-bold outline-none"
                inputMode="numeric"
                value={monthday}
                onChange={(e) => setMonthday(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <span>일</span>
            </div>
          )}
        </div>
      )}
      <SaveButton onClick={save} />
    </BottomSheet>
  )
}

// ---------------- 스와이프 메뉴 ----------------
function SwipeMenuSheet({
  todo,
  onClose,
  onEditTodo,
  onEditTemplate,
}: {
  todo: Todo | null
  onClose: () => void
  onEditTodo: (t: Todo) => void
  onEditTemplate: (tpl: TodoTemplate) => void
}) {
  const userId = useUserId()
  const invalidate = useInvalidate()

  const deleteOne = async () => {
    if (!todo) return
    if (todo.template_id) {
      // tombstone — 재생성 방지
      await sb().from('todos').update({ is_skipped: true }).eq('id', todo.id)
    } else {
      await sb().from('todos').delete().eq('id', todo.id)
    }
    invalidate(['todos'])
    toast('삭제했어요')
    onClose()
  }

  const editTemplate = async () => {
    if (!todo?.template_id) return
    const { data } = await sb().from('todo_templates').select('*').eq('id', todo.template_id).single()
    if (data) onEditTemplate(data as TodoTemplate)
  }

  const stopTemplate = async () => {
    if (!todo?.template_id) return
    await sb().from('todo_templates').update({ is_active: false }).eq('id', todo.template_id)
    await sb()
      .from('todos')
      .delete()
      .eq('template_id', todo.template_id)
      .eq('is_done', false)
      .gt('due_date', todayStr())
    invalidate(['todos'])
    toast('반복을 중지했어요')
    onClose()
  }

  const btn = 'w-full border-0 bg-[#F6F6F3] rounded-xl text-[13px] font-bold py-3 mb-2'
  return (
    <BottomSheet open={!!todo} onClose={onClose} title={todo?.content ?? ''}>
      <button className={btn} onClick={() => todo && onEditTodo(todo)}>
        수정
      </button>
      <button className={btn} onClick={deleteOne}>
        {todo?.template_id ? '이 할일만 삭제' : '삭제'}
      </button>
      {todo?.template_id && (
        <>
          <button className={btn} onClick={editTemplate}>
            반복 전체 수정
          </button>
          <button className={btn + ' text-warn'} onClick={stopTemplate}>
            반복 중지
          </button>
        </>
      )}
    </BottomSheet>
  )
}

// ---------------- 템플릿 목록 / 수정 ----------------
function TemplateListSheet({
  open,
  onClose,
  onEdit,
}: {
  open: boolean
  onClose: () => void
  onEdit: (tpl: TodoTemplate) => void
}) {
  const invalidate = useInvalidate()
  const userId = useUserId()
  const { data: templates } = useQuery({
    queryKey: ['todo_templates'],
    queryFn: async () => {
      const { data, error } = await sb().from('todo_templates').select('*').order('created_at')
      if (error) throw error
      return data as TodoTemplate[]
    },
    enabled: open,
  })

  const toggle = async (t: TodoTemplate) => {
    await sb().from('todo_templates').update({ is_active: !t.is_active }).eq('id', t.id)
    if (t.is_active) {
      await sb()
        .from('todos')
        .delete()
        .eq('template_id', t.id)
        .eq('is_done', false)
        .gt('due_date', todayStr())
    } else {
      await ensureRecurrences(userId)
    }
    invalidate(['todo_templates', 'todos'])
  }

  const freqText = (t: TodoTemplate) =>
    t.freq === 'daily'
      ? '매일'
      : t.freq === 'weekly'
        ? `매주 ${(t.byweekday ?? []).map((i) => DAY_NAMES[i]).join('·')}`
        : `매월 ${t.bymonthday}일`

  return (
    <BottomSheet open={open} onClose={onClose} title="반복 할일">
      {!templates?.length && <EmptyState>등록된 반복 할일이 없어요</EmptyState>}
      {(templates ?? []).map((t) => (
        <div
          key={t.id}
          className={`flex items-center justify-between py-2.5 border-b border-line last:border-0 ${t.is_active ? '' : 'opacity-40'}`}
        >
          <div className="cursor-pointer flex-1" onClick={() => onEdit(t)}>
            <div className="text-[13px] font-bold">
              <span className="text-[#9AA05E] mr-1">↻</span>
              {t.content}
            </div>
            <div className="text-[11px] text-sub">
              {freqText(t)}
              {t.due_time ? ` · ${fmtTimeHM(t.due_time)}` : ''}
            </div>
          </div>
          <input type="checkbox" className="w-5 h-5 accent-ink" checked={t.is_active} onChange={() => toggle(t)} />
        </div>
      ))}
    </BottomSheet>
  )
}

function TemplateEditSheet({
  template,
  onClose,
}: {
  template: TodoTemplate | null
  onClose: () => void
}) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [content, setContent] = useState('')
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null)
  const [dueTime, setDueTime] = useState('')
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [monthday, setMonthday] = useState('1')
  const loaded = useRef<string | null>(null)

  if (template && loaded.current !== template.id) {
    loaded.current = template.id
    setContent(template.content)
    setQuadrant(template.quadrant)
    setDueTime(template.due_time?.slice(0, 5) ?? '')
    setFreq(template.freq)
    setWeekdays(template.byweekday ?? [])
    setMonthday(String(template.bymonthday ?? 1))
  }
  if (!template && loaded.current) loaded.current = null

  const save = async () => {
    if (!template || !content.trim()) return
    await sb()
      .from('todo_templates')
      .update({
        content: content.trim(),
        quadrant,
        due_time: dueTime || null,
        freq,
        byweekday: freq === 'weekly' ? (weekdays.length ? weekdays : [new Date().getDay()]) : null,
        bymonthday: freq === 'monthly' ? parseInt(monthday, 10) || 1 : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', template.id)
    // 미래 미완료 인스턴스만 갱신: 삭제 후 재실체화
    await sb()
      .from('todos')
      .delete()
      .eq('template_id', template.id)
      .eq('is_done', false)
      .gte('due_date', todayStr())
    await ensureRecurrences(userId)
    invalidate(['todo_templates', 'todos'])
    toast('반복을 수정했어요 · 미래 할일만 갱신됩니다')
    onClose()
  }

  return (
    <BottomSheet open={!!template} onClose={onClose} title="반복 전체 수정">
      <Field label="내용">
        <input className={inputCls} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <Field label="구분">
        <ChipRow
          allowNull
          options={QUADS.map((q) => ({ value: q.key as Quadrant | null, label: q.label }))}
          value={quadrant}
          onChange={setQuadrant}
        />
      </Field>
      <Field label="시간 (선택)">
        <input type="time" className={inputCls} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
      </Field>
      <Field label="주기">
        <SegmentedControl
          className="mb-2.5"
          options={[
            { value: 'daily', label: '매일' },
            { value: 'weekly', label: '매주' },
            { value: 'monthly', label: '매월' },
          ]}
          value={freq}
          onChange={setFreq}
        />
        {freq === 'weekly' && (
          <div className="flex gap-1">
            {DAY_NAMES.map((d, i) => (
              <span
                key={i}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold cursor-pointer ${
                  weekdays.includes(i) ? 'bg-ink text-white' : 'bg-[#F2F2EF]'
                }`}
                onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}
              >
                {d}
              </span>
            ))}
          </div>
        )}
        {freq === 'monthly' && (
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <input
              className="w-12 border-[1.5px] border-line rounded-lg px-2 py-1.5 text-center font-bold outline-none"
              inputMode="numeric"
              value={monthday}
              onChange={(e) => setMonthday(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <span>일</span>
          </div>
        )}
      </Field>
      <p className="text-[10px] text-sub mb-2">미래의 미완료 할일만 갱신됩니다.</p>
      <SaveButton onClick={save} />
    </BottomSheet>
  )
}
