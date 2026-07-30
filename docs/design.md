# 야호(Yaho) 백엔드 — 설계서

> 프롬프트 §10 진행순서 1단계 산출물로 시작해, 구현하며 바뀐 결정을 반영해 유지하고 있다.
> 함께 볼 문서: [`README.md`](../README.md), [`prisma/schema.prisma`](../prisma/schema.prisma), [`docs/api-contract.md`](./api-contract.md)

## 구현하며 바뀐 결정 (요약)

아래 항목은 1단계 설계안과 다르다. 각 근거는 본문 해당 절과 코드 주석에 남겼다.

| 항목 | 1단계 설계 | 최종 | 근거 |
|---|---|---|---|
| 페르소나 | 4×3×5 = 60종 (시간대·소비량·카테고리) | **4×12 = 48종** (시간대·카테고리) | `페르소나 완성.xlsx` 확정안. 소비량은 진단 근거로만 유지 |
| 챌린지 예산 환산 | `÷ 4.345 × 주수` | **`× 주수/4`** | 4.345 를 쓰면 예산을 지켜도 목표의 92% 에서 멈춰 달성이 불가능하다. T 가 "4주 기준액"이므로 4주 단위 환산이 맞다 (§7-3) |
| 진척 절약액 | `기간 예산 − 실제 지출` | **`기준 지출(baseline) − 실제 지출`**, 경과 안분 | 명세 수식대로면 예산을 정확히 지켰을 때 절약액이 0 이 된다 (§7-4) |
| 분류 0순위 가드 | 6순위 | **0순위** | 월급 입금이 키워드 사전에 먼저 걸려 지출로 오분류된다 (§1-②) |
| `demo/reset` | 전체 재시드 | **사용자 데이터만 초기화** | mock·참조 데이터는 이미 결정론적이라 재생성이 불필요하고, 유지하는 편이 리허설에 유리 |
| Swagger 플러그인 | 사용 | **미사용** | 프로젝트 경로의 한글 때문에 컴파일 결과에 절대경로가 박혀 런타임 오류. 봉투 스키마와도 충돌 |
| LLM 호출 | **전면 금지** (§11) | **분류 · 페르소나 · 여행코스 3곳 허용** | 추가 요청. 셋 다 실패 시 규칙 기반으로 자동 강등되어 평가기준 ③ 유지. 예산·진척·정산은 산술 그대로 — 아래 §10 참조 |
| 절약 슬라이더 노출 | 12종 전부 | **9종** (의료·건강 / 교육 / 여행·숙박 제외) | 아래 §12-1 |
| 챌린지 목표액 | 사용자가 T 를 정하면 플랜 3개 도출 | **여행지가 목표액과 기간을 정한다** | 화면 흐름 S10→S11→S12 와 일치. 아래 §12-2 |
| 여행 처방전 | 하루 코스 | **1박 2일 (Day1 / Day2)** | 아래 §12-3 |

---

## 0. 환경 실측 결과와 그에 따른 결정

| 항목 | 실측 | 결정 |
|---|---|---|
| Node | **v24.18.0** | 명세는 "Node 20 LTS"지만 NestJS 11 / Prisma 6 모두 Node 24를 지원한다. 다운그레이드하지 않고 `engines: { node: ">=20" }` 로 명시만 한다. |
| npm | 11.16.0 | 그대로 사용 |
| git | 있음 (저장소는 아님) | 2단계에서 `git init` |
| **PostgreSQL** | **미설치** | SQLite 를 실동작 경로로 삼는다 |
| **Docker** | **미설치** | 명세대로 Docker 비필수 유지 |

### 0-1. 스키마 검증 실측 (이미 수행함)

```
prisma validate --schema prisma/schema.prisma            → valid  (provider = postgresql)
prisma validate --schema <생성본>schema.sqlite.prisma      → valid  (provider = sqlite)
```

두 프로바이더 모두에서 스키마가 실제로 통과하는 것을 확인했다. 그 과정에서 **구현에 반영해야 할 함정 2개**를 발견했다.

1. **BOM 금지** — Prisma 파서는 UTF-8 BOM 이 붙은 `.prisma` 파일을 거부한다(`P1012: This line is invalid`). PowerShell 의 `Set-Content -Encoding utf8` 은 BOM 을 붙이므로, `scripts/use-db.ts` 는 반드시 Node 의 `fs.writeFileSync(dst, content, 'utf8')` 로 써야 한다(BOM 없음). 이 때문에라도 전환 스크립트는 PowerShell 이 아니라 Node 여야 한다.
2. **Prisma 버전** — 최신은 7.9.1 이지만 메이저 브레이킹(생성기 교체·ESM)이 있다. 검증에 사용한 **6.19.3 으로 핀 고정**한다. 해커톤에서 메이저 업그레이드 리스크를 질 이유가 없다.

**DB 전략**: `prisma/schema.prisma`(PostgreSQL)를 유일한 저작 원본으로 유지하고, 개발·시드·발표 시연은 전부 SQLite 로 수행한다. Postgres 경로는 스크립트와 문서로 완비하되 실구동 검증은 하지 않는다(로컬에 서버가 없으므로). 발표 당일 시나리오에서도 SQLite 가 기본이라 **네트워크·DB 장애 리스크가 구조적으로 0** 이다 — 평가 기준 ①에 오히려 유리하다.

---

## 1. 결정이 필요한 지점 5가지 (프롬프트 §12-1)

각 항목에 **채택 기본값**을 적어두었다. 별도 지시가 없으면 이대로 진행한다.

### ① 페르소나 축 — **해결됨**: `페르소나 완성.xlsx` 확정안 반영

1단계에서 "축 후보가 5종인지 6종인지" 를 물었고, 이후 기획 확정안이 나와 정리되었다.

**최종: 시간대(4) × 카테고리(12) = 48종.** 소비량 축은 페르소나 코드에서 빠졌다.

