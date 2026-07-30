# 야호(Yaho) 백엔드

과소비를 진단하고, 절약 챌린지로 아낀 돈을 **호남 여행으로 처방**하는 서비스의 백엔드.
2026 호남 IS 해커톤 출품작.

- **Swagger** `http://localhost:3000/docs`
- **API 베이스** `http://localhost:3000/api/v1`
- **API 계약서** [`docs/api-contract.md`](docs/api-contract.md) — 프론트가 화면 순서대로 붙일 수 있게 정리
- **설계 확정서** [`docs/design.md`](docs/design.md) — 스키마·ERD·의사결정 근거

---

## 1. 빠른 시작 (PowerShell)

> 모든 명령은 Windows PowerShell 기준입니다. `&&` 체이닝, `rm -rf` 같은 POSIX 명령은 쓰지 않습니다.

```powershell
npm install
Copy-Item .env.example .env

# AI 여행코스를 쓰려면 .env 에 Claude API 키를 넣습니다 (없어도 서버는 정상 기동합니다)
#   ANTHROPIC_API_KEY=sk-ant-...

npm run db:use:sqlite    # 활성 스키마를 SQLite 로 전환 + prisma generate
npm run db:push          # 테이블 생성
npm run db:seed          # 시드 (27개 자체 검증 통과해야 성공)

npm run start:dev        # http://localhost:3000/docs
```

**한 줄로 처음부터:**

```powershell
npm run demo:offline     # db:use:sqlite → db:push → db:seed → start:dev
```

### 데모 계정

| 용도 | 아이디 | 비밀번호 |
|---|---|---|
| 서비스 로그인 | `demo@yaho.kr` | `yaho1234` |
| 금융기관 연동 | `yaho` | `1234` (6개 기관 공통) |

Swagger 우측 상단 **Authorize** 에 로그인 응답의 `accessToken` 을 넣으면 이후 요청에 자동 적용됩니다.

---

## 2. 요구 환경

| 항목 | 버전 | 비고 |
|---|---|---|
| Node.js | 20 이상 | 개발·검증은 v24.18.0 에서 진행 |
| npm | 9 이상 | |
| PostgreSQL | 선택 | **없어도 됩니다.** 기본은 SQLite |
| Docker | 불필요 | |

Prisma 는 **6.19.3 으로 핀 고정**되어 있습니다. 7.x 는 생성기 교체 등 메이저 브레이킹이 있어 올리지 마세요.

---

## 3. DB 전환 (PostgreSQL ↔ SQLite)

발표 당일 네트워크·DB 장애에 대비해 **명령 한 줄로 전환**됩니다.

```powershell
npm run db:use:sqlite     # 오프라인. 별도 설치 불필요 (기본값)
npm run db:use:postgres   # PostgreSQL
```

전환 스크립트가 하는 일:

1. 대상에 맞는 스키마 준비 — SQLite 는 `prisma/schema.sqlite.prisma` 를 **원본에서 생성**
2. `prisma/.active-schema` 에 활성 스키마 기록 (이후 모든 `db:*` 명령이 이 파일을 따름)
3. **`.env` 의 `DATABASE_URL` 도 함께 맞춰줌** — 스키마만 바꾸고 URL 을 안 바꾸는 실수가 가장 흔한 사고라 스크립트가 대신 처리합니다
4. `prisma generate` 실행

전환 후에는 `npm run db:push` → `npm run db:seed` 를 이어서 실행하세요.

> `prisma/schema.prisma`(PostgreSQL)가 **유일한 저작 원본**입니다.
> `schema.sqlite.prisma` 는 자동 생성 파일이므로 직접 수정하지 마세요.

---

## 4. 발표 당일 시연 순서

### 4-1. 시작 전 점검 (1분)

```powershell
npm run start:dev
```

브라우저에서 `http://localhost:3000/api/v1/health` 를 열어 아래를 확인합니다.

```json
{ "success": true, "data": {
  "status": "ok", "databaseOk": true, "databaseProvider": "sqlite",
  "demoMode": true, "clockOffsetDays": 0
}}
```

- `status: "ok"` 가 아니면 → §6 트러블슈팅
- `clockOffsetDays` 가 0이 아니면 → `POST /demo/reset` 으로 시계 되돌리기

### 4-2. 시연 시나리오

리허설을 몇 번 반복해도 **같은 숫자**가 나옵니다. 시드가 고정 PRNG 라서입니다.

