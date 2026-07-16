import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { Card, Label, SegmentedControl, AddButton, EmptyState, Field, inputCls, SaveButton, ChipRow } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { MoneySheet, MoneyEditTarget } from '../components/MoneySheet'
import { useCategories, usePaymentMethods, catName, majorsOf, minorsOf, useInvalidate, useUserId } from '../lib/queries'
import { nextOccurrence, ensureRecurrences } from '../lib/recurrence'
import { fmt, fmtDateKo, ymd, todayStr, commaInput, parseAmount, dayStartISO, nextDayStartISO, localDateOf } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Category, MoneyKind, MoneyEntry, PaymentMethod, RecurringRule, Saving } from '../types'

const TABLE: Record<MoneyKind, string> = { expense: 'expenses', income: 'incomes', saving: 'savings' }
const PALETTE = ['#C7976F', '#FFDE70', '#A3C4EB', '#D0BC98', '#C7CE9A', '#CFE0D8', '#E1E5C7', '#B44B28']

// ---------------- 데이터 수정 ----------------
function DataEdit() {
  const { data: cats } = useCategories()
  const [from, setFrom] = useState(ymd(addDays(new Date(), -30)))
  const [to, setTo] = useState(todayStr())
  const [kind, setKind] = useState<MoneyKind>('expense')
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<MoneyEditTarget | null>(null)

  const { data: rows } = useQuery({
    queryKey: ['money', 'edit', kind, from, to],
    queryFn: async () => {
      let q = sb()
        .from(TABLE[kind])
        .select('*')
        .gte('occurred_at', dayStartISO(from))
        .lt('occurred_at', nextDayStartISO(to))
        .order('occurred_at', { ascending: false })
        .limit(500)
      if (kind === 'expense') q = q.eq('is_skipped', false)
      const { data, error } = await q
      if (error) throw error
      return data as (MoneyEntry | Saving)[]
    },
  })

  const majors = majorsOf(cats, kind, true)
  const filtered = (rows ?? []).filter((r) => {
    if (!catFilter.size) return true
    const major = kind === 'saving' ? (r as Saving).category_id : (r as MoneyEntry).major_category_id
    return major ? catFilter.has(major) : false
  })

  const grouped = useMemo(() => {
    const map = new Map<string, (MoneyEntry | Saving)[]>()
    filtered.forEach((r) => {
      const d = localDateOf(r.occurred_at)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(r)
    })
    return [...map.entries()]
  }, [filtered])

  return (
    <div>
      <Card className="mb-3">
        <div className="flex gap-2 mb-3">
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <SegmentedControl
          className="mb-3"
          options={[
            { value: 'expense', label: '소비' },
            { value: 'income', label: '수입' },
            { value: 'saving', label: '저축' },
          ]}
          value={kind}
          onChange={(k) => {
            setKind(k)
            setCatFilter(new Set())
          }}
        />
        <div className="flex gap-1.5 flex-wrap">
          {majors.map((m) => (
            <span
              key={m.id}
              className={`rounded-[10px] px-[11px] py-[7px] text-[11px] font-semibold cursor-pointer ${
                catFilter.has(m.id) ? 'bg-acc text-white' : 'bg-[#F2F2EF]'
              }`}
              onClick={() => {
                const next = new Set(catFilter)
                next.has(m.id) ? next.delete(m.id) : next.add(m.id)
                setCatFilter(next)
              }}
            >
              {m.name}
            </span>
          ))}
        </div>
      </Card>
      {!grouped.length && <EmptyState>해당 기간 내역이 없어요</EmptyState>}
      {grouped.map(([date, items]) => (
        <div key={date} className="mb-3">
          <div className="text-[11px] font-extrabold text-sub mx-0.5 mb-1.5">{fmtDateKo(date)}</div>
          <Card className="!p-3">
            {items.map((r) => (
              <div
                key={r.id}
                className="flex justify-between items-center py-2 border-b border-line last:border-0 text-[13px] cursor-pointer"
                onClick={() => setEditing({ kind, entry: r })}
              >
                <div>
                  <div className="font-semibold">
                    {r.memo ||
                      (kind === 'saving'
                        ? catName(cats, (r as Saving).category_id)
                        : catName(cats, (r as MoneyEntry).major_category_id)) ||
                      '내역'}
                    {r.recurring_id && <span className="text-[#9AA05E] ml-1">↻</span>}
                  </div>
                  <div className="text-[11px] text-sub">
                    {kind !== 'saving' && catName(cats, (r as MoneyEntry).major_category_id)}
                    {kind !== 'saving' && (r as MoneyEntry).minor_category_id
                      ? ` · ${catName(cats, (r as MoneyEntry).minor_category_id)}`
                      : ''}
                  </div>
                </div>
                <b className="tabular">{fmt(Number(r.amount))}</b>
              </div>
            ))}
          </Card>
        </div>
      ))}
      <MoneySheet open={!!editing} onClose={() => setEditing(null)} edit={editing} />
    </div>
  )
}