```
시간대   NIGHT 22~05 / MORNING 05~11 / LUNCH 11~17 / EVENING 17~22   (기존 경계와 동일)
카테고리 배달음식 · 외식 · 카페+간식 · 술+유흥 · 교통+자동차 · 쇼핑
        게임+인앱 · 구독+OTT · 편의점 · 의료+건강+피트니스 · 교육 · 여행+숙박
```

소비량(LOW/NORMAL/OVER)은 "또래 대비 과소비" 진단의 핵심이라 버리지 않고
`UserPersona.spendingLevel` 과 응답의 `evidence` 에 남겼다.

**해결 완료** — 이후 전역 키워드 사전을 12종 기준으로 재편해, 분류 엔진의 카테고리와
페르소나 축을 **동일한 12종으로 통일**했다. 변환 레이어가 사라졌고 48종 전부 도달 가능하다.

```
분류 카테고리 = SPENDABLE_CATEGORIES(12) + FIXED_BILLS + UNCLASSIFIED + EXCLUDED
페르소나 축   = SPENDABLE_CATEGORIES(12)          ← 같은 상수를 재사용
```

`FIXED_BILLS`(통신·보험·공과금)만 축에서 뺐다. 줄이기 어려운 진짜 고정비라
절약 목표 대상도 아니다. 반대로 구독(`SUBSCRIPTION_OTT`)은 끊을 수 있으므로 축에 넣었다 —
예전 모델에서 구독이 `FIXED` 에 묶여 목표 대상에서 빠졌던 것을 바로잡은 것이다.

실제 시드 데이터로 12종이 전부 분류되는 것을 확인했다
(술+유흥 61,000원 · 구독 59,707원 · 편의점 39,283원 · 교육 30,100원 ·
게임 25,650원 · 여행 16,033원 — 전부 `GLOBAL_RULE` 로 매칭).

**남은 판단** — 영화·공연·전시는 12종에 자리가 없어 `EDUCATION`(문화 소비)으로,
미용실은 `HEALTH_FITNESS` 로 보냈다. 별도 축이 필요하면 알려달라.

### ② 분류 파이프라인에서 거래유형 필터의 위치

§5-2 는 `TRANSFER_IN` / `CANCEL` 필터를 **6순위**에 둔다. 그런데 파이프라인이 "먼저 매칭되면 종료"이므로, 월급 입금(`TRANSFER_IN`, 상호명 `"(주)야호컴퍼니"`)이 **3순위 전역 키워드 사전에 먼저 걸려 지출로 오분류**될 수 있다. 시드에 월급 입금 6건을 심는 이상 반드시 터진다.

**채택 기본값** — `TRANSFER_IN` 과 `CANCEL`(및 상계되는 원거래)은 **0순위 가드**로 선처리해 즉시 `EXCLUDED` 확정. 6순위에는 "본인 명의 계좌 간 이체(`TRANSFER_OUT` + `counterpartKey` 가 본인 계좌)" 판정만 남긴다.
→ 최종 카테고리 결과는 명세와 동일하고, 오분류 경로만 제거된다.

### ③ 시드 데이터의 시간 기준점

금액은 고정 시드 PRNG 로 재현하라고 되어 있으나(§4-3), **날짜까지 고정하면 시간이 지날수록 "최근 6개월" 창을 벗어난다.**

**채택 기본값** — 시드 실행 시각의 **KST 자정을 앵커**로 잡고 모든 거래를 앵커 기준 상대일로 생성한다. 앵커는 `DemoState.seededAt` 에 저장한다. 같은 날 재시드하면 완전히 동일한 데이터가 나오므로 리허설 ↔ 본 발표 일관성이 보장된다.

### ④ `POST /demo/fast-forward` 의 시계 구현

시스템 시각을 바꿀 수 없으므로 가상 시계가 필요하다.

**채택 기본값** — `DemoState.clockOffsetDays` + `ClockService.now()` 를 두고, **애플리케이션 전체에서 `Date.now()` / `new Date()` 직접 호출을 금지**한다(ESLint 규칙으로 강제). 순수 계산 함수는 `now: Date` 를 인자로 받는다. 테스트 용이성도 함께 확보된다.

### ⑤ 챌린지 성공 판정 시점

§6-4 는 `SUCCEEDED` 를 "종료일에 진척 100% 이상"으로 정의한다. 이를 위해 cron 스케줄러를 두면 발표 환경에서 타이밍 리스크가 생긴다.

**채택 기본값** — 백그라운드 스케줄러를 두지 않고 `GET /challenges/current` 와 `POST /challenges/:id/complete` **호출 시점에 지연 평가(lazy evaluation)** 한다. `fast-forward` 직후 화면을 열면 그 자리에서 성공 상태로 전환된다.

---

## 2. 스키마 설계 노트

### 2-1. SQLite 호환 제약 준수 방법

| 금지 대상 | 대체 방법 |
|---|---|
| `enum` | `String` 컬럼 + `src/common/constants/*.ts` 의 union 타입 + `@IsIn([...])` |
| `Json` | 관계 테이블로 정규화 (`ChallengeWeekBudget`, `RouteStop`, `BadgeRule` 등) |
| `String[]` | 관계 테이블 |
| `Decimal` | 금액은 원 단위 `Int`. **비율은 basis point `Int`** (100% = `10000`) |
| `@db.*` | 사용 안 함 |

비율을 bp 로 저장하는 컬럼: `spendingRatioBp`, `reductionRateBp`, `finalProgressBp`, `extinctionRiskIndexBp`.
API 응답에서는 사람이 읽기 좋은 소수(`0.82`)로 변환해 내려주고, 그 변환은 `common/utils/ratio.ts` 한 곳에서만 한다.

### 2-2. `MockTransaction` 에 추가한 2개 필드에 대한 해명

명세 §4-1 은 7개 필드를 명시했다. 여기에 2개를 더했고, **둘 다 실제 명세서에 존재하는 원시 데이터**다.