| # | 화면 | 호출 | 보여줄 것 |
|---|---|---|---|
| 0 | — | `POST /demo/reset` | 이전 리허설 흔적 제거 |
| ① | 온보딩 | `POST /auth/login` | accessToken 발급 |
| ② | 연동 | `GET /connections/institutions`<br>`POST /connections` × 4 | 기관 6곳, 150~400ms 지연으로 로딩 연출 |
| ③ | 소비 분석 | `POST /transactions/sync` | **413건 수집, 자동분류 395건, 확인필요 18건** |
| | | `GET /transactions/pending-review` | **18건 → 8개 질문으로 압축** |
| | | `PATCH /transactions/{id}/category` | **1건 선택 → 4건 함께 정리** (`alsoUpdatedCount`) |
| | | `GET /analysis/summary` | 월평균 840,507원, 카테고리 도넛, 정기결제 6종 |
| ④ | 페르소나 | `POST /persona/evaluate` | **"혈당스파이크 취침형"** (또래 대비 1.45배) |
| ⑤ | 처방 선택 | `GET /challenges/plans` | **여행지 5곳 = 챌린지 카드.** 강진 2주 6만 · 고창 4주 20만 · 신안 8주 28만 |
| ⑥ | 목표 배분 | `GET /saving-goals/suggestions?targetAmount=200000`<br>`POST /saving-goals`<br>`POST /challenges` | 자동 배분 → **합계가 목표액과 정확히 일치** → 시작 |
| ⑦ | 진행 | `POST /demo/fast-forward` `{"days":14}` | 시계 점프 |
| | | `POST /demo/simulate-spending` × 2 | **진척률 100% → 60%** 실시간 반응 |
| | | `GET /travel/prescriptions` | **사진 4/6장만 공개** (예고편) |
| ⑧ | 여행 처방 | `POST /demo/fast-forward` `{"days":20}` | **그 자리에서 SUCCEEDED 전환** |
| | | `GET /travel/prescriptions` | **블러 전부 해제**, 여행지 5곳 × 루트 2개 |
| ⑨ | AI 코스 | `POST /travel/destinations/{id}/ai-course` | **Claude 가 페르소나에 맞춰 하루 코스 생성** (15~20초) |
| | | `GET /travel/destinations/{id}/ai-course` | 재조회는 캐시 — 같은 화면을 두 번 열어도 내용 동일 |
| ⑩ | 지도 | `GET /travel/map` | 여행지 5곳 마커 + 해금/잠김 + 경계상자 |
| | | `GET /travel/ai-courses/{id}/map` | 코스 경유지 마커 + 구간 직선거리 |
| ⑪ | 보상 | `POST /challenges/{id}/complete` | 뱃지 3개 + 쿠폰 3장 지급 |
| | | `GET /rewards/badges` | 3/10 획득, 잠긴 칸에 진행도 표시 |

> **⑦의 `simulate-spending` 을 건너뛰지 마세요.**
> 시드 거래는 챌린지 시작 전날까지만 있어서, 아무것도 주입하지 않으면 "지출 0원 = 절약 만점"
> 이 되어 진척률이 곧장 100% 로 갑니다(산술적으로는 맞습니다). 지출을 주입해야
> "진행 중" 화면과 부분 블러가 자연스럽게 나옵니다.

> **⑨ AI 코스는 15~20초 걸립니다.**
> Claude API 왕복 시간입니다. 발표에서 정적으로 기다리기 부담스럽다면 ⑧ 직후에 미리 호출해
> 캐시를 채워 두세요 — 이후 조회는 20ms 안에 끝납니다.
>
> **네트워크가 끊겨도 이 화면은 뜹니다.** API 호출이 실패하면 시드 루트를 재구성한 코스가
> `meta.generatedBy: "FALLBACK"` 으로 내려갑니다. 응답 형태가 완전히 같아서 화면은 그대로 그려집니다.
> 아예 호출을 건너뛰고 싶으면 `.env` 에서 `AI_COURSE_ENABLED=false` 로 두세요 (즉시 폴백, 대기 0초).

### 4-3. 리허설 반복

```
POST /demo/reset
```

연동·거래·목표·챌린지·페르소나·뱃지·쿠폰이 지워지고 가상 시계가 0으로 돌아갑니다.
**가상 금융 DB 와 참조 데이터는 보존**되므로 은행 데이터가 매번 동일합니다. 재시드 불필요.

---

## 5. demo 엔드포인트

`DEMO_MODE=true` 일 때만 등록됩니다. `false` 로 두면 라우트가 **아예 존재하지 않고**(404) Swagger 에도 나오지 않습니다.

| 엔드포인트 | 용도 |
|---|---|
| `POST /demo/reset` | 사용자 진행 상태 초기화 + 시계 0으로 |
| `POST /demo/fast-forward` `{"days":30}` | 가상 시계 앞으로 감기. 누적되며 음수로 되감기 가능 |
| `POST /demo/simulate-spending` | 임의 지출 주입 → 진척률 변화 시연 |