// ---------------- 카테고리 수정 ----------------
type CatTab = MoneyKind | 'payment'

function CategoryEdit() {
  const userId = useUserId()
  const { data: cats } = useCategories()
  const { data: pms } = usePaymentMethods()
  const invalidate = useInvalidate()
  const [tab, setTab] = useState<CatTab>('expense')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{
    mode: 'add' | 'edit'
    target?: Category | PaymentMethod
    parentId?: string | null
  } | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [icon, setIcon] = useState('')

  const isPayment = tab === 'payment'
  const majors = isPayment ? [] : majorsOf(cats, tab as MoneyKind, true)

  const openAdd = (parentId: string | null = null) => {
    setName('')
    setColor(PALETTE[0])
    setIcon('')
    setSheet({ mode: 'add', parentId })
  }
  const openEdit = (target: Category | PaymentMethod) => {
    setName(target.name)
    setColor('color' in target ? target.color : null)
    setIcon('icon' in target ? ((target as Category).icon ?? '') : '')
    setSheet({ mode: 'edit', target })
  }

  const save = async () => {
    if (!name.trim()) return
    if (isPayment) {
      if (sheet?.mode === 'add') {
        await sb().from('payment_methods').insert({
          user_id: userId,
          name: name.trim(),
          sort_order: (pms?.length ?? 0),
        })
      } else if (sheet?.target) {
        await sb().from('payment_methods').update({ name: name.trim() }).eq('id', sheet.target.id)
      }
      invalidate(['payment_methods'])
    } else {
      if (sheet?.mode === 'add') {
        await sb().from('categories').insert({
          user_id: userId,
          kind: tab,
          parent_id: sheet.parentId ?? null,
          name: name.trim(),
          color: sheet.parentId ? null : color,
          icon: icon.trim() || null,
          sort_order: majors.length,
        })
      } else if (sheet?.target) {
        const upd: Record<string, unknown> = { name: name.trim(), icon: icon.trim() || null }
        if (!(sheet.target as Category).parent_id) upd.color = color
        await sb().from('categories').update(upd).eq('id', sheet.target.id)
      }
      invalidate(['categories'])
    }
    setSheet(null)
    toast('저장했어요')
  }

  const toggleArchive = async (target: Category | PaymentMethod) => {
    const table = isPayment ? 'payment_methods' : 'categories'
    await sb().from(table).update({ is_archived: !target.is_archived }).eq('id', target.id)
    invalidate([isPayment ? 'payment_methods' : 'categories'])
  }

  const reorder = async (list: (Category | PaymentMethod)[], idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    const table = isPayment ? 'payment_methods' : 'categories'
    await Promise.all([
      sb().from(table).update({ sort_order: j }).eq('id', list[idx].id),
      sb().from(table).update({ sort_order: idx }).eq('id', list[j].id),
    ])
    invalidate([isPayment ? 'payment_methods' : 'categories'])
  }

  const renderRow = (
    item: Category | PaymentMethod,
    list: (Category | PaymentMethod)[],
    idx: number,
    isMinor = false,
  ) => (
    <div
      key={item.id}
      className={`flex items-center gap-2 py-2 border-b border-line last:border-0 ${isMinor ? 'pl-6' : ''} ${item.is_archived ? 'opacity-40' : ''}`}
    >
      {'color' in item && !((item as Category).parent_id) && (
        <i className="w-2.5 h-2.5 rounded flex-none" style={{ background: item.color ?? '#DDD' }} />
      )}
      <span className="flex-1 text-[13px] font-semibold cursor-pointer" onClick={() => openEdit(item)}>
        {'icon' in item && (item as Category).icon ? `${(item as Category).icon} ` : ''}
        {item.name}
        {item.is_archived && <span className="text-[10px] text-sub ml-1">(보관됨)</span>}
      </span>
      {!isMinor && !isPayment && (
        <button
          className="text-[10px] text-sub border-0 bg-[#F2F2EF] rounded-md px-2 py-1"
          onClick={() => setExpanded(expanded === item.id ? null : item.id)}
        >
          소구분 {expanded === item.id ? '▲' : '▼'}
        </button>
      )}
      <button className="text-[11px] text-sub border-0 bg-transparent px-1" onClick={() => reorder(list, idx, -1)}>▲</button>
      <button className="text-[11px] text-sub border-0 bg-transparent px-1" onClick={() => reorder(list, idx, 1)}>▼</button>
      <button className="text-[10px] border-0 bg-transparent text-sub px-1" onClick={() => toggleArchive(item)}>
        {item.is_archived ? '복원' : '보관'}
      </button>
    </div>
  )

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {(
          [
            ['expense', '소비'],
            ['income', '수입'],
            ['saving', '저축'],
            ['payment', '결제수단'],
          ] as [CatTab, string][]
        ).map(([v, l]) => (
          <span
            key={v}
            className={`rounded-[10px] px-3 py-2 text-[11px] font-bold cursor-pointer ${tab === v ? 'bg-acc text-white' : 'bg-white shadow-card'}`}
            onClick={() => setTab(v)}
          >
            {l}
          </span>
        ))}
      </div>
      <Card>
        {isPayment
          ? (pms ?? []).map((p, i) => renderRow(p, pms ?? [], i))
          : majors.map((m, i) => (
              <div key={m.id}>
                {renderRow(m, majors, i)}
                {expanded === m.id && (
                  <div className="bg-[#FAFAF8] rounded-xl my-1">
                    {minorsOf(cats, m.id, true).map((mi, j) =>
                      renderRow(mi, minorsOf(cats, m.id, true), j, true),
                    )}
                    <button
                      className="w-full border-0 bg-transparent text-[11px] text-sub font-bold py-2"
                      onClick={() => openAdd(m.id)}
                    >
                      + 소구분 추가
                    </button>
                  </div>
                )}
              </div>
            ))}
        <button
          className="w-full border-0 bg-[#F6F6F3] rounded-xl text-[12px] font-bold py-2.5 mt-2"
          onClick={() => openAdd(null)}
        >
          + {isPayment ? '결제수단' : '대구분'} 추가
        </button>
      </Card>
      <BottomSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.mode === 'add' ? '추가' : '수정'}
      >
        <Field label="이름">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {!isPayment && (
          <Field label="아이콘 (이모지 하나)">
            <input
              className={inputCls}
              value={icon}
              placeholder="☕️"
              onChange={(e) => setIcon(e.target.value)}
            />
          </Field>
        )}
        {!isPayment && !(sheet?.parentId) && !(sheet?.target && (sheet.target as Category).parent_id) && (
          <Field label="색상">
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map((c) => (
                <span
                  key={c}
                  className={`w-8 h-8 rounded-[10px] cursor-pointer ${color === c ? 'ring-2 ring-ink ring-offset-2' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </Field>
        )}
        <SaveButton onClick={save} />
      </BottomSheet>
    </div>
  )
}

// ---------------- 고정지출 관리 ----------------
function freqLabel(r: RecurringRule): string {
  const iv = r.interval_n > 1 ? `${r.interval_n}` : ''
  if (r.freq === 'weekly')
    return `${iv ? `${iv}주마다` : '매주'} ${['일', '월', '화', '수', '목', '금', '토'][r.byweekday ?? 0]}요일`
  if (r.freq === 'monthly')
    return `${iv ? `${iv}개월마다` : '매월'} ${r.bymonthday === -1 ? '말일' : `${r.bymonthday}일`}`
  return `${iv ? `${iv}년마다` : '매년'} ${r.bymonth}월 ${r.bymonthday === -1 ? '말일' : `${r.bymonthday}일`}`
}

function RecurringEdit() {
  const userId = useUserId()
  const { data: cats } = useCategories()
  const { data: pms } = usePaymentMethods()
  const invalidate = useInvalidate()
  const [kind, setKind] = useState<MoneyKind>('expense')
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)

  const { data: rules } = useQuery({
    queryKey: ['recurring_rules'],
    queryFn: async () => {
      const { data, error } = await sb().from('recurring_rules').select('*').order('created_at')
      if (error) throw error
      return data as RecurringRule[]
    },
  })

  // form state
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [major, setMajor] = useState<string | null>(null)
  const [minor, setMinor] = useState<string | null>(null)
  const [pm, setPm] = useState<string | null>(null)
  const [freq, setFreq] = useState<'weekly' | 'monthly' | 'yearly'>('monthly')
  const [intervalN, setIntervalN] = useState('1')
  const [monthday, setMonthday] = useState('1')
  const [lastDay, setLastDay] = useState(false)
  const [weekday, setWeekday] = useState(1)
  const [bymonth, setBymonth] = useState('1')
  const [startsOn, setStartsOn] = useState(todayStr())
  const [endsOn, setEndsOn] = useState('')
  const [autoCreate, setAutoCreate] = useState(true)

  const openEdit = (r: RecurringRule | 'new') => {
    if (r === 'new') {
      setName('')
      setAmount('')
      setMajor(null)
      setMinor(null)
      setPm(null)
      setFreq('monthly')
      setIntervalN('1')
      setMonthday(`${new Date().getDate()}`)
      setLastDay(false)
      setWeekday(1)
      setBymonth(`${new Date().getMonth() + 1}`)
      setStartsOn(todayStr())
      setEndsOn('')
      setAutoCreate(true)
    } else {
      setName(r.name)
      setAmount(commaInput(String(r.amount)))
      setMajor(r.major_category_id)
      setMinor(r.minor_category_id)
      setPm(r.payment_method_id)
      setFreq(r.freq)
      setIntervalN(String(r.interval_n))
      setMonthday(r.bymonthday === -1 ? '1' : String(r.bymonthday ?? 1))
      setLastDay(r.bymonthday === -1)
      setWeekday(r.byweekday ?? 1)
      setBymonth(String(r.bymonth ?? 1))
      setStartsOn(r.starts_on)
      setEndsOn(r.ends_on ?? '')
      setAutoCreate(r.auto_create)
    }
    setEditing(r)
  }

  const refreshFuture = async (ruleId: string, ruleKind: MoneyKind) => {
    // 미래 인스턴스 삭제 후 재실체화 (과거는 유지)
    const table = TABLE[ruleKind]
    await sb()
      .from(table)
      .delete()
      .eq('recurring_id', ruleId)
      .gt('occurred_at', new Date().toISOString())
    await ensureRecurrences(userId)
    invalidate(['money', 'summary'])
  }

  const save = async () => {
    const amt = parseAmount(amount)
    if (!name.trim() || !amt) {
      toast('이름과 금액을 입력해주세요')
      return
    }
    const row = {
      kind,
      name: name.trim(),
      amount: amt,
      major_category_id: major,
      minor_category_id: kind === 'saving' ? null : minor,
      payment_method_id: kind === 'expense' ? pm : null,
      freq,
      interval_n: parseInt(intervalN, 10) || 1,
      bymonthday: freq === 'weekly' ? null : lastDay ? -1 : parseInt(monthday, 10) || 1,
      bymonth: freq === 'yearly' ? parseInt(bymonth, 10) || 1 : null,
      byweekday: freq === 'weekly' ? weekday : null,
      starts_on: startsOn,
      ends_on: endsOn || null,
      auto_create: autoCreate,
      updated_at: new Date().toISOString(),
    }
    if (editing === 'new') {
      const { error } = await sb().from('recurring_rules').insert({ ...row, user_id: userId })
      if (error) {
        toastError('저장 실패', error)
        return
      }
      await ensureRecurrences(userId)
    } else if (editing) {
      const { error } = await sb().from('recurring_rules').update(row).eq('id', editing.id)
      if (error) {
        toastError('저장 실패', error)
        return
      }
      await refreshFuture(editing.id, editing.kind)
    }
    invalidate(['recurring_rules', 'money', 'summary'])
    setEditing(null)
    toast('저장했어요 · 미래 인스턴스만 갱신됩니다')
  }

  const toggleActive = async (r: RecurringRule) => {
    await sb().from('recurring_rules').update({ is_active: !r.is_active }).eq('id', r.id)
    if (r.is_active) {
      // 비활성화 → 미래 인스턴스 삭제
      await sb()
        .from(TABLE[r.kind])
        .delete()
        .eq('recurring_id', r.id)
        .gt('occurred_at', new Date().toISOString())
    } else {
      await ensureRecurrences(userId)
    }
    invalidate(['recurring_rules', 'money', 'summary'])
  }

  const removeRule = async (r: RecurringRule) => {
    const wipePast = confirm('과거 기록도 함께 지울까요?\n확인 = 과거 기록까지 삭제, 취소 = 규칙만 중지')
    if (wipePast) {
      await sb().from(TABLE[r.kind]).delete().eq('recurring_id', r.id)
      await sb().from('recurring_rules').delete().eq('id', r.id)
      toast('규칙과 기록을 삭제했어요')
    } else {
      await sb().from('recurring_rules').update({ is_active: false }).eq('id', r.id)
      await sb()
        .from(TABLE[r.kind])
        .delete()
        .eq('recurring_id', r.id)
        .gt('occurred_at', new Date().toISOString())
      toast('규칙을 중지했어요 · 과거 기록은 유지됩니다')
    }
    invalidate(['recurring_rules', 'money', 'summary'])
    setEditing(null)
  }

  const list = (rules ?? []).filter((r) => r.kind === kind)
  const active = list.filter((r) => r.is_active)
  const inactive = list.filter((r) => !r.is_active)

  const ruleCard = (r: RecurringRule) => {
    const next = r.is_active ? nextOccurrence(r) : null
    return (
      <Card key={r.id} className={`!p-4 mb-2.5 ${r.is_active ? '' : 'opacity-50'}`}>
        <div className="flex items-center justify-between">
          <div className="cursor-pointer flex-1" onClick={() => openEdit(r)}>
            <div className="text-[13px] font-bold">
              {r.name} <span className="text-sub font-semibold">· {freqLabel(r)}</span>
            </div>
            <div className="text-[12px] text-sub mt-0.5 tabular">
              {fmt(r.amount)}원
              {next && (
                <span className="ml-2">
                  다음: {new Date(next + 'T00:00:00').getMonth() + 1}월 {new Date(next + 'T00:00:00').getDate()}일
                </span>
              )}
              {!r.auto_create && <span className="ml-2 text-[#9AA05E]">확인 후 등록</span>}
            </div>
          </div>
          <input
            type="checkbox"
            className="w-5 h-5 accent-acc"
            checked={r.is_active}
            onChange={() => toggleActive(r)}
          />
        </div>
      </Card>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SegmentedControl
          className="flex-1 mr-2"
          options={[
            { value: 'expense', label: '지출' },
            { value: 'income', label: '수입' },
            { value: 'saving', label: '저축' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <AddButton onClick={() => openEdit('new')} />
      </div>
      {!list.length && <EmptyState>등록된 반복 규칙이 없어요</EmptyState>}
      {active.map(ruleCard)}
      {inactive.length > 0 && (
        <>
          <div className="text-[11px] font-extrabold text-sub mx-0.5 mt-4 mb-1.5">중지됨</div>
          {inactive.map(ruleCard)}
        </>
      )}

      <BottomSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? '반복 규칙 추가' : '반복 규칙 수정'}
      >
        <Field label="이름">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="월세 · 넷플릭스 · 급여" />
        </Field>
        <Field label="금액">
          <input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(commaInput(e.target.value))} />
        </Field>
        <Field label={kind === 'saving' ? '구분' : '대구분'}>
          <ChipRow
            allowNull
            options={majorsOf(cats, kind).map((m) => ({ value: m.id as string | null, label: m.name }))}
            value={major}
            onChange={(v) => {
              setMajor(v)
              setMinor(null)
            }}
          />
        </Field>
        {kind !== 'saving' && minorsOf(cats, major).length > 0 && (
          <Field label="소구분">
            <ChipRow
              allowNull
              options={minorsOf(cats, major).map((m) => ({ value: m.id as string | null, label: m.name }))}
              value={minor}
              onChange={setMinor}
            />
          </Field>
        )}
        {kind === 'expense' && (
          <Field label="결제수단">
            <ChipRow
              allowNull
              options={(pms ?? [])
                .filter((p) => !p.is_archived)
                .map((p) => ({ value: p.id as string | null, label: p.name }))}
              value={pm}
              onChange={setPm}
            />
          </Field>
        )}
        <Field label="주기">
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
              <div className="flex gap-1">
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <span
                    key={i}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold cursor-pointer ${weekday === i ? 'bg-acc text-white' : 'bg-[#F2F2EF]'}`}
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
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer ${lastDay ? 'bg-acc text-white' : 'bg-[#F2F2EF]'}`}
                  onClick={() => setLastDay(!lastDay)}
                >
                  말일
                </span>
              </>
            )}
          </div>
        </Field>
        <div className="flex gap-2">
          <Field label="시작일">
            <input type="date" className={inputCls} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="종료일 (선택)">
            <input type="date" className={inputCls} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center justify-between text-[12px] font-bold py-1 mb-2">
          <span>
            자동 등록
            <span className="block text-[10px] text-sub font-semibold mt-0.5">
              끄면 해당일에 확인 카드가 뜨고 탭해야 등록돼요
            </span>
          </span>
          <input
            type="checkbox"
            className="w-5 h-5 accent-acc"
            checked={autoCreate}
            onChange={(e) => setAutoCreate(e.target.checked)}
          />
        </label>
        <p className="text-[10px] text-sub mb-2">저장하면 미래 인스턴스만 갱신됩니다. 과거 기록은 그대로 유지돼요.</p>
        <SaveButton onClick={save} />
        {editing !== 'new' && editing && (
          <button
            className="w-full border-0 bg-transparent text-warn text-[12px] font-bold mt-3"
            onClick={() => removeRule(editing)}
          >
            규칙 삭제
          </button>
        )}
      </BottomSheet>
    </div>
  )
}

export default function ExpenseEditPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'data' | 'category' | 'recurring'>('data')
  return (
    <div>
      <div className="flex items-center gap-3 mt-1.5 mb-3.5">
        <button className="w-[34px] h-[34px] rounded-[11px] border-0 bg-white shadow-card text-[16px]" onClick={() => nav('/expense')}>
          ‹
        </button>
        <h1 className="text-[24px] font-extrabold tracking-tight m-0">수정 모드</h1>
      </div>
      <SegmentedControl
        className="mb-3.5"
        options={[
          { value: 'data', label: '데이터 수정' },
          { value: 'category', label: '카테고리 수정' },
          { value: 'recurring', label: '고정지출 관리' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'data' && <DataEdit />}
      {tab === 'category' && <CategoryEdit />}
      {tab === 'recurring' && <RecurringEdit />}
    </div>
  )
}