- `approvalNo` — 승인번호. 취소 거래는 원거래와 동일한 승인번호를 갖는다. 이게 없으면 §5-2 6순위의 "CANCEL 상계분" 판정을 금액·상호명 휴리스틱으로 추정해야 해서 결정론성이 깨진다.
- `counterpartKey` — 이체 상대 식별자(마스킹 계좌번호/예금주). 이게 없으면 "본인 명의 계좌 간 이체" 를 판정할 수 없다.

**카테고리 컬럼은 없다.** 이 원칙만은 예외 없다.

### 2-3. mock 영역과 서비스 영역의 물리적 분리

`Connection.institutionCode`, `LinkedAccount.providerAccountId`, `Transaction.providerTxId` 는 mock 테이블을 **논리 참조**할 뿐 FK 를 걸지 않는다. 실제 마이데이터 API 로 교체될 때 서비스 스키마가 그대로 유지되도록 하기 위함이며, `MockFinancialProvider` → `RealFinancialProvider` 교체가 진짜로 드롭인이 된다.

---

## 3. ERD (텍스트)

```
[가상 금융 — mock_*]                      ┊ FK 없음. FinancialProviderPort 로만 접근 ┊
  MockInstitution ─1:N─ MockUserCredential ─1:N─ MockAccount ─1:N─ MockTransaction
        └────────────────1:N────────────────────────┘

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ 물리적 경계 ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

[사용자 / 연동]
  User ─1:N─ Connection ─1:N─ LinkedAccount ─1:N─ Transaction
                                                       │
[분류]                                                 │ (분류 결과가 이 행에 기록됨)
  UserMerchantRule ──── 2순위 ──────────────────────────┤
  MerchantRule     ──── 3순위 ──────────────────────────┤
  MccMapping       ──── 4순위 ──────────────────────────┘

[분석 / 페르소나]
  SpendingBenchmark ──┐
  Persona(60행) ──1:N─┴─ UserPersona ─N:1─ User

[목표 / 챌린지]
  User ─1:N─ SavingGoal ─1:N─ SavingGoalItem
                 │
                 └─1:N─ Challenge ─1:N─ ChallengeCategoryBudget
                            ├──1:N─ ChallengeWeek ─1:N─ ChallengeWeekBudget
                            └──1:N─ ChallengeCheckIn

[여행]
  TravelDestination ─1:N─ TravelRoute ─1:N─ RouteStop
          ├──1:N─ TravelPhoto  (revealOrder → 블러 정책)
          ├──1:N─ TravelReview
          └──1:N─ Coupon

[보상]
  Badge ─1:N─ BadgeRule
    └──1:N─ UserBadge ─N:1─ User,  (선택) ─N:1─ Challenge
  Coupon ─1:N─ IssuedCoupon ─N:1─ User,  (선택) ─N:1─ Challenge

[운영]
  DemoState (단일 행, id="singleton")
```

### 테이블 요약

| 영역 | 모델 | 비고 |
|---|---|---|
| 가상 금융 | `MockInstitution` `MockUserCredential` `MockAccount` `MockTransaction` | 4개, `mock_` 접두 |
| 사용자/연동 | `User` `Connection` `LinkedAccount` | 3개 |
| 거래/분류 | `Transaction` `UserMerchantRule` `MerchantRule` `MccMapping` | 4개 |
| 분석/페르소나 | `SpendingBenchmark` `Persona` `UserPersona` | 3개 |
| 목표/챌린지 | `SavingGoal` `SavingGoalItem` `Challenge` `ChallengeCategoryBudget` `ChallengeWeek` `ChallengeWeekBudget` `ChallengeCheckIn` | 7개 |
| 여행 | `TravelDestination` `TravelRoute` `RouteStop` `TravelPhoto` `TravelReview` | 5개 |
| 보상 | `Badge` `BadgeRule` `UserBadge` `Coupon` `IssuedCoupon` | 5개 |
| 운영 | `DemoState` | 1개 |
| **합계** | | **32개** |

---

## 4. 상수 (union 타입 — enum 대체)

`src/common/constants/` 에 `as const` 배열 + 파생 union 타입으로 정의하고, DTO 에서는 `@IsIn(CATEGORIES)` 로 검증한다.

```ts
// tx-category.ts — 엑셀 확정안 12종을 분류 엔진 카테고리로 그대로 채택
export const SPENDABLE_CATEGORIES = [
  'DELIVERY_FOOD',     // 배달음식
  'DINING_OUT',        // 외식
  'CAFE_SNACK',        // 카페+간식
  'ALCOHOL_NIGHTLIFE', // 술+유흥
  'TRANSPORT_CAR',     // 교통+자동차
  'SHOPPING',          // 쇼핑
  'GAME_INAPP',        // 게임+인앱
  'SUBSCRIPTION_OTT',  // 구독+OTT
  'CONVENIENCE_STORE', // 편의점
  'HEALTH_FITNESS',    // 의료+건강+피트니스
  'EDUCATION',         // 교육
  'TRAVEL_STAY',       // 여행+숙박
] as const;

export const TX_CATEGORIES = [
  ...SPENDABLE_CATEGORIES,
  'FIXED_BILLS',   // 통신·보험·공과금 — 절약 목표·페르소나 축 아님
  'UNCLASSIFIED',  // 미분류 (사용자 확인 대기)
  'EXCLUDED',      // 집계 제외 (수입, 계좌 간 이체, 취소 상계분)
] as const;

// persona-category.ts — 같은 상수를 재사용한다. 변환 테이블이 없다.
export const PERSONA_CATEGORIES = SPENDABLE_CATEGORIES;
```

