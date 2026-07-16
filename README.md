# 마이데이 — 개인 라이프 로그

1인용 개인 기록 웹앱(PWA). **홈 / 소비 / 취미(독서) / 할일 / 일기** 5개 탭.

- React + Vite + TypeScript + TailwindCSS
- TanStack Query + Zustand
- Supabase (Postgres + Auth + Storage)
- Recharts · Framer Motion
- HashRouter (`/#/expense`) — GitHub Pages 대응

## 최초 설정 (한 번만)

### 1. Supabase 스키마

Supabase 대시보드 → **SQL Editor** → [`supabase/migration.sql`](supabase/migration.sql) 내용 전체를 붙여넣고 실행.
테이블 14개 + RLS 정책 + Storage 버킷(`covers`, `diary`)이 만들어집니다.

### 2. Auth 사용자

대시보드 → **Authentication → Users → Add user**로 본인 계정(이메일+비밀번호)을 만들거나,
앱 로그인 화면에서 처음 입력한 이메일/비밀번호로 자동 가입됩니다.
(**Authentication → Sign In / Up**에서 "Confirm email"을 끄면 바로 로그인 가능)

### 3. anon key

- **GitHub Pages 배포용**: 저장소 → Settings → Secrets and variables → Actions →
  `VITE_SUPABASE_ANON_KEY` 시크릿에 anon public key를 등록.
- 시크릿 없이 배포해도 동작합니다 — 첫 접속 시 anon key 입력 화면이 뜨고 localStorage에 저장됩니다.
- 로컬 개발용: `.env.local`에 `VITE_SUPABASE_ANON_KEY=...`

### 4. GitHub Pages

저장소 → Settings → Pages → Source를 **GitHub Actions**로 설정.
`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 자동 배포합니다.
주소: `https://<계정>.github.io/myday/`

> 저장소 이름이 `myday`가 아니면 `vite.config.ts`의 `base`와
> `public/manifest.webmanifest`의 `start_url`/`scope`를 함께 바꿔주세요.

### 5. 키프얼라이브

`.github/workflows/keepalive.yml`이 3일마다 가벼운 SELECT를 날려
무료 티어 7일 미접속 정지를 방지합니다. (3번의 시크릿 필요)

## 로컬 개발

```bash
npm install
npm run dev
```

## 주요 구현 노트

- **반복 실체화**: 앱 시작 시 `ensureRecurrences()`가 반복 할일/고정지출을 60일치 미리 생성.
  인스턴스 삭제는 `is_skipped=true` 소프트 처리(재생성 방지), 템플릿 수정은 미래 인스턴스만 갱신.
- **이미지**: 업로드 시 1600px/webp 0.8 리사이즈 + 320px 썸네일 두 벌 생성
  (무료 플랜의 Image Transformation 미지원 대응). 경로만 DB에 저장, 서명 URL 1시간 캐시.
- **책 표지**: 직접 업로드 또는 외부 URL — `http`로 시작하면 그대로, 아니면 Storage 서명 URL.
- **할일 인터랙션**: 카드 탭=완료 토글, 길게(400ms) 눌러 집기 → 드래그 또는 사분면/날짜 탭으로 이동,
  왼쪽 스와이프 → 삭제/반복 수정 메뉴.
- **카테고리/결제수단**: 삭제 금지, 보관(archive)만. 순서는 ▲▼ 버튼으로 변경.
