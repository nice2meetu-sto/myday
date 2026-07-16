import { sb } from './supabase'

const PALETTE = ['#C7976F', '#FFDE70', '#A3C4EB', '#D0BC98', '#C7CE9A']

const DEFAULTS: Record<'expense' | 'income' | 'saving', string[]> = {
  expense: ['식비', '교통', '주거', '문화', '쇼핑', '기타'],
  income: ['급여', '부수입', '기타'],
  saving: ['적금', '투자', '비상금'],
}

const DEFAULT_PAYMENTS = ['신용카드', '체크카드', '현금', '계좌이체']

/** 최초 로그인 시 기본 카테고리/결제수단 시드 */
export async function seedDefaults(userId: string) {
  const { count } = await sb()
    .from('categories')
    .select('id', { count: 'exact', head: true })
  if ((count ?? 0) === 0) {
    const rows: Record<string, unknown>[] = []
    ;(Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).forEach((kind) => {
      DEFAULTS[kind].forEach((name, i) => {
        rows.push({
          user_id: userId,
          kind,
          name,
          color: PALETTE[i % PALETTE.length],
          sort_order: i,
        })
      })
    })
    await sb().from('categories').insert(rows)
  }

  const { count: pmCount } = await sb()
    .from('payment_methods')
    .select('id', { count: 'exact', head: true })
  if ((pmCount ?? 0) === 0) {
    await sb()
      .from('payment_methods')
      .insert(DEFAULT_PAYMENTS.map((name, i) => ({ user_id: userId, name, sort_order: i })))
  }
}