시스템 시각은 건드리지 않습니다. `DemoState.clockOffsetDays` 에 오프셋을 저장하고
앱 전체가 `ClockService.now()` 로만 시간을 읽습니다 (ESLint 로 `Date.now()` 직접 호출 금지).

---

## 6. 발표 당일 트러블슈팅 체크리스트

### 서버가 안 뜬다

| 증상 | 원인 | 해결 |
|---|---|---|
| `환경변수 검증에 실패했습니다` | `.env` 없음/잘못됨 | `Copy-Item .env.example .env` |
| `Cannot find module '@prisma/client'` | 클라이언트 미생성 | `npm run db:use:sqlite` |
| `EADDRINUSE :3000` | 포트 점유 | `Get-Process -Name node \| Stop-Process -Force` 후 재시작 |
| `Unable to open the database file` | dev.db 손상 | `Remove-Item prisma\dev.db` 후 `db:push` → `db:seed` |

### DB 가 이상하다

```powershell
# 1) SQLite 로 확실히 전환
npm run db:use:sqlite
npm run db:push
npm run db:seed          # 27개 검증이 전부 통과해야 정상

# 2) 스키마가 꼬여 push 가 실패하면 (⚠️ 데이터 전부 삭제)
npx prisma db push --force-reset --schema prisma/schema.sqlite.prisma
npm run db:seed
```

### API 응답이 이상하다

| 증상 | 확인 |
|---|---|
| `401 UNAUTHORIZED` | Authorize 에 토큰을 넣었는지. **재시드했다면 다시 로그인**해야 합니다 (user id 가 바뀜) |
| `422 NO_TRANSACTION_DATA` | `POST /transactions/sync` 를 먼저 호출했는지 |
| `422 NO_SAVING_GOAL` | `POST /saving-goals` 를 먼저 호출했는지 |
| `409 CHALLENGE_ALREADY_ACTIVE` | 진행 중 챌린지가 있음. `POST /demo/reset` |
| 진척률이 계속 100% | 챌린지 기간에 지출이 없음. `POST /demo/simulate-spending` |
| 날짜가 미래로 나옴 | `fast-forward` 누적됨. `GET /api/v1/health` 의 `clockOffsetDays` 확인 → `POST /demo/reset` |
| `422 NO_PERSONA` (AI 코스) | `POST /persona/evaluate` 를 먼저 호출했는지 |
| AI 코스가 `FALLBACK` 으로만 나옴 | `meta.fallbackReason` 확인 → 아래 표 |
| AI 코스가 15초 넘게 걸림 | 정상입니다. 미리 호출해 캐시를 채워 두거나 `ANTHROPIC_EFFORT=low` |
| 지도 마커가 비어 있음 | `missingCoordinateCount` 확인. 0이 아니면 `npm run db:seed` 재실행 |

### AI 코스가 폴백으로 내려갈 때

응답의 `meta.fallbackReason` 이 원인을 알려줍니다. **어느 경우든 화면은 정상적으로 그려집니다** —
시드 루트를 재구성한 코스가 같은 형태로 내려가기 때문입니다.

| `fallbackReason` | 뜻 | 조치 |
|---|---|---|
| `DISABLED` | 키가 없거나 `AI_COURSE_ENABLED=false` | `.env` 의 `ANTHROPIC_API_KEY` 확인 |
| `AUTH_FAILED` | 키가 유효하지 않음 | 키 재발급 |
| `OVERLOADED` (529) | Anthropic 쪽 일시 과부하 | **잠시 뒤 다시 호출.** 폴백은 캐시되지 않아 자동 재시도됩니다 |
| `RATE_LIMITED` (429) | 요청 한도 초과 | 잠시 대기 |
| `TIMEOUT` | 제한 시간 초과 | `ANTHROPIC_TIMEOUT_MS` 상향 또는 `ANTHROPIC_EFFORT=low` |
| `MAX_TOKENS` | 응답이 잘림 | 드묾. 재호출 |
| `INVALID_COURSE` | 모델이 후보 밖 장소만 골라 검증 실패 | 드묾. 재호출 |

폴백 결과는 **캐시하지 않습니다.** 일시 장애 한 번에 시드 루트가 영구히 고정되는 것을 막기 위해,
다음 호출에서 조용히 다시 시도합니다. AI 생성에 성공한 코스만 캐시됩니다.

### 최후의 수단 (30초)

```powershell
Get-Process -Name node | Stop-Process -Force
Remove-Item prisma\dev.db -ErrorAction SilentlyContinue
npm run demo:offline
```

---

