import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { AddButton, PageHead, EmptyState, Field, inputCls, SaveButton, popIn } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { DiaryPhoto } from '../components/CoverImg'
import { uploadImage, deleteImage } from '../lib/image'
import { useInvalidate, useUserId } from '../lib/queries'
import { fmtDateKo, fmtTimeHM, todayStr } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Diary } from '../types'

const PAGE = 30

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

function DiarySheet({
  open,
  onClose,
  edit,
}: {
  open: boolean
  onClose: () => void
  edit?: Diary | null
}) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const loaded = useRef<string | null>(null)

  if (open && edit && loaded.current !== edit.id) {
    loaded.current = edit.id
    setDate(edit.entry_date)
    setTime(edit.entry_time?.slice(0, 5) ?? '')
    setContent(edit.content ?? '')
    setFile(null)
  }
  if (open && !edit && loaded.current !== 'new') {
    loaded.current = 'new'
    setDate(todayStr())
    const now = new Date()
    setTime(
      `${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`,
    )
    setContent('')
    setFile(null)
  }
  if (!open && loaded.current) loaded.current = null

  const save = async () => {
    if (!content.trim() && !file) {
      toast('내용이나 사진을 넣어주세요')
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

export default function DiaryPage() {
  const [limit, setLimit] = useState(PAGE)
  const { data: diaries } = useDiaries(limit)
  const invalidate = useInvalidate()
  const [writing, setWriting] = useState(false)
  const [detail, setDetail] = useState<Diary | null>(null)
  const [editing, setEditing] = useState<Diary | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, Diary[]>()
    ;(diaries ?? []).forEach((d) => {
      if (!map.has(d.entry_date)) map.set(d.entry_date, [])
      map.get(d.entry_date)!.push(d)
    })
    // 같은 날짜는 시간순 (오름차순 아님 — 최신이 위)
    return [...map.entries()]
  }, [diaries])

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
      {!grouped.length && <EmptyState>첫 일기를 남겨보세요</EmptyState>}
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
              className="bg-white rounded-card mb-3 shadow-card cursor-pointer p-4 flex gap-3 items-center"
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
                {d.entry_time && (
                  <time className="text-[10px] text-sub font-bold">{fmtTimeHM(d.entry_time)}</time>
                )}
                {d.content ? (
                  <p className="mt-1 mb-0 text-[13px] leading-[1.6] text-[#333] line-clamp-3">
                    {d.content}
                  </p>
                ) : (
                  <p className="mt-1 mb-0 text-[12px] text-sub">(사진 일기)</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ))}
      {(diaries ?? []).length >= limit && (
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
        <div className="flex gap-3 items-start">
          {detail?.photo_url && (
            <DiaryPhoto
              path={detail.photo_url}
              className="w-[110px] h-[110px] rounded-2xl flex-none"
            />
          )}
          {detail?.content && (
            <p className="text-[14px] leading-[1.7] text-[#333] whitespace-pre-wrap m-0 min-w-0 flex-1">
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

      <DiarySheet open={writing} onClose={() => setWriting(false)} />
      <DiarySheet open={!!editing} onClose={() => setEditing(null)} edit={editing} />
    </div>
  )
}
