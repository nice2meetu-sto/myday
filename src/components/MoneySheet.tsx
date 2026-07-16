import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { ChipRow, Field, inputCls, SaveButton, SegmentedControl } from './common'
import { useCategories, usePaymentMethods, majorsOf, minorsOf, useInvalidate, useUserId } from '../lib/queries'
import { commaInput, parseAmount } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast } from '../stores/ui'
import type { MoneyKind, MoneyEntry, Saving } from '../types'

const TABLE: Record<MoneyKind, string> = {
  expense: 'expenses',
  income: 'incomes',
  saving: 'savings',
}

function nowLocalInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export interface MoneyEditTarget {
  kind: MoneyKind
  entry: MoneyEntry | Saving
}

export function MoneySheet({
  open,
  onClose,
  initialKind = 'expense',
  edit,
}: {
  open: boolean
  onClose: () => void
  initialKind?: MoneyKind
  edit?: MoneyEditTarget | null
}) {
  const userId = useUserId()
  const { data: cats } = useCategories()
  const { data: pms } = usePaymentMethods()
  const invalidate = useInvalidate()

  const [kind, setKind] = useState<MoneyKind>(initialKind)
  const [amount, setAmount] = useState('')
  const [major, setMajor] = useState<string | null>(null)
  const [minor, setMinor] = useState<string | null>(null)
  const [pm, setPm] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  const [when, setWhen] = useState(nowLocalInput())
  const [editWhen, setEditWhen] = useState(false)
  // 반복 등록
  const [recur, setRecur] = useState(false)
  const [freq, setFreq] = useState<'weekly' | 'monthly' | 'yearly'>('monthly')
  const [intervalN, setIntervalN] = useState('1')
  const [monthday, setMonthday] = useState(`${new Date().getDate()}`)
  const [lastDay, setLastDay] = useState(false)
  const [weekday, setWeekday] = useState<number>(new Date().getDay())
  const [bymonth, setBymonth] = useState(`${new Date().getMonth() + 1}`)
  const amtRef = useRef<HTMLInputElement>(null)

  const isEdit = !!edit

  useEffect(() => {
    if (!open) return
    if (edit) {
      const e = edit.entry
      setKind(edit.kind)
      setAmount(commaInput(String(Math.abs(e.amount))))
      if (edit.kind === 'saving') {
        setMajor((e as Saving).category_id)
        setMinor(null)
        setPm(null)
      } else {
        const m = e as MoneyEntry
        setMajor(m.major_category_id)
        setMinor(m.minor_category_id)
        setPm(m.payment_method_id ?? null)
      }
      setMemo(e.memo ?? '')
      setWhen(toLocalInput(e.occurred_at))
      setEditWhen(true)
      setRecur(false)
    } else {
      setKind(initialKind)
      setAmount('')
      setMajor(null)
      setMinor(null)
      setPm(localStorage.getItem('myday-last-pm'))
      setMemo('')
      setWhen(nowLocalInput())
      setEditWhen(false)
      setRecur(false)
      setTimeout(() => amtRef.current?.focus(), 350)
    }
  }, [open, edit, initialKind])

  const majors = useMemo(
    () => majorsOf(cats, kind === 'saving' ? 'saving' : kind),
    [cats, kind],
  )
  const minors = useMemo(() => minorsOf(cats, major), [cats, major])
  const activePms = (pms ?? []).filter((p) => !p.is_archived)

  const save = async () => {
    const amt = parseAmount(amount)
    if (!amt) {
      toast('금액을 입력해주세요')
      return
    }
    const occurred = new Date(when).toISOString()
    const base: Record<string, unknown> = {
      amount: amt,
      memo: memo || null,
      occurred_at: occurred,
    }
    if (kind === 'saving') {
      base.category_id = major
    } else {
      base.major_category_id = major
      base.minor_category_id = minor
      if (kind === 'expense') base.payment_method_id = pm
    }

    if (isEdit && edit) {
      const { error } = await sb().from(TABLE[edit.kind]).update(base).eq('id', edit.entry.id)
      if (error) {
        toast('저장에 실패했어요')
        return
      }
    } else {
      base.user_id = userId
      const { error } = await sb().from(TABLE[kind]).insert(base)
      if (error) {
        toast('저장에 실패했어요')
        return
      }
      if (kind === 'expense' && pm) localStorage.setItem('myday-last-pm', pm)
      if (recur) {
        const catNm = majors.find((m) => m.id === major)?.name
        await sb()
          .from('recurring_rules')
          .insert({
            user_id: userId,
            kind,
            name: memo || catNm || '반복 항목',
            amount: amt,
            major_category_id: major,
            minor_category_id: kind === 'saving' ? null : minor,
            payment_method_id: kind === 'expense' ? pm : null,
            memo: memo || null,
            freq,
            interval_n: parseInt(intervalN, 10) || 1,
            bymonthday:
              freq === 'weekly' ? null : lastDay ? -1 : parseInt(monthday, 10) || 1,
            bymonth: freq === 'yearly' ? parseInt(bymonth, 10) || 1 : null,
            byweekday: freq === 'weekly' ? weekday : null,
            starts_on: when.slice(0, 10),
          })
        invalidate(['recurring_rules'])
      }
    }
    invalidate(['money', 'summary', 'budgets'])
    toast(isEdit ? '수정했어요' : '기록했어요')
    onClose()
  }

  const remove = async () => {
    if (!edit) return
    if (!confirm('이 항목을 삭제할까요?')) return
    await sb().from(TABLE[edit.kind]).delete().eq('id', edit.entry.id)
    invalidate(['money', 'summary'])
    toast('삭제했어요')
    onClose()
  }

  const whenLabel = useMemo(() => {
    const d = new Date(when)
    const today = new Date()
    const sameDay = d.toDateString() === today.toDateString()
    const hm = `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
    return sameDay ? `오늘 ${hm}` : `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`
  }, [when])

  return (
    <BottomSheet open={open} onClose={onClose} title={isEdit ? '내역 수정' : '기록하기'}>
      {!isEdit && (
        <SegmentedControl
          className="mb-3.5"
          options={[
            { value: 'expense', label: '소비' },
            { value: 'income', label: '수입' },
            { value: 'saving', label: '저축' },
          ]}
          value={kind}
          onChange={(k) => {
            setKind(k)
            setMajor(null)
            setMinor(null)
          }}
        />
      )}

      <div
        className="text-[11px] text-sub font-semibold mb-3 cursor-pointer"
        onClick={() => setEditWhen(true)}
      >
        {editWhen ? (
          <input
            type="datetime-local"
            className={inputCls}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        ) : (
          <>🕐 {whenLabel} · 탭해서 변경</>
        )}
      </div>

      <Field label="금액">
        <input
          ref={amtRef}
          className={inputCls + ' text-[18px]'}
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(commaInput(e.target.value))}
        />
      </Field>

      <Field label={kind === 'saving' ? '구분' : '대구분'}>
        <ChipRow
          allowNull
          options={majors.map((m) => ({ value: m.id as string | null, label: m.name }))}
          value={major}
          onChange={(v) => {
            setMajor(v)
            setMinor(null)
          }}
        />
      </Field>

      {kind !== 'saving' && minors.length > 0 && (
        <Field label="소구분">
          <ChipRow
            allowNull
            options={minors.map((m) => ({ value: m.id as string | null, label: m.name }))}
            value={minor}
            onChange={setMinor}
          />
        </Field>
      )}

      {kind === 'expense' && (
        <Field label="결제수단">
          <ChipRow
            allowNull
            options={activePms.map((p) => ({ value: p.id as string | null, label: p.name }))}
            value={pm}
            onChange={setPm}
          />
        </Field>
      )}

      <Field label="내용 (선택)">
        <input
          className={inputCls}
          placeholder={kind === 'expense' ? '점심 · 김치찌개' : ''}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Field>

      {!isEdit && (
        <div className="mb-3">
          <label className="flex items-center justify-between text-[12px] font-bold py-1">
            <span>반복으로 등록</span>
            <input
              type="checkbox"
              className="w-5 h-5 accent-ink"
              checked={recur}
              onChange={(e) => setRecur(e.target.checked)}
            />
          </label>
          {recur && (
            <div className="mt-2 bg-[#FAFAF8] rounded-xl p-3">
              <SegmentedControl
                className="mb-2.5"
                options={[
                  { value: 'weekly', label: '매주' },
                  { value: 'monthly', label: '매월' },
                  { value: 'yearly', label: '매년' },
                ]}
                value={freq}
                onChange={setFreq}
              />
              <div className="flex items-center gap-2 text-[12px] font-semibold flex-wrap">
                <input
                  className="w-12 border-[1.5px] border-line rounded-lg px-2 py-1.5 text-center font-bold outline-none"
                  inputMode="numeric"
                  value={intervalN}
                  onChange={(e) => setIntervalN(e.target.value.replace(/[^0-9]/g, ''))}
                />
                <span>{freq === 'weekly' ? '주마다' : freq === 'monthly' ? '개월마다' : '년마다'}</span>
                {freq === 'weekly' && (
                  <div className="flex gap-1 ml-1">
                    {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                      <span
                        key={i}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold cursor-pointer ${
                          weekday === i ? 'bg-ink text-white' : 'bg-[#F2F2EF]'
                        }`}
                        onClick={() => setWeekday(i)}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                {freq === 'yearly' && (
                  <>
                    <input
                      className="w-12 border-[1.5px] border-line rounded-lg px-2 py-1.5 text-center font-bold outline-none"
                      inputMode="numeric"
                      value={bymonth}
                      onChange={(e) => setBymonth(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                    <span>월</span>
                  </>
                )}
                {freq !== 'weekly' && (
                  <>
                    <input
                      className="w-12 border-[1.5px] border-line rounded-lg px-2 py-1.5 text-center font-bold outline-none disabled:opacity-40"
                      inputMode="numeric"
                      value={monthday}
                      disabled={lastDay}
                      onChange={(e) => setMonthday(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                    <span>일</span>
                    <span
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${
                        lastDay ? 'bg-ink text-white' : 'bg-[#F2F2EF]'
                      }`}
                      onClick={() => setLastDay(!lastDay)}
                    >
                      말일
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <SaveButton onClick={save} />
      {isEdit && (
        <button
          className="w-full border-0 bg-transparent text-warn text-[12px] font-bold mt-3"
          onClick={remove}
        >
          삭제
        </button>
      )}
    </BottomSheet>
  )
}