## 7. 프로젝트 구조

```
src/
  common/          상수·에러코드·응답봉투·필터·인터셉터·가상시계·유틸(money, date-kst, ratio, prng, geo)
  config/          환경변수 스키마 검증 (부팅 시 실패)
  prisma/          PrismaModule, PrismaService
  auth/            JWT accessToken only, 데모 계정
  connections/     기관 연동 (복수 가능)
  financial/       FinancialProviderPort ← MockFinancialProvider
  transactions/    sync + classification/(normalizer, rule-engine, recurring-detector)
  analysis/        summary-calculator
  persona/         persona-calculator (48종)
  saving-goals/
  challenges/      plan-calculator, progress-calculator
  ai/              ClaudeService — Anthropic SDK 래퍼 (여행코스 생성 전용)
  travel/          blur-policy, ai-course/(프롬프트·검증·일정계산), map/(마커·경계상자·구간거리)
  rewards/         뱃지·쿠폰 지급/조회
  demo/            발표 전용 (DEMO_MODE=true 일 때만)
prisma/
  schema.prisma            PostgreSQL — 유일한 저작 원본
  schema.sqlite.prisma     자동 생성 (수정 금지)
  seed/                    도메인별 시드 + 자체 검증
scripts/
  use-db.ts  prisma-cli.ts  schema-paths.ts
```

**순수 계산 로직은 NestJS 의존 없는 순수 함수**로 분리되어 있습니다
(`*-calculator.ts`, `rule-engine.ts`, `blur-policy.ts`, `geo.ts`, `course-builder.ts`).
전부 `now` 를 인자로 받으므로 가상 시계와 무관하게 테스트할 수 있습니다.

**Claude API 를 타는 코드는 `src/ai/` 와 `src/travel/ai-course/` 뿐입니다.** 분류·페르소나·
예산·진척 계산은 전부 규칙 기반이라 AI 없이도 동일하게 동작합니다.

---

## 8. 명령어

| 명령 | 설명 |
|---|---|
| `npm run start:dev` | 개발 서버 (watch) |
| `npm run build` / `start:prod` | 빌드 / 프로덕션 실행 |
| `npm test` | 단위 테스트 (순수 함수만) |
| `npm run lint` | ESLint |
| `npm run db:use:sqlite` / `db:use:postgres` | DB 전환 |
| `npm run db:push` | 스키마 반영 |
| `npm run db:seed` | 시드 (27개 자체 검증 포함) |
| `npm run db:studio` | Prisma Studio (브라우저 GUI) |
| `npm run db:sql` | DB 안을 SQL 로 직접 조회 (프리셋 + 임의 쿼리) |
| `npm run demo:offline` | 전환 → 반영 → 시드 → 서버 기동 |
| `npm run demo:reseed` | 반영 → 시드 |

---

## 9. 설계 원칙

**LLM 을 쓰지 않습니다.** 분류·페르소나·추천이 전부 결정론적 규칙입니다.
전역 키워드 236개 + MCC 40개 + 정기결제 탐지 + 거래유형 가드로 413건 중 **395건(95.6%)을
자동 분류**하고, 나머지는 사용자에게 물어봅니다. 유저가 늘어도 분류 비용은 0원입니다.

**시드는 재현 가능합니다.** 고정 PRNG 를 쓰므로 같은 날 재시드하면 거래 전체가
바이트 단위로 동일합니다 (SHA-256 으로 검증). 리허설과 본 발표의 숫자가 달라지지 않습니다.

**스케줄러가 없습니다.** 챌린지 성공 판정과 쿠폰 만료를 조회 시점에 지연 평가합니다.
발표 환경에서 cron 은 타이밍 리스크라 두지 않았습니다.

**금액은 전부 원 단위 정수입니다.** 비율은 DB 에 basis point 정수로 저장하고
(`100% = 10000`) 응답에서만 소수로 변환합니다. Decimal 을 쓰지 않아 SQLite 와 호환됩니다.

---

## 10. 알려진 제약

- **PostgreSQL 경로는 실구동 검증되지 않았습니다.** 개발 환경에 PostgreSQL 서버가 없어
  스키마 유효성(`prisma validate`)만 확인했습니다. SQLite 는 전 구간 검증 완료.
- **E2E 테스트는 없습니다.** 해커톤 범위상 순수 함수 단위 테스트만 작성했습니다
  (269개). 통합 시나리오는 `docs/api-contract.md` 의 호출 순서로 수동 검증합니다.