| 상수 파일 | 값 |
|---|---|
| `tx-category.ts` | 위 12종 + `FIXED_BILLS` `UNCLASSIFIED` `EXCLUDED` |
| `persona-category.ts` | `SPENDABLE_CATEGORIES` 재수출 (12종) |
| `transaction.ts` | `APPROVAL` `CANCEL` `TRANSFER_OUT` `TRANSFER_IN` / `CARD` `BANK` / `ACTIVE` `REVOKED` / 분류 단계·제외 사유 |
| `persona.ts` | `MORNING` `LUNCH` `EVENING` `NIGHT` / `LOW` `NORMAL` `OVER` / 연령대 |
| `challenge.ts` | `SHORT` `STANDARD` `LONG` / `EASY` `NORMAL` `HARD` / `IN_PROGRESS` `SUCCEEDED` `FAILED` `ABANDONED` |
| `reward.ts` | `RATE` `AMOUNT` / `ISSUED` `USED` `EXPIRED` / `BRONZE` `SILVER` `GOLD` / 뱃지 조건·루트 테마 |

### 4-1. 키워드 사전

전역 키워드 **329개** + MCC 매핑 **54개**. `priority` 가 낮을수록 먼저 평가된다.

부분문자열 충돌은 우선순위로 해결한다. 예를 들어 `쿠팡이츠`(10) → `쿠팡와우`(10) →
`쿠팡`(60) 순이라 "쿠팡이츠)버거킹"은 배달, "쿠팡와우멤버십"은 구독, "쿠팡"은 쇼핑이 된다.
`이마트24`(35)가 `이마트`(60)보다, `스터디카페`(85)가 `카페`(95)보다 먼저 걸리는 것도 같은 원리다.

"CU 광주상무점"은 정규화하면 `cu` 두 글자만 남아 오탐 위험이 커서 우선순위를 98(최하위)로 두었다.

---

## 5. 모듈 의존 관계

```
                         ┌──────────────┐
                         │  AppModule   │
                         └──────┬───────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  ┌───────────┐          ┌────────────┐          ┌────────────┐
  │ ConfigMod │          │ PrismaMod  │          │ CommonMod  │  ← 전역(@Global)
  │ env 검증  │          │ PrismaSvc  │          │ ClockSvc   │
  └───────────┘          └─────┬──────┘          │ 필터·인터셉터│
                               │                 └─────┬──────┘
        ┌──────────────────────┴───────────────────────┘
        │  (아래 모든 도메인 모듈이 Prisma + Common 에 의존)
        │
        ▼
  ┌───────────┐     ┌───────────────┐
  │ AuthModule│     │FinancialModule│  FINANCIAL_PROVIDER 토큰 export
  └─────┬─────┘     │ MockProvider  │
        │           └───────┬───────┘
        │                   │
        │           ┌───────▼─────────┐
        │           │ConnectionsModule│
        │           └───────┬─────────┘
        │                   │
        │           ┌───────▼──────────┐
        │           │TransactionsModule│  ← 분류 엔진(순수함수) 내장
        │           └───────┬──────────┘   ClassificationService export
        │                   │
        │           ┌───────▼────────┐
        │           │ AnalysisModule │  AnalysisService export
        │           └───┬─────────┬──┘
        │               │         │
        │      ┌────────▼──┐  ┌───▼─────────────┐
        │      │PersonaMod │  │SavingGoalsModule│
        │      └───────────┘  └───┬─────────────┘
        │                         │
        │                 ┌───────▼─────────┐
        │                 │ ChallengesModule│  ChallengesService export
        │                 └───┬──────────┬──┘
        │                     │          │
        │           ┌─────────▼──┐   ┌───▼────────┐
        │           │TravelModule│   │RewardsMod  │
        │           └────────────┘   └────────────┘
        │
        └────────────────────► DemoModule (DEMO_MODE=true 일 때만 등록)
                               ↑ 위 모든 모듈을 import 해 리셋/시계/지출주입 수행
```

**의존 방향 규칙**
- 화살표는 항상 아래로만 향한다. 역방향 의존 금지 → 순환 의존이 구조적으로 발생하지 않는다.
- `DemoModule` 만 예외적으로 여러 모듈을 가로질러 import 한다. 발표 전용이며 `DEMO_MODE=false` 면 아예 등록되지 않으므로 프로덕션 그래프를 오염시키지 않는다.
- 도메인 모듈은 서로의 **Service** 만 import 한다. 남의 Prisma 모델을 직접 조회하지 않는다.

---

## 6. 순수 계산 함수 배치 (NestJS 비의존)

DI 컨테이너 없이 import 만으로 테스트 가능해야 한다. 모든 함수는 `now: Date` 를 인자로 받는다.

| 파일 | 시그니처 요약 | 테스트 |
|---|---|---|
| `common/utils/date-kst.ts` | `kstHour` `kstMonthKey` `startOfKstDay` `lastNCompleteMonths` `toKstIso` | (간접) |
| `common/utils/money.ts` | `splitEvenlyWithRemainderLast(total, buckets): number[]` | ✔ |
| `transactions/classification/normalizer.ts` | `normalizeMerchantName(raw): string` | ✔ |
| `transactions/classification/rule-engine.ts` | `classify(tx, ctx): ClassificationResult` | ✔ |
| `transactions/classification/recurring-detector.ts` | `detectRecurring(txs): RecurringGroup[]` | ✔ |
| `analysis/summary-calculator.ts` | `buildSummary(txs, now): AnalysisSummary` | ✔ |
| `persona/persona-calculator.ts` | `evaluatePersona(summary, benchmark): PersonaAxes` | ✔ |
| `challenges/plan-calculator.ts` | `buildPlans(goal, summary, now): PlanCandidate[]` | ✔ |
| `challenges/progress-calculator.ts` | `calcProgress(challenge, txs, now): Progress` | ✔ |
| `travel/blur-policy.ts` | `applyBlur(photos, progressRate): PhotoView[]` | (간접) |

---

## 7. 핵심 계산 규칙 확정 (§6 해석)

