import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Card,
  SegmentedControl,
  AddButton,
  EmptyState,
  Field,
  inputCls,
  SaveButton,
  ChipRow,
} from '../components/common'
import { BottomSheet } from '../components/BottomSheet'
import { useImageUrl } from '../components/CoverImg'
import { uploadImage } from '../lib/image'
import { usePaymentMethods, useInvalidate, useUserId } from '../lib/queries'
import { fmt, todayStr, commaInput, parseAmount, fmtDot } from '../lib/format'
import { sb } from '../lib/supabase'
import { toast, toastError } from '../stores/ui'
import type { Category, WishItem, WishStatus } from '../types'

const STATUS_TABS: { value: WishStatus; label: string }[] = [
  { value: 'want', label: '사고싶음' },
  { value: 'bought', label: '샀음' },
  { value: 'dropped', label: '안샀음' },
]

/** 이름으로 구글 이미지 검색 — 사진을 링크로 가져올 때 */
const productSearchUrl = (name: string) =>
  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name.trim())}`

/** 담아둔 지 며칠 됐는지 */
function daysSince(dateStr: string): number {
  const a = new Date(dateStr + 'T00:00:00').getTime()
  const b = new Date(todayStr() + 'T00:00:00').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

function useWishlist(status: WishStatus) {
  return useQuery({
    queryKey: ['wishlist', status],
    queryFn: async () => {
      const { data, error } = await sb()
        .from('wishlist')
        .select('*')
        .eq('status', status)
        .order('wanted_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as WishItem[]
    },
  })
}

/**
 * 소비 자동 등록용 '쇼핑 > 합당' 카테고리를 찾고, 없으면 만들어서 id를 돌려준다.
 * 이름으로 찾기 때문에 이미 만들어둔 게 있으면 그걸 그대로 쓴다.
 */
async function ensureShoppingCategory(
  userId: string,
): Promise<{ major: string | null; minor: string | null }> {
  const { data } = await sb().from('categories').select('*').eq('kind', 'expense')
  const list = (data ?? []) as Category[]

  let major = list.find((c) => !c.parent_id && c.name === '쇼핑') ?? null
  if (!major) {
    const { data: created } = await sb()
      .from('categories')
      .insert({
        user_id: userId,
        kind: 'expense',
        name: '쇼핑',
        icon: '🛍️',
        color: '#D0BC98',
        sort_order: list.filter((c) => !c.parent_id).length,
      })
      .select()
      .single()
    major = (created as Category) ?? null
  }
  if (!major) return { major: null, minor: null }

  let minor = list.find((c) => c.parent_id === major!.id && c.name === '합당') ?? null
  if (!minor) {
    const { data: created } = await sb()
      .from('categories')
      .insert({
        user_id: userId,
        kind: 'expense',
        parent_id: major.id,
        name: '합당',
        sort_order: list.filter((c) => c.parent_id === major!.id).length,
      })
      .select()
      .single()
    minor = (created as Category) ?? null
  }
  return { major: major.id, minor: minor?.id ?? null }
}

// ---------------- 사진 ----------------
function WishPhoto({
  item,
  className = '',
  thumb = true,
  size = 22,
}: {
  item: WishItem
  className?: string
  thumb?: boolean
  size?: number
}) {
  const { data: url } = useImageUrl('covers', item.image_url, thumb)
  if (item.image_url && url)
    return <img src={url} alt={item.name} loading="lazy" className={`object-cover ${className}`} />
  return (
    <div
      className={`bg-[#F2F2EF] flex items-center justify-center ${className}`}
      style={{ fontSize: size }}
    >
      🛒
    </div>
  )
}