- **여행지 좌표는 근사값입니다.** 공개된 장소 위치를 손으로 옮겨 적은 값이라 실제 출입구와
  수십~수백 m 어긋날 수 있습니다. 지도 핀 표시용이며 내비게이션 목적지로는 부정확합니다.
  실서비스로 갈 때는 `prisma/seed/data/travel-geo.data.ts` 한 파일만 지오코딩 API 결과로
  교체하면 됩니다.
- **지도의 거리는 직선거리입니다.** 하버사인으로 계산한 대권 거리이며, 실제 도로 주행거리는
  보통 20~40% 더 깁니다. 이동 시간 추정에는 우회계수 1.3 과 평균 시속 50km/h 를 적용합니다.
- **AI 여행코스는 Claude API 에 의존합니다.** 다만 실패해도 시드 루트 폴백으로 동일한 형태의
  응답이 내려가므로 화면이 비지 않습니다. 분류·페르소나·예산 계산은 AI 를 타지 않습니다.
- **영화·공연·전시는 `교육` 으로 들어갑니다.** 12종 축에 "문화·여가" 자리가 없어
  성격이 가장 가까운 곳에 붙였습니다. 미용실은 `의료+건강+피트니스` 입니다.
  별도 축이 필요하면 알려주세요.

## 11. 소비 카테고리 12종

분류 엔진의 카테고리와 페르소나 축이 **같은 12종**입니다. 변환 레이어가 없습니다.

| 코드 | 라벨 | 대표 키워드 |
|---|---|---|
| `DELIVERY_FOOD` | 배달음식 | 배민 · 쿠팡이츠 · 요기요 (채널 접두 우선) |
| `DINING_OUT` | 외식 | 교촌치킨 · 스시로 · 국밥 · 식당 |
| `CAFE_SNACK` | 카페+간식 | 스타벅스 · 메가커피 · 파리바게뜨 |
| `ALCOHOL_NIGHTLIFE` | 술+유흥 | 역전할머니맥주 · 포차 · 이자카야 · 노래방 |
| `TRANSPORT_CAR` | 교통+자동차 | 티머니 · 카카오T · 주유소 · 하이패스 |
| `SHOPPING` | 쇼핑 | 무신사 · 쿠팡 · 올리브영 · 백화점 |
| `GAME_INAPP` | 게임+인앱 | 구글플레이 · 스팀 · 넥슨 · PC방 |
| `SUBSCRIPTION_OTT` | 구독+OTT | 넷플릭스 · 멜론 · 쿠팡와우 · ChatGPT |
| `CONVENIENCE_STORE` | 편의점 | GS25 · CU · 세븐일레븐 |
| `HEALTH_FITNESS` | 의료+건강+피트니스 | 병원 · 약국 · 헬스 · 미용실 |
| `EDUCATION` | 교육 | 인프런 · 교보문고 · 학원 · CGV(문화) |
| `TRAVEL_STAY` | 여행+숙박 | 야놀자 · 에어비앤비 · 항공사 |
| `FIXED_BILLS` | 고정지출 | 통신·보험·공과금 — **절약 목표·페르소나 축 아님** |
| `UNCLASSIFIED` | 미분류 | 사용자 확인 대기 |
| `EXCLUDED` | 집계 제외 | 수입·계좌간이체·취소 상계분 |

**구독과 고정지출을 나눈 이유**: 넷플릭스는 끊을 수 있지만 통신비는 아닙니다.
구독은 절약 목표 대상이고 고정지출은 아닙니다.

### 절약 슬라이더는 9종 (§12-1)

위 12종은 **분류·집계·페르소나 축**입니다. `GET /saving-goals/suggestions` 의 슬라이더에는
아래 3종을 뺀 **9종만** 내려갑니다.

| 제외 | 이유 |
|---|---|
| `HEALTH_FITNESS` | 병원·약국이 포함된 항목이라 절약을 권하지 않습니다 |
| `EDUCATION` | 자기계발 지출은 줄이라고 권하지 않습니다 |
| `TRAVEL_STAY` | 여행 가려고 여행비를 줄이는 건 앞뒤가 맞지 않습니다 |

제외된 3종도 **소비 내역 탭에서는 계속 보이고 페르소나 산출(4×12=48종)에도 그대로 쓰입니다.**
코드에서는 `SPENDABLE_CATEGORIES`(12) 와 `SAVING_TARGET_CATEGORIES`(9) 를 구분합니다 —
둘을 같은 것으로 착각하면 페르소나 축이 9종으로 줄어드는 사고가 납니다.

키워드 사전은 `prisma/seed/data/merchant-rules.data.ts` (329개), MCC 매핑은
`mcc.data.ts` (54개)에 있습니다. `priority` 가 낮을수록 먼저 평가되며,
`쿠팡이츠`(10) → `쿠팡와우`(10) → `쿠팡`(60) 처럼 부분문자열 충돌을 우선순위로 해결합니다.

