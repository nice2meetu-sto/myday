import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, ComposedChart, Bar, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { addMonths, addYears, format } from 'date-fns'
import { Card, Label, StatNumber, SegmentedControl, AddButton, PageHead, PeriodNav, EmptyState, SaveButton, inputCls } from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { MoneySheet } from '../components/MoneySheet'
import { useCategories, catName, useInvalidate, useUserId } from '../lib/queries'
import { useMoneyRange, useSummaryView, sumAmount, monthRange, yearRange } from '../lib/money'
import { fmt, fmtWon, commaInput, parseAmount } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast } from '../stores/ui'
import type { MoneyEntry, Saving } from '../types'

const FALLBACK_COLORS = ['#C7976F', '#FFDE70', '#A3C4EB', '#D0BC98', '#C7CE9A']

/** hex 색상을 진하게 (0.8 = 20% 어둡게) */
function darken(hex: string, factor = 0.78): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return hex
  const [r, g, b] = [0, 2, 4].map((i) => Math.round(parseInt(m.slice(i, i + 2), 16) * factor))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function DeltaLine({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  if (!prev) return <div className="text-[11px] font-bold mt-1 text-sub">— {label}</div>
  const pct = ((cur - prev) / prev) * 100
  const up = pct > 0.05
  const down = pct < -0.05
  return (
    <div className={`text-[11px] font-bold mt-1 ${up ? 'text-up' : down ? 'text-down' : 'text-sub'}`}>
      {up ? '▲' : down ? '▼' : '—'} {Math.abs(pct).toFixed(1)}% 지난{label}
    </div>
  )
}

function Donut({
  title,
  rows,
  kind,
}: {
  title: string
  rows: MoneyEntry[]
  kind: 'expense' | 'income'
}) {
  const { data: cats } = useCategories()
  const [drill, setDrill] = useState<string | null>(null)

  const byMajor = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((r) => {
      const k = r.major_category_id ?? 'none'
      map.set(k, (map.get(k) ?? 0) + Number(r.amount))
    })
    const total = [...map.values()].reduce((a, b) => a + b, 0)
    const items = [...map.entries()]
      .map(([id, amt], i) => ({
        id,
        name: id === 'none' ? '미분류' : catName(cats, id) || '미분류',
        amount: amt,
        pct: total ? Math.round((amt / total) * 100) : 0,
        color:
          (cats ?? []).find((c) => c.id === id)?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount)
    return { items, total }
  }, [rows, cats])

  const drillRows = useMemo(() => {
    if (!drill) return null
    const list = rows.filter((r) => (r.major_category_id ?? 'none') === drill)
    const byMinor = new Map<string, { name: string; amount: number; items: MoneyEntry[] }>()
    list.forEach((r) => {
      const k = r.minor_category_id ?? 'none'
      const name = r.minor_category_id ? catName(cats, r.minor_category_id) : '기타'
      const e = byMinor.get(k) ?? { name, amount: 0, items: [] }
      e.amount += Number(r.amount)
      e.items.push(r)
      byMinor.set(k, e)
    })
    return [...byMinor.values()].sort((a, b) => b.amount - a.amount)
  }, [drill, rows, cats])

  if (!byMajor.items.length)
    return (
      <Card className="mb-2">
        <Label className="mb-2">{title}</Label>
        <EmptyState>아직 내역이 없어요</EmptyState>
      </Card>
    )

  return (
    <Card className="mb-2">
      <Label className="mb-3.5">{title}</Label>
      <div className="flex items-center gap-4">
        <PieChart width={110} height={110}>
          <Pie
            data={byMajor.items}
            dataKey="amount"
            innerRadius={32}
            outerRadius={52}
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(d) => setDrill(drill === d.id ? null : (d.id as string))}
          >
            {byMajor.items.map((e) => (
              <Cell
                key={e.id}
                fill={drill === e.id ? darken(e.color) : e.color}
                cursor="pointer"
                tabIndex={-1}
              />
            ))}
          </Pie>
        </PieChart>
        <div className="flex-1 text-[12px]">
          {byMajor.items.map((e) => (
            <div
              key={e.id}
              className={`flex items-center gap-1.5 py-1 cursor-pointer rounded-md px-1 ${drill === e.id ? 'bg-[#FAFAF8]' : ''}`}
              onClick={() => setDrill(drill === e.id ? null : e.id)}
            >
              <i className="w-2 h-2 rounded-[3px] flex-none" style={{ background: e.color }} />
              <span className="flex-1 font-semibold">{e.name}</span>
              <span className="text-sub text-[11px] tabular">
                {fmt(e.amount)} · {e.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
      {drillRows && (
        <div className="bg-[#FAFAF8] rounded-[14px] px-3 py-2.5 mt-3 text-[12px]">
          {drillRows.map((m, i) => (
            <div key={i} className="border-b border-[#EEE] last:border-0 py-1">
              <div className="flex justify-between font-bold py-1">
                <span>· {m.name}</span>
                <span className="tabular">{fmt(m.amount)}</span>
              </div>
              {m.items.map((it) => (
                <div key={it.id} className="flex justify-between py-0.5 pl-3 text-sub">
                  <span>
                    {new Date(it.occurred_at).getDate()}일 {it.memo ?? ''}
                  </span>
                  <span className="tabular">{fmt(Number(it.amount))}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function BudgetCard({ anchor, spent }: { anchor: Date; spent: number }) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const monthKey = format(anchor, 'yyyy-MM-01')
  const prevKey = format(addMonths(anchor, -1), 'yyyy-MM-01')
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')

  const { data: budgets } = useQuery({
    queryKey: ['budgets', monthKey],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('budgets')
        .select('*')
        .in('month', [monthKey, prevKey])
      if (error) throw error
      return data as { month: string; amount: number }[]
    },
  })
  const budget = budgets?.find((b) => b.month === monthKey)
  const prevBudget = budgets?.find((b) => b.month === prevKey)

  const save = async () => {
    const amt = parseAmount(input)
    if (!amt) {
      toast('금액을 입력해주세요')
      return
    }
    await sb()
      .from('budgets')
      .upsert(
        { user_id: userId, month: monthKey, amount: amt },
        { onConflict: 'user_id,month' },
      )
    invalidate(['budgets'])
    setOpen(false)
    toast('예산을 저장했어요')
  }

  const openSheet = () => {
    setInput(commaInput(String(budget?.amount ?? prevBudget?.amount ?? '')))
    setOpen(true)
  }

  const left = budget ? Number(budget.amount) - spent : 0
  const pct = budget ? Math.round((spent / Number(budget.amount)) * 100) : 0
  const over = budget && left < 0

  return (
    <>
      <Card className="mb-2" onClick={openSheet}>
        <Label>이번달 예산 잔액</Label>
        {!budget ? (
          <EmptyState>이번달 예산을 정해보세요</EmptyState>
        ) : (
          <>
            <StatNumber size="sm" value={left} warn={!!over} className="mt-1" />
            <div className="h-1.5 bg-line rounded-lg overflow-hidden mt-2.5">
              <i
                className="block h-full rounded-lg transition-all"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: over ? '#B44B28' : '#C7CE9A',
                }}
              />
            </div>
            <div className={`text-[12px] mt-2 ${over ? 'text-warn' : 'text-sub'}`}>
              {over
                ? `예산을 ${fmtWon(-left)} 넘었어요`
                : `예산 ${fmtWon(Number(budget.amount))} 중 ${pct}% 썼어요`}
            </div>
          </>
        )}
      </Card>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="이번달 예산">
        <input
          className={inputCls + ' text-[18px] mb-3'}
          inputMode="numeric"
          placeholder="0"
          value={input}
          autoFocus
          onChange={(e) => setInput(commaInput(e.target.value))}
        />
        <SaveButton onClick={save} />
      </BottomSheet>
    </>
  )
}

function TrendChart({ mode, anchor }: { mode: 'month' | 'year'; anchor: Date }) {
  const { data: summary } = useSummaryView()

  const data = useMemo(() => {
    if (!summary) return []
    if (mode === 'month') {
      // 누적저축: 월별 saving 합의 누계
      const savingByMonth = new Map<string, number>()
      summary
        .filter((r) => r.kind === 'saving')
        .forEach((r) => savingByMonth.set(r.month, (savingByMonth.get(r.month) ?? 0) + r.total))
      const allMonths = [...new Set(summary.map((r) => r.month))].sort()
      const cum = new Map<string, number>()
      let acc = 0
      allMonths.forEach((m) => {
        acc += savingByMonth.get(m) ?? 0
        cum.set(m, acc)
      })
      const out = []
      for (let i = 5; i >= 0; i--) {
        const d = addMonths(anchor, -i)
        const key = format(d, 'yyyy-MM')
        const lastKnown = allMonths.filter((m) => m <= key).pop()
        out.push({
          label: `${d.getMonth() + 1}월`,
          expense: summary.filter((r) => r.month === key && r.kind === 'expense').reduce((s, r) => s + r.total, 0),
          income: summary.filter((r) => r.month === key && r.kind === 'income').reduce((s, r) => s + r.total, 0),
          cumSaving: lastKnown ? (cum.get(lastKnown) ?? 0) : 0,
        })
      }
      return out
    } else {
      const out = []
      for (let i = 5; i >= 0; i--) {
        const d = addYears(anchor, -i)
        const y = `${d.getFullYear()}`
        const rows = summary.filter((r) => r.month.startsWith(y))
        const savingAll = summary.filter((r) => r.kind === 'saving' && r.month.slice(0, 4) <= y)
        out.push({
          label: `${y.slice(2)}년`,
          expense: rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.total, 0),
          income: rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.total, 0),
          cumSaving: savingAll.reduce((s, r) => s + r.total, 0),
        })
      }
      return out
    }
  }, [summary, mode, anchor])

  return (
    <Card className="mb-2">
      <Label>최근 6{mode === 'month' ? '개월' : '년'}</Label>
      <div className="h-[150px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, left: 4, right: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700, fill: '#8E8E93' }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v: number, name: string) => [
                fmtWon(v),
                name === 'expense' ? '소비' : name === 'income' ? '수입' : '누적저축',
              ]}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.12)', fontSize: 11, fontWeight: 700 }}
            />
            <Bar dataKey="expense" fill="#C7976F" radius={[4, 4, 0, 0]} />
            <Bar dataKey="income" fill="#C7CE9A" radius={[4, 4, 0, 0]} />
            <Line dataKey="cumSaving" stroke="#A3C4EB" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function SavingsView({ anchor }: { anchor: Date }) {
  const { data: cats } = useCategories()
  const { from, to } = monthRange(anchor)
  const { data: savings } = useMoneyRange('saving', from, to)
  const { data: expenses } = useMoneyRange('expense', from, to)
  const { data: incomes } = useMoneyRange('income', from, to)
  const { data: summary } = useSummaryView()

  const totalSaving = sumAmount(savings)
  const remaining = sumAmount(incomes) - sumAmount(expenses) - totalSaving
  const cumSaving = (summary ?? [])
    .filter((r) => r.kind === 'saving')
    .reduce((s, r) => s + r.total, 0)

  const [editing, setEditing] = useState<Saving | null>(null)

  return (
    <>
      <Card className="mb-2" style={{ background: '#FFDE70' }}>
        <Label className="!text-[#8a7420]">이번달 남은돈</Label>
        <StatNumber value={remaining} warn={remaining < 0} />
        <div className="flex gap-6 mt-4">
          <div>
            <Label className="!text-[#8a7420]">이번달 저축</Label>
            <div className="text-[16px] font-bold tabular">{fmt(totalSaving)}</div>
          </div>
          <div>
            <Label className="!text-[#8a7420]">누적 저축</Label>
            <div className="text-[16px] font-bold tabular">{fmt(cumSaving)}</div>
          </div>
        </div>
      </Card>
      <Card>
        <Label className="mb-2">저축 내역</Label>
        {!savings?.length && <EmptyState>이번달 저축 내역이 없어요</EmptyState>}
        {(savings as Saving[] | undefined)?.map((s) => (
          <div
            key={s.id}
            className="flex justify-between items-center py-2 border-b border-line last:border-0 text-[13px] cursor-pointer"
            onClick={() => setEditing(s)}
          >
            <div>
              <div className="font-semibold">
                {catName(cats, s.category_id) || '저축'}
                {s.memo ? ` · ${s.memo}` : ''}
              </div>
              <div className="text-[11px] text-sub">
                {new Date(s.occurred_at).getMonth() + 1}월 {new Date(s.occurred_at).getDate()}일
              </div>
            </div>
            <b className={`tabular ${Number(s.amount) < 0 ? 'text-warn' : ''}`}>
              {fmt(Number(s.amount))}
            </b>
          </div>
        ))}
      </Card>
      <MoneySheet
        open={!!editing}
        onClose={() => setEditing(null)}
        edit={editing ? { kind: 'saving', entry: editing } : null}
      />
    </>
  )
}

export default function ExpensePage() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [sheetOpen, setSheetOpen] = useState(false)

  // 탭바에서 소비 탭 재탭 → 월/연 전환
  useEffect(() => {
    const onRetap = () => setMode((m) => (m === 'month' ? 'year' : 'month'))
    window.addEventListener('tab-retap:/expense', onRetap)
    return () => window.removeEventListener('tab-retap:/expense', onRetap)
  }, [])

  const range = mode === 'month' ? monthRange(anchor) : yearRange(anchor)
  const prevAnchor = mode === 'month' ? addMonths(anchor, -1) : addYears(anchor, -1)
  const prevRange = mode === 'month' ? monthRange(prevAnchor) : yearRange(prevAnchor)

  const { data: expenses } = useMoneyRange('expense', range.from, range.to)
  const { data: incomes } = useMoneyRange('income', range.from, range.to)
  const { data: savings } = useMoneyRange('saving', range.from, range.to)
  const { data: prevExpenses } = useMoneyRange('expense', prevRange.from, prevRange.to)
  const { data: prevIncomes } = useMoneyRange('income', prevRange.from, prevRange.to)
  const { data: prevSavings } = useMoneyRange('saving', prevRange.from, prevRange.to)

  const label =
    mode === 'month'
      ? `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`
      : `${anchor.getFullYear()}년`
  const unit = mode === 'month' ? '달' : '해'

  const move = (dir: 1 | -1) =>
    setAnchor(mode === 'month' ? addMonths(anchor, dir) : addYears(anchor, dir))

  return (
    <div>
      <PageHead
        title="소비"
        right={
          <>
            <AddButton light icon="✎" onClick={() => nav('/expense/edit')} />
            <AddButton onClick={() => setSheetOpen(true)} />
          </>
        }
      />
      <SegmentedControl
        className="mb-3.5"
        options={[
          { value: 'month', label: '월' },
          { value: 'year', label: '연' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <PeriodNav label={label} onPrev={() => move(-1)} onNext={() => move(1)} />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Card>
          <Label>소비</Label>
          <StatNumber size="sm" value={sumAmount(expenses)} />
          <DeltaLine cur={sumAmount(expenses)} prev={sumAmount(prevExpenses)} label={unit} />
        </Card>
        <Card>
          <Label>수입</Label>
          <StatNumber size="sm" value={sumAmount(incomes)} />
          <DeltaLine cur={sumAmount(incomes)} prev={sumAmount(prevIncomes)} label={unit} />
        </Card>
      </div>
      {mode === 'month' && <BudgetCard anchor={anchor} spent={sumAmount(expenses)} />}
      <Donut title="카테고리별 소비" rows={(expenses ?? []) as MoneyEntry[]} kind="expense" />
      <Donut title="카테고리별 수입" rows={(incomes ?? []) as MoneyEntry[]} kind="income" />
      <Card className="mb-2">
        <Label>{mode === 'month' ? '이번달' : '올해'} 저축</Label>
        <StatNumber size="sm" value={sumAmount(savings)} />
        <DeltaLine cur={sumAmount(savings)} prev={sumAmount(prevSavings)} label={unit} />
      </Card>
      <TrendChart mode={mode} anchor={anchor} />
      <SavingsView anchor={anchor} />
      <MoneySheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  )
}