### 7-1. 기준 지표
- 기준 기간 = `now` 기준 **직전 6개 완결 월** (KST). 데이터가 적으면 존재하는 `n` 개월.
- `monthlyAvgByCategory[c] = Σ(해당 월들의 c 지출) / n`, `EXCLUDED` 전면 제외.
- 진행 중인 부분 월은 **평균 계산에서 제외**, **챌린지 진척 계산에는 포함**.

### 7-2. 페르소나
- 시간대 축: 승인 **건수** 최다 구간 (KST). `MORNING` 05–10:59 / `LUNCH` 11–16:59 / `EVENING` 17–21:59 / `NIGHT` 22–04:59
- 소비량 축: `ratio = 월평균 총지출 / SpendingBenchmark(ageBand, "TOTAL")`
  `LOW < 0.80` / `NORMAL 0.80 ≤ r ≤ 1.20` / `OVER > 1.20` — **경계값 정확히 0.80·1.20 은 `NORMAL`** (부등호 방향을 테스트로 고정)
- 카테고리 축: `PERSONA_CATEGORIES` 중 월평균 최다. **동점이면 배열 선언 순서가 앞선 것**을 택한다(결정론성 확보).

### 7-3. 챌린지 플랜
| 플랜 | 기간 | 목표 절약액 |
|---|---|---|
| `SHORT` | 2주 | `round(T × 0.5)` |
| `STANDARD` | 4주 | `T` |
| `LONG` | 8주 | `T × 2` |

- 예상 지출 = `round(월평균 총지출 × 주수 / 4.345)`
- `절감률 = 목표액 / 예상지출` → `< 10% EASY` / `10~25% NORMAL` / `> 25% HARD` (경계는 `NORMAL` 포함)
- 주차별 예산: 카테고리별 기간 예산 = `round((월평균 - 절약목표) ÷ 4.345 × 주수)` → `splitEvenlyWithRemainderLast` 로 주 단위 균등 배분, **잔액은 마지막 주**. 합계 일치를 단위 테스트로 고정.
- 목표액 > 해당 카테고리 월평균 → `400 SAVING_GOAL_EXCEEDS_AVERAGE`, `error.details` 에 문제 카테고리 배열 명시.

### 7-4. 진척
- `현재 절약액 = Σ(카테고리 기간예산 - 카테고리 실지출)`, **음수 카테고리는 음수 그대로 합산**
- `progressRate = clamp(현재 절약액 / 목표 절약액, 0, 1)`

### 7-5. 여행 블러
- `revealedCount = ceil(progressRate × 전체 장수)`, `progressRate ≥ 1` 이면 전부 공개
- 이미지 URL 은 **항상** 내려주고 `blurred` 플래그로 프론트가 처리

---

## 8. 시드 계획 (3단계에서 구현)

| 시드 파일 | 내용 |
|---|---|
| `institutions.ts` | 기관 6개(신한·KB국민·현대카드 / 카카오뱅크·토스뱅크·NH농협), 자격증명 1세트, 계좌 4개 |
| `transactions.ts` | mulberry32 고정 시드 PRNG, KST 자정 앵커, 6개월 × 월 55~75건 = **350~450건** |
| `merchant-rules.ts` | 전역 키워드 ~200행 + MCC 매핑 ~40행 |
| `personas.ts` | 60행 (템플릿 조합 생성) |
| `travel.ts` | 강진·보성·고흥·고창·신안 5곳 × (루트 2 + 사진 6 + 리뷰 3~5) + 쿠폰 |
| `badges.ts` | 뱃지 8~10종 + BadgeRule |

**시드 말미 자체 검증 assert** — 아래를 만족하지 못하면 시드가 실패하도록 한다. 발표 품질을 코드로 고정하는 장치다.

```
총 거래 350~450건 / 배달 월평균 ≥ 150,000원 / 정기결제 3~4건 (매월 동일일·동일액)
분류불가 12~20건 / CANCEL 2~3건(원거래 존재) / TRANSFER_IN 월급 6건
```

**데모 계정**: 광주광역시 거주 20대 후반 직장인 (`ageBand: "20S_LATE"`, `regionCode: "29"`).

---

## 9. 다음 단계

승인되면 2단계(스캐폴딩 + 공통 레이어)부터 9단계(demo 모듈)까지 중단 없이 진행하고, 각 단계 완료 시 **변경 파일 목록 · PowerShell 실행 명령 · 검증용 Swagger 요청 예시**를 짧게 보고한다.

---

## 10. Claude API 연동 — 경계선 (추가 요청 1 · 3)

프롬프트 §11 은 "LLM / 외부 AI API 호출" 을 금지 항목으로 두었고, 평가기준 ③ 은
"핵심 계산 로직이 AI 없이 결정론적으로 동작하는가" 다.

추가 요청으로 **거래 분류 · 페르소나 매칭 · 여행코스 생성** 세 곳에 Claude 를 쓰기로 했다.
평가기준 ③ 과 충돌하지 않는 방식은 하나뿐이다 — **AI 를 주 경로로 쓰되, 실패하면 규칙
기반으로 자동 강등되는 이중 경로**로 만드는 것이다. 그래야 "AI 없이도 동작한다"가
말이 아니라 실행 가능한 상태로 남는다.

> **처음 설계에서 무엇이 바뀌었나**
> 1단계에서는 분류·페르소나를 규칙 전용으로 두고 여행코스에만 AI 를 붙였다. 근거는
> "호출이 거래 건수에 비례한다"였다. 이 우려는 **가맹점 단위 배치**로 해소됐다 —
> 거래 424건이 아니라 정규화 가맹점 70여 곳을 묻고, 20곳씩 묶어 호출 4번으로 끝난다.
> 거래가 10배 늘어도 가맹점 수는 그만큼 늘지 않으므로 호출 수는 거의 그대로다.

### 10-1. 경계선