---

## 12. AI 여행코스 (Claude API)

페르소나에 맞춘 하루 코스를 Claude 가 짜 줍니다. **여기가 이 백엔드에서 유일하게 LLM 을 쓰는 곳입니다.**

```
POST /api/v1/travel/destinations/{destinationId}/ai-course        생성 (캐시 우선)
POST /api/v1/travel/destinations/{destinationId}/ai-course?refresh=true   강제 재생성
GET  /api/v1/travel/destinations/{destinationId}/ai-course        조회만 (생성 안 함)
```

### 무엇을 AI 에게 맡겼는가

| 항목 | 담당 | 이유 |
|---|---|---|
| 어떤 경유지를 고를지, 어떤 순서로 돌지 | **Claude** | 페르소나 맥락을 반영한 판단이 필요 |
| 제목 · 요약 · 추천 이유 · 경유지 설명 · 팁 | **Claude** | 문장 생성 |
| 금액, 체류 시간, 도착 시각, 총합 | **서버** | 합계가 어긋나면 안 되고, 두 번 열었을 때 숫자가 달라지면 안 됨 |
| 좌표 | **서버** | 시드 데이터가 유일한 출처 |
| 페르소나 산출, 예산 확정 | **서버 (규칙 기반)** | 평가기준 ③ — 핵심 계산은 AI 없이 결정론적 |

경유지는 **해당 여행지에 등록된 시드 경유지 중에서만** 고르게 하고, 목록에 없는 장소가 오면
서버가 걸러냅니다(`course-builder.ts`). 존재하지 않는 식당을 추천하면 좌표를 붙일 수 없어
지도에 못 찍고, 무엇보다 사용자가 헛걸음하기 때문입니다.

### 선행 조건

`POST /persona/evaluate` 로 페르소나가 산출돼 있어야 합니다(없으면 `422 NO_PERSONA`).
페르소나는 카드내역 분석에서 **지출 비중 최다 카테고리 × 승인 건수 최다 시간대**로 정해지며,
이 계산은 AI 를 타지 않습니다.

### 캐시 정책

| 상황 | 동작 |
|---|---|
| AI 생성 성공 | `(사용자 · 여행지 · 페르소나)` 키로 캐시. 재호출 시 그대로 반환 |
| 폴백 | **캐시하지 않음.** 다음 호출에서 자동 재시도 |
| `?refresh=true` | 캐시 무시하고 새로 생성 (행 ID 는 유지) |
| 페르소나가 바뀜 | 캐시 키가 달라져 자동으로 새로 생성 |
| `POST /demo/reset` | 사용자의 AI 코스 전부 삭제 |

폴백을 캐시하지 않는 이유: Anthropic 쪽 일시적 529 한 번에 시드 루트가 영구히 박제되면
그 사용자는 그 여행지에서 두 번 다시 AI 코스를 못 봅니다.

### 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (빈 값) | 비어 있으면 항상 폴백. 서버는 정상 기동 |
| `ANTHROPIC_MODEL` | `claude-opus-5` | |
| `ANTHROPIC_EFFORT` | `medium` | 느리면 `low` 로 |
| `ANTHROPIC_TIMEOUT_MS` | `30000` | SDK 가 1회 재시도하므로 최악 약 2배 |
| `AI_COURSE_ENABLED` | `true` | `false` 면 호출 없이 즉시 폴백 (오프라인 리허설용) |

> **키 관리**: `.env` 는 `.gitignore` 에 있어 커밋되지 않습니다. `.env.example` 에는
> 절대 실제 키를 넣지 마세요.

---

## 13. 지도 (상태바 "지도" 탭)

```
GET /api/v1/travel/map                          여행지 마커 + 경계상자
GET /api/v1/travel/routes/{routeId}/map         시드 루트 경유지 + 구간 거리
GET /api/v1/travel/ai-courses/{courseId}/map    AI 코스 경유지 + 도착시각 + 구간 거리
```

**특정 지도 SDK 에 묶이지 않습니다.** 위경도 · 경계상자 · 중심점 · 구간 거리만 내려주므로
카카오맵 `map.setBounds()`, 네이버맵, Leaflet `fitBounds()` 어디에나 그대로 넣을 수 있습니다.

### 프론트가 알아야 할 것

- `viewport.bounds` 를 fitBounds 에 넣으면 모든 마커가 화면에 들어옵니다.
- `viewport.center` 는 **마커 평균이 아니라 경계상자의 중심**입니다. 마커가 한쪽에 몰려도
  외곽 마커가 화면 밖으로 밀리지 않습니다.
