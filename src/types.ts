export type MoneyKind = 'expense' | 'income' | 'saving'
export type Quadrant = 'ui' | 'un' | 'ni' | 'nn'
export type BookStatus = 'want' | 'reading' | 'finished'

export interface Category {
  id: string
  user_id: string
  kind: MoneyKind
  parent_id: string | null
  name: string
  color: string | null
  icon: string | null
  sort_order: number
  is_archived: boolean
}

export interface PaymentMethod {
  id: string
  user_id: string
  name: string
  sort_order: number
  is_archived: boolean
}

export interface RecurringRule {
  id: string
  user_id: string
  kind: MoneyKind
  name: string
  amount: number
  major_category_id: string | null
  minor_category_id: string | null
  payment_method_id: string | null
  memo: string | null
  freq: 'monthly' | 'yearly' | 'weekly'
  interval_n: number
  bymonthday: number | null
  bymonth: number | null
  byweekday: number | null
  starts_on: string
  ends_on: string | null
  is_active: boolean
  auto_create: boolean
}

export interface MoneyEntry {
  id: string
  user_id: string
  amount: number
  major_category_id: string | null
  minor_category_id: string | null
  memo: string | null
  occurred_at: string
  payment_method_id?: string | null
  recurring_id: string | null
  is_skipped?: boolean
}

export interface Saving {
  id: string
  user_id: string
  amount: number
  category_id: string | null
  memo: string | null
  occurred_at: string
  recurring_id: string | null
}

export interface Book {
  id: string
  user_id: string
  cover_url: string | null
  title: string
  author: string | null
  total_pages: number | null
  current_page: number
  status: BookStatus
  started_at: string | null
  finished_at: string | null
  rating: number | null
  shelf_order: number
}

export interface BookQuote {
  id: string
  user_id: string
  book_id: string
  content: string
  page: number | null
  created_at: string
}

export interface ReadingLog {
  id: string
  user_id: string
  book_id: string
  log_date: string
  end_page: number
  pages_read: number
  created_at: string
}

export interface TodoTemplate {
  id: string
  user_id: string
  content: string
  quadrant: Quadrant | null
  due_time: string | null
  freq: 'daily' | 'weekly' | 'monthly'
  interval_n: number
  byweekday: number[] | null
  bymonthday: number | null
  starts_on: string
  ends_on: string | null
  is_active: boolean
}

export interface Todo {
  id: string
  user_id: string
  content: string
  quadrant: Quadrant | null
  due_date: string | null
  due_time: string | null
  is_done: boolean
  done_at: string | null
  sort_order: number
  template_id: string | null
  is_skipped: boolean
}

export interface Diary {
  id: string
  user_id: string
  photo_url: string | null
  entry_date: string
  entry_time: string | null
  content: string | null
  created_at: string
}

export interface Budget {
  id: string
  user_id: string
  month: string
  amount: number
}

export interface Note {
  id: string
  user_id: string
  content: string | null
  updated_at: string
}