| 기능 | AI | 실패 시 | 근거 |
|---|---|---|---|
| 거래 분류 — 가맹점 카테고리 | ✅ | 키워드 329 + MCC 54 + 정기결제 탐지 | 규칙 사전이 못 잡는 지역 상호·신규 브랜드를 잡는다 |
| 거래 분류 — 거래유형 가드 | ❌ | — | 수입·취소는 판단이 아니라 **사실**이다 |
| 거래 분류 — 정기결제 탐지 | ❌ | — | "매월 같은 날 ±5% 3회 이상" 주기 계산 |
| 페르소나 — 두 축 선정 | ✅ | 각 축의 1위 | 1·2위가 근소할 때 규칙은 그 애매함을 못 본다 |
| 페르소나 — 이름·태그라인 | ❌ | — | 카탈로그 48행. 모델이 지으면 존재하지 않는 페르소나가 나온다 |
| 페르소나 — 소비량 축, 또래 대비 배수 | ❌ | — | 나눗셈 하나. 판단할 여지가 없다 |
| 여행코스 — 장소 선택·순서·문구 | ✅ | 시드 루트 재구성 | 페르소나 맥락을 반영한 판단 |
| 여행코스 — 금액·시간·좌표 | ❌ | — | 합계가 어긋나면 안 되고, 두 번 열었을 때 달라지면 안 된다 |
| 절약 목표 · 주차 예산 · 진척률 | ❌ | — | 금액 계산. 1원이라도 어긋나면 안 된다 |
| 여행지 후보 선정 · 블러 정책 | ❌ | — | 금액 비교와 산술 |

한 줄로 줄이면 이렇다. **판단이 필요한 곳에는 AI 를, 검산이 필요한 곳에는 산술을 쓴다.**

### 10-2. 분류 파이프라인에서 AI 를 3순위에 둔 이유

```
0. 거래유형 가드   ← AI 보다 앞
1. 정규화
2. 사용자 개인 규칙 ← AI 보다 앞
3. ★ AI 판정
4~8. 키워드 사전 → MCC → 정기결제 → 계좌간이체 → 미분류
```

두 가지만 AI 보다 앞에 둔다.

- **0순위 거래유형 가드** — `TRANSFER_IN`(월급) 을 모델에게 물어볼 이유가 없다. 물어보면
  "(주)야호컴퍼니"를 어딘가의 지출로 만들 위험만 생긴다. 이건 판단이 아니라 사실이다.
- **2순위 사용자 규칙** — 사용자가 화면에서 직접 고친 결과다. 여기서 AI 가 이기면
  "고쳤는데 다음 동기화에 원복됐다"가 된다. 사람이 한 말이 모델보다 위다.

나머지 실질 판정은 전부 AI 가 먼저 가져간다. 실측으로 424건 중 375건이 AI 판정이고
키워드 사전은 10건만 남는다.

**모델이 물러설 수 있게 했다.** `confidence: LOW` 이거나 `UNCLASSIFIED` 로 답한 가맹점은
채택하지 않고 규칙 엔진으로 넘긴다. 억지 추측보다 "모르겠다"가 낫고, 사용자에게 직접
물어보는 화면(`pending-review`)이 이미 있기 때문이다.

### 10-3. 왜 거래가 아니라 가맹점 단위인가

비용도 이유지만, 더 중요한 것은 **일관성**이다.

건별로 물으면 같은 가맹점이 달마다 다른 카테고리로 갈라질 수 있다. "배민)김밥천국"이
어떤 달은 배달음식, 어떤 달은 외식이 되면 카테고리별 월평균이 흔들리고, 그 위에 얹힌
**절약 목표 슬라이더 상한과 챌린지 진척률까지** 같이 흔들린다. 사용자 입장에서는
"어제는 12만원까지 줄일 수 있다더니 오늘은 9만원"이 된다.

가맹점 단위로 한 번만 판정하면 그런 일이 없다. 부수적으로 호출 수도 424 → 4로 줄어든다.

### 10-4. 배치를 동시에 던지는 이유

처음에는 분당 한도가 걱정돼 순차로 돌렸는데, 실측해 보니 그쪽이 더 위험했다.

| | 순차 | 동시 |
|---|---|---|
| 배치 4개 × 15초 | 60초 | **15초** |
| 한 배치가 타임아웃 | 뒤 배치가 줄줄이 밀림 | 나머지는 영향 없음 |

첫 실측에서 배치 크기 60으로 두었다가 30초 타임아웃에 걸렸고, SDK 재시도까지 겹쳐
동기화 한 번이 **74초**가 됐다. 배치를 20으로 줄이고 동시 호출로 바꾸자 **13.9초**가 됐다.

배치를 크게 묶을 이유도 없다. 벽시계 시간은 가장 느린 배치 하나로 결정되므로 묶어도
빨라지지 않고, 오히려 그 배치가 실패했을 때 잃는 가맹점만 많아진다.

### 10-5. 페르소나 — 모델이 이름을 짓지 못하게 한 이유

모델은 **축 두 개만** 고른다. 조합을 코드(`{시간대}_{카테고리}`)로 바꿔 `Persona` 카탈로그
48행에서 문구를 꺼내는 것은 서버다. 이렇게 해야 세 가지가 보장된다.

1. 48종 밖의 존재하지 않는 페르소나가 나오지 않는다.
2. 기획이 문구를 바꿔도 코드를 안 고쳐도 된다 (§6-2 원칙 유지).
3. 같은 사람이 두 번 조회했을 때 이름이 달라지지 않는다.

축이 열거값 밖이면 **통째로 거부**한다. 반쪽만 살려 쓰면 규칙 결과와 AI 결과가 섞인
정체불명의 페르소나가 나오기 때문이다. 반면 문구가 비는 것은 실패로 보지 않는다 —
축만 멀쩡하면 페르소나는 성립하고 카탈로그 기본 문구가 화면을 채운다.

실측에서 AI 가 규칙과 다른 판단을 냈다.

> 규칙: `EVENING_SHOPPING` (쇼핑 25.0%로 금액 1위)
> AI: `EVENING_DELIVERY_FOOD` — *"쇼핑이 금액 1위지만 29건에 그치고, 배달음식은 18.9%에
> 47건으로 반복 빈도가 훨씬 높습니다"*

