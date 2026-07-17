import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { SegmentedControl, EmptyState, Field, inputCls, ChipRow } from '../components/common'
import { useInvalidate } from '../lib/queries'
import { fmtSlash, fmtTimeHM } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Quadrant, Todo } from '../types'

const QUADS: { key: Quadrant; label: string }[] = [
  { key: 'ui', label: '급함 · 중요' },
  { key: 'ni', label: '안급함 · 중요' },
  { key: 'un', label: '급함 · 안중요' },
  { key: 'nn', label: '안급함 · 안중요' },
]

// ---------------- 중앙 팝업 수정 모달 ----------------
function TodoEditModal({ todo, onClose }: { todo: Todo | null; onClose: () => void }) {
  const invalidate = useInvalidate()
  const [content, setContent] = useState('')
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)

  if (todo && loadedId !== todo.id) {
    setLoadedId(todo.id)
    setContent(todo.content)
    setQuadrant(todo.quadrant)
    setDueDate(todo.due_date ?? '')
    setDueTime(todo.due_time?.slice(0, 5) ?? '')
  }
  if (!todo && loadedId) setLoadedId(null)

  const save = async () => {
    if (!todo || !content.trim()) {
      toast('내용을 입력해주세요')
      return
    }
    const { error } = await sb()
      .from('todos')
      .update({
        content: content.trim(),
        quadrant,
        due_date: dueDate || null,
        due_time: dueTime || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', todo.id)
    if (error) {
      toastError('저장 실패', error)
      return
    }
    invalidate(['todos'])
    toast('수정했어요')
    onClose()
  }

  const remove = async () => {
    if (!todo) return
    if (!confirm('이 할일을 삭제할까요?')) return
    if (todo.template_id) {
      // 반복 인스턴스는 tombstone — 재생성 방지
      await sb().from('todos').update({ is_skipped: true }).eq('id', todo.id)
    } else {
      await sb().from('todos').delete().eq('id', todo.id)
    }
    invalidate(['todos'])
    toast('삭제했어요')
    onClose()
  }

  return (
    <AnimatePresence>
      {todo && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/35 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed left-1/2 top-1/2 z-50 w-[88%] max-w-[380px] bg-white rounded-card p-5 border border-black/10"
            style={{ x: '-50%', y: '-50%' }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <h2 className="text-[16px] font-extrabold m-0 mb-3.5 tracking-tight">할일 수정</h2>
            <Field label="내용">
              <input
                className={inputCls}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </Field>
            <Field label="구분">
              <ChipRow
                allowNull
                options={QUADS.map((q) => ({ value: q.key as Quadrant | null, label: q.label }))}
                value={quadrant}
                onChange={setQuadrant}
              />
            </Field>
            <div className="flex gap-2">
              <Field label="일자">
                <input
                  type="date"
                  className={inputCls}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              <Field label="시간">
                <input
                  type="time"
                  className={inputCls}
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-1">
              <button
                className="flex-1 border-0 rounded-[14px] py-[13px] font-bold text-[13px] bg-[#F2F2EF] text-warn"
                onClick={remove}
              >
                삭제
              </button>
              <button
                className="flex-1 border-0 rounded-[14px] py-[13px] font-bold text-[13px] bg-acc text-white"
                onClick={save}
              >
                저장
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default function TodoEditPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'undone' | 'done'>('undone')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Todo | null>(null)

  const { data: todos } = useQuery({
    queryKey: ['todos', 'edit', tab],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('todos')
        .select('*')
        .eq('is_skipped', false)
        .eq('is_done', tab === 'done')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as Todo[]
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return todos ?? []
    return (todos ?? []).filter(
      (t) =>
        t.content.includes(q) ||
        (t.due_date ?? '').includes(q) ||
        (t.due_date ? fmtSlash(t.due_date).includes(q) : false),
    )
  }, [todos, search])

  return (
    <div>
      <div className="flex items-center gap-3 mt-1.5 mb-3.5">
        <button
          className="w-[34px] h-[34px] rounded-[11px] border-0 bg-white border border-black/10 text-[16px]"
          onClick={() => nav('/todo')}
        >
          ‹
        </button>
        <h1 className="text-[24px] font-extrabold tracking-tight m-0">할일 수정</h1>
      </div>
      <input
        className="w-full border border-black/10 rounded-xl px-3.5 py-[10px] font-semibold text-[13px] outline-none bg-white mb-3 placeholder:text-[#B8B8B4]"
        placeholder="🔍 내용 · 일자 검색 (예: 운동, 2026-07-17)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <SegmentedControl
        className="mb-3"
        options={[
          { value: 'undone', label: '미완료' },
          { value: 'done', label: '완료' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="bg-white rounded-card border border-black/10 p-3">
        {!filtered.length && <EmptyState>할일이 없어요</EmptyState>}
        {filtered.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 py-2.5 border-b border-line last:border-0 cursor-pointer"
            onClick={() => setEditing(t)}
          >
            <div className="min-w-0 flex-1">
              <div
                className={`text-[13px] font-semibold ${t.is_done ? 'line-through text-[#C4C4C0]' : ''}`}
              >
                {t.template_id && <span className="text-[#9AA05E] mr-1">↻</span>}
                {t.content}
              </div>
              <div className="text-[10px] text-sub mt-0.5">
                {t.quadrant ? `${QUADS.find((q) => q.key === t.quadrant)?.label} · ` : ''}
                {t.due_date ? fmtSlash(t.due_date) : '기간 미정'}
                {t.due_time ? ` ${fmtTimeHM(t.due_time)}` : ''}
              </div>
            </div>
            <span className="text-sub text-[12px] flex-none">›</span>
          </div>
        ))}
      </div>
      <TodoEditModal todo={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