// ---------------- 추가 / 수정 시트 ----------------
function WishSheet({
  open,
  edit,
  onClose,
}: {
  open: boolean
  edit: WishItem | null
  onClose: () => void
}) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [reason, setReason] = useState('')
  const [wantedOn, setWantedOn] = useState(todayStr())
  const [photoMode, setPhotoMode] = useState<'keep' | 'upload' | 'url'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const loaded = useRef<string | null>(null)

  const key = edit ? edit.id : 'new'
  if (open && loaded.current !== key) {
    loaded.current = key
    setName(edit?.name ?? '')
    setPrice(edit?.price != null ? commaInput(String(edit.price)) : '')
    setReason(edit?.reason ?? '')
    setWantedOn(edit?.wanted_on ?? todayStr())
    setPhotoMode(edit?.image_url ? 'keep' : 'upload')
    setFile(null)
    setUrl(edit?.image_url?.startsWith('http') ? edit.image_url : '')
  }
  if (!open && loaded.current) loaded.current = null

  const save = async () => {
    if (!name.trim()) {
      toast('이름을 입력해주세요')
      return
    }
    setBusy(true)
    // 사진: keep이면 건드리지 않고, upload/url이면 새 값으로 교체
    let image: string | null | undefined = undefined
    if (photoMode === 'upload' && file) {
      try {
        const r = await uploadImage('covers', userId, file)
        image = r.path
      } catch {
        toast('사진 업로드에 실패했어요 · 사진 없이 저장합니다')
      }
    } else if (photoMode === 'url') {
      image = url.trim() || null
    }

    const row: Record<string, unknown> = {
      name: name.trim(),
      price: parseAmount(price) || null,
      reason: reason.trim() || null,
      wanted_on: wantedOn,
      updated_at: new Date().toISOString(),
    }
    if (image !== undefined) row.image_url = image

    const { error } = edit
      ? await sb().from('wishlist').update(row).eq('id', edit.id)
      : await sb()
          .from('wishlist')
          .insert({ ...row, user_id: userId, image_url: image ?? null, status: 'want' })
    setBusy(false)
    if (error) {
      toastError('저장 실패', error)
      return
    }
    invalidate(['wishlist'])
    toast(edit ? '수정했어요' : '위시리스트에 담았어요')
    onClose()
  }


  return (
    <BottomSheet open={open} onClose={onClose} title={edit ? '위시 수정' : '사고싶은 것'}>
      <Field label="이름">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="flex gap-2">
        <Field label="가격 (몰라도 괜찮아요)">
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder="0"
            value={price}
            onChange={(e) => setPrice(commaInput(e.target.value))}
          />
        </Field>
        <Field label="사고싶어진 날">
          <input
            type="date"
            className={inputCls}
            value={wantedOn}
            onChange={(e) => setWantedOn(e.target.value)}
          />
        </Field>
      </div>
      <Field label="사고싶은 이유">
        <textarea
          className={inputCls}
          rows={3}
          placeholder="왜 갖고 싶은지 적어두면 나중에 판단하기 좋아요"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <Field label="사진 (선택)">
        <SegmentedControl
          className="mb-2"
          options={[
            ...(edit?.image_url ? [{ value: 'keep' as const, label: '그대로' }] : []),
            { value: 'upload' as const, label: '사진 업로드' },
            { value: 'url' as const, label: 'URL 붙여넣기' },
          ]}
          value={photoMode}
          onChange={setPhotoMode}
        />
        {photoMode === 'upload' && (
          <>
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
              {file ? `📎 ${file.name}` : '사진 선택'}
            </button>
          </>
        )}
        {photoMode === 'url' && (
          <>
            {/* 검색해서 링크로 넣는 경우가 많아 바로 검색 버튼을 둔다 */}
            <button
              className="w-full border border-black/10 rounded-xl py-2.5 text-[12px] font-bold bg-white mb-2"
              onClick={() => {
                if (!name.trim()) {
                  toast('이름을 먼저 입력해주세요')
                  return
                }
                window.open(productSearchUrl(name), '_blank', 'noopener')
              }}
            >
              🔍 구글에서 사진 검색
            </button>
            <input
              className={inputCls}
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {url.trim() && (
              <div className="mt-2 flex justify-center">
                <img src={url.trim()} alt="" className="h-28 rounded-lg shadow-card object-cover" />
              </div>
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

// ---------------- 샀어요 → 소비 자동 등록 ----------------
function BuySheet({ item, onClose }: { item: WishItem | null; onClose: () => void }) {
  const userId = useUserId()
  const invalidate = useInvalidate()
  const { data: pms } = usePaymentMethods()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [pm, setPm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loaded = useRef<string | null>(null)

  if (item && loaded.current !== item.id) {
    loaded.current = item.id
    setAmount(item.price != null ? commaInput(String(item.price)) : '')
    setDate(todayStr())
    setPm(localStorage.getItem('myday-last-pm'))
  }
  if (!item && loaded.current) loaded.current = null

  const save = async () => {
    if (!item) return
    const amt = parseAmount(amount)
    if (!amt) {
      toast('금액을 입력해주세요')
      return
    }
    setBusy(true)
    const { major, minor } = await ensureShoppingCategory(userId)
    // 구매일 + 현재 시각으로 기록 (소비 탭 시간순 정렬이 자연스럽도록)
    const now = new Date()
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const { data: exp, error } = await sb()
      .from('expenses')
      .insert({
        user_id: userId,
        amount: amt,
        memo: item.name,
        occurred_at: new Date(`${date}T${hm}:00`).toISOString(),
        major_category_id: major,
        minor_category_id: minor,
        payment_method_id: pm,
      })
      .select()
      .single()
    if (error) {
      setBusy(false)
      toastError('소비 등록 실패', error)
      return
    }
    if (pm) localStorage.setItem('myday-last-pm', pm)
    const patch: Record<string, unknown> = {
      status: 'bought',
      decided_on: date,
      expense_id: exp.id,
      updated_at: new Date().toISOString(),
    }
    // 가격을 몰랐던 건 실제 산 금액으로 채워준다 (알던 가격은 그대로 둔다)
    if (item.price == null) patch.price = amt
    await sb().from('wishlist').update(patch).eq('id', item.id)
    setBusy(false)
    invalidate(['wishlist', 'money', 'summary', 'budgets', 'categories'])
    toast('샀어요! 쇼핑 · 합당으로 기록했어요')
    onClose()
  }

  const activePms = (pms ?? []).filter((p) => !p.is_archived)

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item ? `${item.name} 샀어요` : ''}>
      <div className="flex gap-2">
        <Field label="실제 쓴 금액">
          <input
            className={inputCls + ' text-[18px]'}
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(commaInput(e.target.value))}
          />
        </Field>
        <Field label="산 날">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      <Field label="결제수단">
        <ChipRow
          allowNull
          options={activePms.map((p) => ({ value: p.id as string | null, label: p.name }))}
          value={pm}
          onChange={setPm}
        />
      </Field>
      <p className="text-[11px] text-sub mb-3">
        저장하면 <b>쇼핑 · 합당</b> 으로 그날 소비에 자동으로 추가돼요.
      </p>
      <SaveButton onClick={save} disabled={busy}>
        {busy ? '등록 중…' : '소비에 기록하기'}
      </SaveButton>
    </BottomSheet>
  )
}

// ---------------- 안 살래요 → 이유 ----------------
function DropSheet({ item, onClose }: { item: WishItem | null; onClose: () => void }) {
  const invalidate = useInvalidate()
  const [why, setWhy] = useState('')
  const loaded = useRef<string | null>(null)

  if (item && loaded.current !== item.id) {
    loaded.current = item.id
    setWhy(item.drop_reason ?? '')
  }
  if (!item && loaded.current) loaded.current = null

  const save = async () => {
    if (!item) return
    await sb()
      .from('wishlist')
      .update({
        status: 'dropped',
        drop_reason: why.trim() || null,
        decided_on: todayStr(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
    invalidate(['wishlist'])
    toast('안 사기로 했어요')
    onClose()
  }

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item ? `${item.name} 안 살래요` : ''}>
      <Field label="안 사기로 한 이유">
        <textarea
          className={inputCls}
          rows={4}
          placeholder="비슷한 걸 이미 갖고 있어서 · 당장 필요하진 않아서…"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          autoFocus
        />
      </Field>
      <SaveButton onClick={save}>저장</SaveButton>
    </BottomSheet>
  )
}

// ---------------- 그리드 타일 ----------------
function WishTile({ item, onOpen }: { item: WishItem; onOpen: () => void }) {
  const days = daysSince(item.wanted_on)
  return (
    <Card className="!p-0 overflow-hidden" onClick={onOpen}>
      <WishPhoto item={item} className="w-full aspect-square" size={34} />
      <div className="p-2.5">
        <div className="text-[12.5px] font-bold leading-snug line-clamp-2">{item.name}</div>
        <div className="text-[15px] font-extrabold tabular mt-1">
          {item.price != null ? `₩${fmt(item.price)}` : '가격 미정'}
        </div>
        <div className="text-[10px] text-sub font-semibold mt-0.5">
          {item.status === 'want'
            ? days > 0
              ? `담아둔 지 ${days}일`
              : '오늘 담았어요'
            : item.decided_on
              ? fmtDot(item.decided_on)
              : fmtDot(item.wanted_on)}
        </div>
      </div>
    </Card>
  )
}

// ---------------- 상세 시트 ----------------
function WishDetailSheet({
  item,
  onClose,
  onEdit,
  onBuy,
  onDrop,
  onRevert,
  onDelete,
}: {
  item: WishItem | null
  onClose: () => void
  onEdit: () => void
  onBuy: () => void
  onDrop: () => void
  onRevert: () => void
  onDelete: () => void
}) {
  if (!item) return <BottomSheet open={false} onClose={onClose} title="" children={null} />
  const days = daysSince(item.wanted_on)
  return (
    <BottomSheet open={!!item} onClose={onClose} title={item.name}>
      <WishPhoto item={item} thumb={false} className="w-full rounded-2xl mb-3 max-h-[46dvh]" size={48} />

      <div className="text-[22px] font-extrabold tabular tracking-tight">
        {item.price != null ? `₩${fmt(item.price)}` : '가격 미정'}
      </div>
      <div className="text-[11px] text-sub font-semibold mt-1 mb-3">
        {fmtDot(item.wanted_on)}부터
        {item.status === 'want' && <> · 담아둔 지 {days}일</>}
        {item.status === 'bought' && item.decided_on && <> → {fmtDot(item.decided_on)} 구매</>}
        {item.status === 'dropped' && item.decided_on && <> → {fmtDot(item.decided_on)} 안 사기로</>}
      </div>

      {item.reason && (
        <div className="bg-[#FAFAF8] rounded-2xl p-3.5 mb-2.5">
          <div className="text-[11px] text-sub font-bold mb-1">사고 싶은 이유</div>
          <p className="m-0 text-[13px] leading-[1.6] text-[#333] whitespace-pre-wrap">
            {item.reason}
          </p>
        </div>
      )}
      {item.status === 'dropped' && item.drop_reason && (
        <div className="bg-[#FAFAF8] rounded-2xl p-3.5 mb-2.5">
          <div className="text-[11px] text-sub font-bold mb-1">안 사기로 한 이유</div>
          <p className="m-0 text-[13px] leading-[1.6] text-[#333] whitespace-pre-wrap">
            {item.drop_reason}
          </p>
        </div>
      )}

      <div className="text-[11px] text-sub font-bold mt-3.5 mb-1.5">처리</div>
      {item.status === 'want' ? (
        <div className="flex gap-2">
          <button
            className="flex-1 border-0 rounded-[14px] py-[13px] font-bold text-[13px] bg-[#F2F2EF]"
            onClick={onDrop}
          >
            안 살래요
          </button>
          <button
            className="flex-1 border-0 rounded-[14px] py-[13px] font-bold text-[13px] bg-acc text-white"
            onClick={onBuy}
          >
            샀어요
          </button>
        </div>
      ) : (
        <button
          className="w-full border-0 rounded-[14px] py-[13px] font-bold text-[13px] bg-[#F2F2EF]"
          onClick={onRevert}
        >
          다시 사고싶음으로
        </button>
      )}

      <div className="flex gap-2 mt-3">
        <button
          className="flex-1 border-0 bg-transparent text-[12px] font-bold text-sub py-2"
          onClick={onEdit}
        >
          아이템 수정
        </button>
        <button
          className="flex-1 border-0 bg-transparent text-[12px] font-bold text-warn py-2"
          onClick={onDelete}
        >
          아이템 삭제
        </button>
      </div>
    </BottomSheet>
  )
}

// ---------------- 페이지 ----------------
export default function WishlistPage() {
  const nav = useNavigate()
  const invalidate = useInvalidate()
  const [tab, setTab] = useState<WishStatus>('want')
  const { data: items } = useWishlist(tab)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<WishItem | null>(null)
  const [detail, setDetail] = useState<WishItem | null>(null)
  const [buying, setBuying] = useState<WishItem | null>(null)
  const [dropping, setDropping] = useState<WishItem | null>(null)

  const total = useMemo(
    () => (items ?? []).reduce((s, i) => s + Number(i.price ?? 0), 0),
    [items],
  )

  // 목록이 갱신되면 열려 있는 상세도 최신 내용으로 맞춰준다
  const detailItem = detail ? ((items ?? []).find((i) => i.id === detail.id) ?? detail) : null

  const removeItem = async (item: WishItem) => {
    if (!confirm(`'${item.name}'을(를) 삭제할까요?`)) return
    await sb().from('wishlist').delete().eq('id', item.id)
    invalidate(['wishlist'])
    setDetail(null)
    toast('삭제했어요')
  }

  const revert = async (item: WishItem) => {
    // 샀음을 되돌릴 때 자동 등록했던 소비 내역도 지울지 물어본다
    if (item.status === 'bought' && item.expense_id) {
      const alsoDelete = confirm(
        '연결된 소비 내역도 함께 지울까요?\n확인 = 소비 내역까지 삭제, 취소 = 소비는 두고 위시만 되돌리기',
      )
      if (alsoDelete) await sb().from('expenses').delete().eq('id', item.expense_id)
    }
    await sb()
      .from('wishlist')
      .update({
        status: 'want',
        decided_on: null,
        expense_id: null,
        drop_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
    invalidate(['wishlist', 'money', 'summary', 'budgets'])
    setDetail(null)
    toast('사고싶음으로 되돌렸어요')
  }

  return (
    <div>
      <div className="flex items-center gap-3 mt-1.5 mb-3.5">
        <button
          className="w-[34px] h-[34px] rounded-[11px] border-0 bg-white shadow-card text-[16px]"
          onClick={() => nav('/expense')}
        >
          ‹
        </button>
        <h1 className="text-[24px] font-extrabold tracking-tight m-0 flex-1">위시리스트</h1>
        <AddButton
          onClick={() => {
            setEditing(null)
            setSheetOpen(true)
          }}
        />
      </div>

      <SegmentedControl className="mb-3" options={STATUS_TABS} value={tab} onChange={setTab} />

      <div className="text-[12px] text-sub font-semibold mx-0.5 mb-2.5">
        {(items ?? []).length}개
        {total > 0 && <> · {fmt(total)}원</>}
      </div>

      {!items?.length && (
        <EmptyState>
          {tab === 'want'
            ? '사고싶은 걸 담아보세요'
            : tab === 'bought'
              ? '아직 산 게 없어요'
              : '안 사기로 한 게 없어요'}
        </EmptyState>
      )}
      <div className="grid grid-cols-2 gap-3">
        {items?.map((item) => (
          <WishTile key={item.id} item={item} onOpen={() => setDetail(item)} />
        ))}
      </div>

      <WishDetailSheet
        item={detailItem}
        onClose={() => setDetail(null)}
        onEdit={() => {
          setEditing(detailItem)
          setDetail(null)
          setSheetOpen(true)
        }}
        onBuy={() => {
          setBuying(detailItem)
          setDetail(null)
        }}
        onDrop={() => {
          setDropping(detailItem)
          setDetail(null)
        }}
        onRevert={() => detailItem && revert(detailItem)}
        onDelete={() => detailItem && removeItem(detailItem)}
      />
      <WishSheet
        open={sheetOpen}
        edit={editing}
        onClose={() => {
          setSheetOpen(false)
          setEditing(null)
        }}
      />
      <BuySheet item={buying} onClose={() => setBuying(null)} />
      <DropSheet item={dropping} onClose={() => setDropping(null)} />
    </div>
  )
}