- `stops` 를 `sortOrder` 순으로 이으면 그것이 곧 폴리라인입니다. `legs` 에 구간별 거리가 있습니다.
- 여행지 마커의 `unlocked: false` 는 아직 절약액이 부족한 곳입니다. `shortfallAmount` 로
  "얼마를 더 아끼면 열리는지" 를 보여주세요.
- `missingCoordinateCount` 가 0 이 아니면 좌표 없는 항목이 지도에서 빠졌다는 뜻입니다.
  정상 상태에서는 항상 0 입니다.
- 루트 지도와 AI 코스 지도는 **응답 형태가 같습니다.** 차이는 `kind` 와 `arrivalTime` 유무뿐이라
  같은 컴포넌트로 둘 다 그릴 수 있습니다.

### 거리 표기 주의

`distanceKm` 는 하버사인으로 계산한 **직선거리**입니다. 실제 도로 주행거리는 보통 20~40% 더
깁니다. 화면에도 "직선거리"라고 표기해 주세요. 이동 시간(`travelMinutesFromPrevious`)은
직선거리 × 1.3(우회계수) ÷ 50km/h 로 추정한 값이며 5분 단위로 올림합니다.

좌표는 `prisma/seed/data/travel-geo.data.ts` 한 파일에 모여 있습니다(여행지 5곳 + 경유지 41개).
근사값이며, 지오코딩 API 결과로 이 파일만 교체하면 나머지 코드는 그대로 둬도 됩니다.

---

## 14. DB 안을 직접 들여다보는 방법

sqlite3 CLI 는 Windows 에 기본 설치되어 있지 않으므로, 세 가지 경로를 준비했습니다.

### 방법 1 — `npm run db:sql` (가장 빠름)

```powershell
npm run db:sql                  # 프리셋 목록
npm run db:sql spending         # 지출 내역 최근 20건
npm run db:sql bycategory       # 카테고리별 합계
npm run db:sql "SELECT * FROM app_user"
```

| 프리셋 | 내용 |
|---|---|
| `tables` | 테이블 목록 |
| `spending` | 지출 내역 최근 20건 (분류 결과·근거 포함) |
| `bycategory` | 카테고리별 지출 합계와 월평균 |
| `bymonth` | 월별 지출 추이 |
| `source` | 서비스 DB 거래 ↔ 가상 금융 DB 원본 대조 |
| `users` | 등록된 사용자 |
| `aicourse` | AI 여행코스와 경유지 |

> ⚠️ **SQLite 시각 함수 주의.** Prisma 는 `DateTime` 을 **유닉스 epoch 밀리초 정수**로
> 저장합니다. `date(approvedAt, '+9 hours')` 는 빈 값을 냅니다. 이렇게 쓰세요:
> ```sql
> date(approvedAt/1000, 'unixepoch', '+9 hours')
> ```
> 또 `transaction` 은 SQL 예약어라 큰따옴표로 감싸야 합니다: `FROM "transaction"`

### 방법 2 — Prisma Studio (GUI)

```powershell
npm run db:studio        # http://localhost:5555
```

테이블을 클릭해 훑고 값을 수정할 수 있습니다. SQL 을 모르는 팀원에게 보여줄 때 편합니다.

### 방법 3 — DB 파일을 직접 열기