금액이 아니라 **습관**을 집었다. 규칙만으로는 나올 수 없는 결론이고, 이것이 페르소나에
AI 를 붙인 이유 그 자체다. 갈렸을 때는 `ai.divergedFromRule` 과 `ai.ruleBaselineCode` 로
양쪽을 다 노출해 심사에서 비교할 수 있게 했다.

### 10-6. 기능별 스위치를 따로 둔 이유

`AI_COURSE_ENABLED` / `AI_CLASSIFY_ENABLED` / `AI_PERSONA_ENABLED` 셋은 독립이다.
`ClaudeService.available` 은 **키가 있는가만** 보고, "이 기능에 AI 를 쓸 것인가"는
각 도메인 서비스가 자기 플래그로 판단한다.

하나로 묶으면 "여행코스만 끄고 싶은데 분류까지 죽는" 상황이 생기고, 그걸 피하려고
키를 지우면 세 기능이 다 죽는다. 셋 다 `false` 면 키가 있어도 호출이 0회인 완전 오프라인
모드가 되어, 발표 직전 리허설에서 API 사용량을 쓰지 않고 전 구간을 돌릴 수 있다.

실측 대비:

| | AI 켬 | AI 끔 |
|---|---|---|
| 동기화 (424건) | 13.9초 · AI 375건 | 1.1초 · 규칙 405건 |
| 페르소나 | 6.7초 · 개인화 문구 있음 | 0.05초 · 카탈로그 문구만 |
| 자동 분류율 | 95.5% | 95.5% |
| 응답 형태 | 동일 | 동일 |

### 10-7. AI 가 숫자를 쓰지 못하게 한 이유

모델에게는 **장소 선택 · 순서 · 문장**만 맡기고, 금액 · 체류시간 · 도착시각 · 총합은 전부
서버가 시드 데이터로 계산한다. 모델이 숫자를 쓰게 두면 두 가지가 깨진다.

1. **합계가 안 맞는다.** 총액이 경유지 금액의 합과 어긋나도 아무도 모른다.
2. **재현되지 않는다.** 같은 화면을 두 번 열면 숫자가 달라진다.

도착 시각도 모델이 아니라 서버가 계산한다 — 시작 시각에 체류 시간과 **좌표에서 유도한 이동
시간**을 누적한다. 그 결과 일정과 지도가 같은 데이터에서 나오므로 서로 어긋날 수 없다.

### 10-8. 환각 방어

경유지는 해당 여행지의 시드 `RouteStop` 중에서만 고르게 하고, 응답을 서버가 대조해
목록에 없는 이름은 버린다(`course-builder.ts`의 `validateAiCourse`). 남은 경유지가 3곳
미만이면 폴백으로 전환한다.

structured outputs 가 보장하는 것은 **형태**지 **내용**이 아니다. 스키마를 통과한 응답에도
존재하지 않는 식당이 들어올 수 있고, 그러면 좌표를 붙일 수 없어 지도에 못 찍는다.
무엇보다 사용자가 헛걸음한다.

### 10-9. 폴백 정책

Claude 호출이 실패하면(키 없음 · 타임아웃 · 429 · 529 · 거절 · 검증 실패) 시드 루트를
재구성해 **완전히 같은 응답 형태**로 내려준다. 프론트는 분기 없이 `meta.generatedBy` 로
배지만 다르게 붙인다. 폴백 루트 선택도 페르소나 카테고리 → 선호 테마 매핑으로 결정론적이다.

**폴백은 캐시하지 않는다.** 처음에는 결과를 무조건 캐시했는데, 검증 중 Anthropic 쪽 529 를
한 번 맞자 그 조합이 영구히 시드 루트로 고정되는 것을 발견했다. 폴백은 "이번엔 실패했으니
일단 이거라도" 이지 "이 조합의 정답" 이 아니므로, 다음 호출에서 조용히 다시 시도한다.

행 ID 는 upsert 로 고정한다. 삭제 후 재생성하면 재시도할 때마다 새 cuid 가 발급돼,
앞서 응답으로 내려준 courseId 로 지도를 열 수 없게 된다 (검증에서 실제로 잡힌 결함이다).

---

## 11. 지도 (추가 요청 2)

### 11-1. 지도 SDK 를 서버가 고르지 않는다

응답은 위경도 · 경계상자 · 중심점 · 구간 거리뿐이다. 타일 좌표나 특정 SDK 의 투영법을
다루지 않으므로 카카오맵 · 네이버맵 · Leaflet · Mapbox 어디에나 그대로 들어간다.
프론트가 지도 라이브러리를 바꿔도 백엔드는 손대지 않아도 된다.

### 11-2. 중심점은 평균이 아니라 경계의 중심

마커 좌표의 평균을 쓰면 한 지역에 마커가 몰렸을 때 중심이 그쪽으로 끌려가 외곽 마커가
화면 밖으로 밀린다. 경계상자의 중심은 항상 모든 마커를 대칭으로 감싼다.
`geo.spec.ts` 에 이 차이를 드러내는 테스트를 두었다.

### 11-3. 좌표를 별도 파일로 분리한 이유

`prisma/seed/data/travel-geo.data.ts` 에 여행지 5곳 + 경유지 41개의 좌표를 모았다.
경유지 정의(`travel.data.ts`)에 좌표를 섞으면 한 줄이 너무 길어지고, "이 숫자는 근사값"
이라는 맥락이 41군데로 흩어진다. 실서비스에서 지오코딩 API 결과로 교체할 때도 이 파일
하나만 갈아끼우면 된다.

시드에 `assertGeoCoverage` 를 두어 좌표 표와 여행지 데이터가 어긋나면 **시드가 실패**하게
했다. 발표 당일 지도에 핀 하나가 조용히 비는 것보다 시드 단계에서 터지는 편이 낫다.
호남권 경계를 벗어난 좌표도 함께 잡는다 (위경도 순서를 바꿔 적는 실수 방어).

