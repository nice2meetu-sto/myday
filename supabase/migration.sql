-- ============================================================
-- 마이데이 (개인 라이프 로그) — Supabase 스키마
-- Supabase 대시보드 → SQL Editor에 붙여넣고 실행하세요.
-- ============================================================

-- 카테고리 (소비/수입/저축 공용, 대구분-소구분 자기참조)
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('expense','income','saving')),
  parent_id uuid references categories(id) on delete cascade,
  name text not null,
  color text,
  sort_order int default 0,
  is_archived boolean default false,
  created_at timestamptz default now()
);

-- 결제수단
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  sort_order int default 0,
  is_archived boolean default false
);

-- 고정지출/고정수입 규칙
create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('expense','income','saving')),
  name text not null,
  amount numeric(12,0) not null,
  major_category_id uuid references categories(id),
  minor_category_id uuid references categories(id),
  payment_method_id uuid references payment_methods(id),
  memo text,
  freq text not null check (freq in ('monthly','yearly','weekly')),
  interval_n int not null default 1,
  bymonthday int,
  bymonth int,
  byweekday int,
  starts_on date not null,
  ends_on date,
  is_active boolean default true,
  auto_create boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 소비
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  amount numeric(12,0) not null,
  major_category_id uuid references categories(id),
  minor_category_id uuid references categories(id),
  memo text,
  occurred_at timestamptz not null default now(),
  payment_method_id uuid references payment_methods(id),
  recurring_id uuid references recurring_rules(id) on delete set null,
  is_skipped boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists expenses_user_occurred on expenses (user_id, occurred_at desc);
create index if not exists expenses_user_recurring on expenses (user_id, recurring_id);

-- 수입
create table if not exists incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  amount numeric(12,0) not null,
  major_category_id uuid references categories(id),
  minor_category_id uuid references categories(id),
  memo text,
  occurred_at timestamptz not null default now(),
  recurring_id uuid references recurring_rules(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists incomes_user_occurred on incomes (user_id, occurred_at desc);

-- 저축
create table if not exists savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  amount numeric(12,0) not null,
  category_id uuid references categories(id),
  memo text,
  occurred_at timestamptz not null default now(),
  recurring_id uuid references recurring_rules(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 책
create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  cover_url text,
  title text not null,
  author text,
  total_pages int,
  current_page int default 0,
  status text not null default 'want' check (status in ('want','reading','finished')),
  started_at date,
  finished_at date,
  rating numeric(2,1) check (rating between 0 and 5),
  shelf_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 필사
create table if not exists book_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  content text not null,
  page int,
  created_at timestamptz default now()
);

-- 독서 기록
create table if not exists reading_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  log_date date not null default current_date,
  end_page int not null,
  pages_read int not null,
  created_at timestamptz default now()
);
create index if not exists reading_logs_user_date on reading_logs (user_id, log_date desc);
create index if not exists reading_logs_user_book on reading_logs (user_id, book_id, created_at desc);

-- 반복 할일 템플릿
create table if not exists todo_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  content text not null,
  quadrant text check (quadrant in ('ui','un','ni','nn')),
  due_time time,
  freq text not null check (freq in ('daily','weekly','monthly')),
  interval_n int not null default 1,
  byweekday int[],
  bymonthday int,
  starts_on date not null,
  ends_on date,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 할일
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  content text not null,
  quadrant text check (quadrant in ('ui','un','ni','nn')),
  due_date date,
  due_time time,
  is_done boolean default false,
  done_at timestamptz,
  sort_order int default 0,
  template_id uuid references todo_templates(id) on delete set null,
  is_skipped boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists todos_user_due on todos (user_id, due_date);
create index if not exists todos_user_template on todos (user_id, template_id, due_date);
create unique index if not exists todos_template_date on todos (template_id, due_date) where template_id is not null;

-- 일기
create table if not exists diaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  photo_url text,
  entry_date date not null,
  entry_time time,
  content text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists diaries_user_date on diaries (user_id, entry_date desc);

-- 월 예산
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  month date not null,
  amount numeric(12,0) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists budgets_user_month on budgets (user_id, month);

-- 홈 메모칸
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  content text,
  updated_at timestamptz default now()
);

-- 월간 집계 뷰
create or replace view v_monthly_summary
with (security_invoker = true) as
select user_id, date_trunc('month', occurred_at) as month,
       'expense' as kind, sum(amount) as total
  from expenses where is_skipped = false group by 1,2
union all
select user_id, date_trunc('month', occurred_at), 'income', sum(amount)
  from incomes group by 1,2
union all
select user_id, date_trunc('month', occurred_at), 'saving', sum(amount)
  from savings group by 1,2;

-- ============================================================
-- 권한(GRANT): 앱 역할이 테이블에 접근할 수 있게
-- (행 단위 보호는 아래 RLS가 담당)
-- ============================================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- ============================================================
-- RLS: 모든 테이블 활성화 + 본인 데이터만
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'categories','payment_methods','recurring_rules','expenses','incomes','savings',
    'books','book_quotes','reading_logs','todo_templates','todos','diaries','budgets','notes'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t
    );
  end loop;
end $$;

-- ============================================================
-- Storage 버킷 (private) + 정책
-- 주의: 프로젝트에 따라 SQL로 storage 정책 생성이 권한 오류가 날 수 있어
-- 실패해도 전체가 롤백되지 않도록 예외 처리로 감쌌다.
-- 아래 NOTICE가 뜨면 대시보드 → Storage → Policies에서 수동으로 만들면 된다.
-- ============================================================
do $$
begin
  insert into storage.buckets (id, name, public) values ('covers','covers', false)
    on conflict (id) do nothing;
  insert into storage.buckets (id, name, public) values ('diary','diary', false)
    on conflict (id) do nothing;
exception when others then
  raise notice 'Storage 버킷 생성 실패 — 대시보드 → Storage에서 covers, diary 버킷(private)을 직접 만들어주세요: %', sqlerrm;
end $$;

do $$
begin
  drop policy if exists "own covers" on storage.objects;
  create policy "own covers" on storage.objects for all
    using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists "own diary" on storage.objects;
  create policy "own diary" on storage.objects for all
    using (bucket_id = 'diary' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'diary' and (storage.foldername(name))[1] = auth.uid()::text);
exception when others then
  raise notice 'Storage 정책 생성 실패 — 대시보드 → Storage → Policies에서 authenticated 사용자의 모든 작업을 허용하는 정책을 covers/diary 버킷에 직접 만들어주세요: %', sqlerrm;
end $$;