`prisma/dev.db` 를 [DB Browser for SQLite](https://sqlitebrowser.org/) 나
DBeaver 로 열면 됩니다. 서버가 떠 있어도 읽기는 됩니다.

---

## 15. DB 안의 데이터는 전부 가상입니다

명확히 해둡니다. **실제 소비자의 지출 내역은 이 DB 에 하나도 없습니다.**

| 항목 | 실제 여부 |
|---|---|
| 거래 421건 (금액·날짜·시각) | ❌ 전부 생성됨 — `mulberry32` 고정 PRNG |
| 가맹점명 (배민, GS25, 스타벅스…) | ⚠️ 실존 브랜드명이지만 **거래는 가공** |
| 지점명 (광주상무점, 광주충장로점…) | ❌ 광주 지명을 조합해 만든 것 |
| 사용자 "김하늘" (`demo@yaho.kr`) | ❌ 가공 인물 |
| 카드사·은행 6곳, 계좌 4개 | ❌ `mock_*` 테이블의 가상 기관 |
| 여행지·루트·경유지 | ⚠️ 실존 장소지만 좌표·비용은 근사·추정치 |
| 기방문자 리뷰 21건 | ❌ 전부 작성한 것 |

생성 로직은 `prisma/seed/data/` 에 전부 열려 있습니다
(`transactions.data.ts`, `merchant-rules.data.ts`, `travel.data.ts` …).

**그래서 개인정보 이슈가 없습니다.** 실제 금융 API 를 붙이지 않았고, 붙일 자리는
`FinancialProviderPort` 인터페이스로만 남겨 두었습니다 (`src/financial/`).
실데이터로 가려면 `MockFinancialProvider` 를 실제 구현체로 교체하면 되고,
서비스 코드는 `mock_*` 테이블을 직접 조회하지 않으므로 나머지는 그대로 둬도 됩니다.

---

## 16. Railway 배포

### 준비된 것

| 파일 / 스크립트 | 역할 |
|---|---|
| `railway.json` | 빌드·시작 명령, 헬스체크 경로(`/api/v1/health`) |
| `postinstall` | `prisma generate --schema prisma/schema.prisma` — **PostgreSQL 원본** 기준 |
| `start:railway` | `db:deploy` → `seed:if-empty` → `start:prod` |
| `scripts/seed-if-empty.ts` | **비어 있을 때만** 시드. 재시작마다 데이터가 날아가지 않는다 |

`ts-node` · `typescript` · `prisma` · `npm-run-all` 을 `dependencies` 로 옮겼습니다 —
배포 환경이 devDependencies 를 정리해도 시드가 돌아야 하기 때문입니다.

### 배포 절차

**1. GitHub 에 올리기**

이 폴더는 이미 git 저장소이고 초기 커밋이 되어 있습니다 (`main` 브랜치).
GitHub 에서 **빈 저장소**를 하나 만든 뒤:

```powershell
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

**2. Railway 프로젝트 생성**

1. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**
2. 방금 만든 저장소 선택
3. 첫 배포는 **실패합니다** — 아직 DB 와 환경변수가 없기 때문입니다. 정상입니다.

**3. PostgreSQL 붙이기**

프로젝트 화면에서 **+ Create** → **Database** → **Add PostgreSQL**.
`DATABASE_URL` 이 자동으로 주입되므로 직접 넣지 마세요.

> ⚠️ 서비스에서 `Variables` → `DATABASE_URL` 이 `${{Postgres.DATABASE_URL}}` 로
> 참조되고 있는지 확인하세요. 안 되어 있으면 직접 그 값으로 추가합니다.

**4. 환경변수 설정**

서비스 → **Variables** 에 아래를 넣습니다.

| 변수 | 값 | 비고 |
|---|---|---|
| `JWT_SECRET` | 32자 이상 임의 문자열 | **필수.** 기본값이 없어 없으면 부팅 실패 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | 로컬 `.env` 의 값 |
| `NODE_ENV` | `production` | |
| `DEMO_MODE` | `true` | 발표에 `/demo/*` 가 필요합니다 |
| `SWAGGER_ENABLED` | `true` | 프론트가 문서를 봐야 합니다 |

`PORT` 는 Railway 가 주입하므로 넣지 마세요. 나머지는 기본값으로 동작합니다.

**5. 공개 URL 발급**

서비스 → **Settings** → **Networking** → **Generate Domain**.
`https://<이름>.up.railway.app` 형태의 URL 이 나옵니다.

```
API      https://<도메인>/api/v1
Swagger  https://<도메인>/docs
Health   https://<도메인>/api/v1/health
```

### 배포 후 확인

```powershell
curl https://<도메인>/api/v1/health
```

`databaseProvider` 가 **`postgresql`** 로 나와야 합니다. `sqlite` 면 `DATABASE_URL` 이
안 붙은 것입니다.

로그에서 이 두 줄을 확인하세요:
```
[seed-if-empty] 비어 있습니다 (여행지 0곳 / 사용자 0명). 시드를 실행합니다.
시드 완료
```

두 번째 배포부터는 `이미 채워져 있습니다 … 건너뜁니다.` 가 나오는 것이 정상입니다.

### 참조 데이터를 다시 만들고 싶을 때

Railway 서비스 → **Settings** → **Deploy** 아래의 터미널, 또는 CLI 로:

```powershell
railway run npm run db:seed
```

⚠️ 이건 **모든 테이블을 비우고 다시 채웁니다.** 사용자 진행 상태도 지워집니다.

### 알려진 위험

- **PostgreSQL 경로는 이번 배포가 첫 실전입니다.** 지금까지 스키마 유효성만 확인했고
  런타임은 SQLite 로만 검증했습니다. `db push` 단계에서 실패하면 로그를 보고 대응해야 합니다.
- **무료 크레딧은 $5/월**입니다. 해커톤 기간에는 충분하지만, 계속 띄워둘 거면
  사용량을 확인하세요.
- **AI 코스 첫 호출은 15~25초** 걸립니다. 발표 전에 미리 한 번 호출해 캐시를 채워 두세요.