### 11-4. 거리와 시간은 추정치임을 응답에 명시

`distanceKm` 는 하버사인 **직선거리**다. 도로 주행거리는 보통 20~40% 더 길다.
이동 시간은 직선거리 × 1.3(우회계수) ÷ 50km/h 로 추정하고 5분 단위로 올림하며, 주차·도보를
감안해 최소 10분을 준다. 평균 시속 50km/h 는 호남권 여행지 대부분이 왕복 2차선 국도라는
점을 반영한 값이다 (고속도로 기준 100km/h 는 현실과 멀다).

Swagger description 과 DTO 주석에 "직선거리" 를 명시해 프론트가 화면에 그대로 표기하도록 했다.

### 11-5. 총 소요시간에 이동 시간을 포함한다

체류 시간만 더하면 "5시간 코스" 라고 안내하고 실제로는 7시간 걸린다.
`buildSchedule` 이 체류 + 이동을 함께 누적하며, 단위 테스트로 고정했다.

---

## 12. 화면 인벤토리 대조로 확정한 3건 (야호-screen-inventory.md)

화면 문서(`야호-screen-inventory.md`)와 백엔드를 대조해 드러난 쟁점 3건을 확정했다.
셋 다 백엔드 구조를 바꾸므로 근거를 남긴다.

### 12-1. 절약 슬라이더는 12종이 아니라 9종

**분류·집계·페르소나 축은 12종 그대로다.** 바뀌는 것은 S12 슬라이더에 무엇을 노출하느냐뿐이다.

| 축 | 종수 | 비고 |
|---|---|---|
| 거래 분류 (`TX_CATEGORIES`) | 12 + 3 | FIXED_BILLS / UNCLASSIFIED / EXCLUDED 포함 |
| 페르소나 카테고리 (`PERSONA_CATEGORIES`) | 12 | 4 × 12 = 48종. 변경 없음 |
| 소비 내역 탭 집계 | 12 | 변경 없음 |
| **절약 슬라이더 (S12)** | **9** | ← 여기만 바뀐다 |

제외하는 3종과 이유:

| 제외 | 이유 |
|---|---|
| `HEALTH_FITNESS` (의료·건강·피트니스) | 병원·약국이 들어 있다. "병원비를 줄여 여행 가세요" 는 해선 안 되는 제안이다 |
| `EDUCATION` (교육) | 자기계발 지출을 줄이라고 권하는 서비스가 되어 버린다 |
| `TRAVEL_STAY` (여행·숙박) | 여행 가려고 여행비를 줄이는 건 앞뒤가 안 맞는다 |

제외해도 슬라이더 상한 합계는 **월 766,473원**이라(데모 시드 기준) 최대 목표액 280,000원을
배분하는 데 충분하다. 제외한 3종은 소비 내역 탭에서 계속 보이고, 페르소나 산출에도 그대로 쓰인다.

> 구현 위치: `SPENDABLE_CATEGORIES` 는 그대로 두고 `SAVING_TARGET_CATEGORIES` 를 새로 둔다.
> 두 상수를 같은 것으로 착각하면 페르소나 축이 9종으로 줄어드는 사고가 난다.

### 12-2. 목표액은 사용자가 아니라 여행지가 정한다

**방향이 뒤집힌다.**

```
[기존]  S12 슬라이더로 T 확정  →  T × 주수/4 로 플랜 3개 산출  →  갈 수 있는 여행지 표시
[확정]  S10 여행지 선택 = 목표액·기간 확정  →  S11 상세  →  S12 그 금액을 카테고리로 배분
```

화면 흐름(S10 → S11 → S12)이 이미 후자다. 전자를 유지하면 화면 순서를 뒤집어야 한다.
또 "강진 60,000원" 처럼 **여행지마다 목표액이 붙어 있는 카드**가 S10 의 핵심 UI라,
목표액이 사용자 입력에 따라 매번 달라지면 그 카드를 그릴 수 없다.

따라서 `TravelDestination` 이 `challengeWeeks` 와 `targetSavingAmount` 를 갖는다.
기존 `minBudgetAmount`("이 여행지에 가려면 최소 이 돈")와 개념이 겹치므로 **하나로 합친다** —
목표액이 곧 여행 경비이고, S18 정산 요약의 "예상 여행 경비"와 같은 값이어야 서사가 맞다.

`SavingGoal` 은 없어지지 않는다. 역할이 "목표액 결정"에서 **"주어진 목표액의 카테고리별 배분"**
으로 바뀔 뿐이다. `SAVING_GOAL_EXCEEDS_AVERAGE` 검증(카테고리별 목표 ≤ 그 카테고리 월평균)도
그대로 살아 있어야 한다 — 배분 자체가 비현실적인 것은 여전히 막아야 하기 때문이다.

### 12-3. 여행 처방전은 1박 2일

`RouteStop` 과 `AiTravelCourseStop` 에 `dayNumber`(1 | 2)를 둔다. 함께 필요한 것:

| 필요한 것 | 두는 곳 |
|---|---|
| 광주 출발 편도 교통비 · 소요시간 | `TravelDestination.oneWayFareAmount` / `travelMinutesFromGwangju` |
| 숙소 | 기존 `stopType: 'STAY'` 활용, Day1 마지막에 배치 |
| 제휴 할인율 | `RouteStop.discountRateBp` (15% = 1500. Decimal 금지) + `partnerName` |
| 정산 요약 (아낀 돈 / 교통비 / 할인 / 예상 경비) | 응답에서 **서버가 계산**. AI 가 쓰지 않는다 |

AI 코스도 Day1/Day2 로 나눠 생성하도록 프롬프트·출력 스키마·검증·일정 계산을 고친다.
금액을 서버가 계산하는 원칙(§10-2)은 그대로다 — 할인 적용도 서버가 한다.
