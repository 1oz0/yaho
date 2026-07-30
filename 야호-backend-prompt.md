# 야호 백엔드 개발 프롬프트

## 0. 역할과 목표

너는 이 프로젝트의 **백엔드 리드 개발자**다.
'갈랑가(Galangga)'는 2026 호남 IS 해커톤 출품작으로, 사용자의 과소비를 진단하고 절약 챌린지를 통해 아낀 돈으로 **호남 지역 여행을 "처방"**하는 서비스다.

지금 해야 할 일은 **백엔드 전체를 0부터 설계하고 구현**하는 것이다.
프론트엔드는 현재 디자인 중이므로 **아직 연결하지 않는다.** 대신 프론트가 붙는 순간 바로 쓸 수 있도록 **API 계약(Contract)을 먼저 확정하고, Swagger로 문서화**하는 것이 최우선 목표다.

평가 기준은 다음 세 가지다.
1. **발표 당일 무조건 돌아가는가** (네트워크 장애·DB 장애 대비)
2. **프론트가 추측 없이 붙일 수 있는가** (Swagger 문서와 응답 스키마의 완결성)
3. **핵심 계산 로직이 AI 없이 결정론적으로 동작하는가** (비용 문제로 LLM 의존도를 최소화하는 것이 심사 대응 포인트)

---

## 1. 기술 스택 (변경 금지)

| 항목 | 선택 |
|---|---|
| 런타임/언어 | Node.js 20 LTS + TypeScript (strict) |
| 프레임워크 | NestJS |
| ORM/DB | Prisma + PostgreSQL (**SQLite 폴백 필수**) |
| 검증 | class-validator + class-transformer (전역 ValidationPipe) |
| 인증 | JWT accessToken only (refresh 없음), 데모 시드 계정 1개 |
| 문서 | @nestjs/swagger, `/docs`에서 확인 |
| 테스트 | Jest (핵심 도메인 로직 단위 테스트만) |
| 실행 환경 | **Windows + PowerShell** |

---

## 2. 반드시 지켜야 할 환경 제약

### 2-1. Windows / PowerShell 호환

- `package.json`의 scripts에 **`&&` 체이닝 금지**, `rm -rf` 금지, `cp`/`mv`/`export` 등 POSIX 전용 명령 금지.
- 대신 다음을 사용한다.
  - 환경변수 주입 → `cross-env`
  - 파일/디렉터리 삭제 → `rimraf`
  - 파일 복사 → `copyfiles` 또는 Node 스크립트
  - 명령 체이닝 → `npm-run-all`의 `run-s` / `run-p`
- 경로는 코드 어디서든 `path.join(...)`으로만 조립한다. 하드코딩된 `/` 구분자 금지.
- 터미널 안내를 출력할 때는 **PowerShell 문법 기준**으로 쓴다. (`$env:VAR="value"` 형태)

### 2-2. PostgreSQL ↔ SQLite 즉시 전환

발표 당일 네트워크/DB 장애를 대비해 **`.env`만 바꾸면 SQLite로 즉시 구동**되어야 한다.
Prisma는 `datasource.provider`에 `env()`를 쓸 수 없으므로, 다음 방식으로 구현하라.

- `prisma/schema.prisma` → PostgreSQL 기준 (기본)
- `prisma/schema.sqlite.prisma` → provider만 `sqlite`로 바뀐 사본
- `scripts/use-db.ts` (Node 스크립트) → 인자로 `postgres` | `sqlite`를 받아 해당 스키마를 활성 스키마로 복사하고 `prisma generate`까지 수행
- npm scripts 예시
  ```
  "db:use:postgres": "ts-node scripts/use-db.ts postgres",
  "db:use:sqlite":   "ts-node scripts/use-db.ts sqlite",
  "demo:offline":    "run-s db:use:sqlite db:push db:seed start:dev"
  ```

**그리고 두 DB 모두에서 깨지지 않도록, 스키마 작성 시 아래 규칙을 반드시 지켜라.**

- **Prisma `enum` 사용 금지.** SQLite가 지원하지 않는다. → `String` 컬럼 + `src/common/constants/*.ts`의 union 타입 + class-validator `@IsIn([...])`으로 대체.
- **`Json` 타입 금지, 스칼라 배열(`String[]`) 금지.** → 관계 테이블로 분리하거나 콤마 구분 문자열 + getter로 처리.
- **`Decimal` 금지.** 금액은 전부 **원 단위 `Int`**로 저장한다. (KRW는 소수점이 없으므로 정확하고, 부동소수 오차도 없다.)
- **`@db.*` 네이티브 타입 지정 금지.**
- 날짜는 `DateTime` 사용하되, 애플리케이션 레이어에서는 항상 **Asia/Seoul 기준**으로 계산한다. (DB 저장은 UTC, 응답은 KST ISO 문자열)

---

## 3. 서비스 플로우 (이 순서대로 API가 존재해야 한다)

첨부된 데모 영상의 화면 순서와 동일하다.

1. **시작 / 온보딩** — 브랜딩 화면, 로그인
2. **결제수단 연동** — 카드사·은행을 선택해 **1회 연동** (왓섭 방식). 복수 기관 동시 연동 가능
3. **소비 분석** — 최근 **6개월** 결제 내역을 끌어와 카테고리별로 분류
   - 이체 / 카카오페이 / 토스페이 등 **가맹점을 특정할 수 없는 건**은 자동 분류하지 않는다
   - 사용자에게 *"사전에 확신 못한 N건만 여쭤볼게요"* 형태로 **직접 카테고리를 선택**받는다
   - 이력이 6개월 미만이면 **존재하는 기간만**으로 평균을 낸다
4. **페르소나 부여** — 최다 지출 카테고리 기준 (예: 쇼핑 최다 → "쇼핑 러버")
5. **절약 목표 설정** — 카테고리별로 절약 희망 금액을 **슬라이더로 다중 지정** (예: 교통 2만 원, 쇼핑 8만 원)
6. **챌린지 플랜 생성** — 합산 목표액 기준으로 **2주 / 4주 / 8주** 플랜 후보 제시
7. **챌린지 진행** — 실시간 지출 대비 진척도, 주차별 체크인, 성공/실패 판정
8. **여행 처방** — 절약액에 맞는 호남 여행지와 **루트 2개** 추천, 일부 사진 **블러 처리(예고편)**, 기방문자 리뷰 노출
9. **보상** — 챌린지 성공 시 **뱃지** 지급 + **숙소·관광지 할인 쿠폰**(유효기간 있음) 발급

---

## 4. 가상 금융 DB (가장 중요한 설계 포인트)

실제 오픈뱅킹·마이데이터 연동은 하지 않는다. 대신 **"진짜 금융기관 서버가 있는 것처럼" 가상 DB를 만들고 거기서 데이터를 끌어온다.**

### 4-1. 구조

- Prisma 스키마 안에 **`mock_` 접두사 테이블군**을 별도로 둔다. 서비스 도메인 테이블과 물리적으로 분리한다.
  - `MockInstitution` (기관: 신한카드, KB국민카드, 카카오뱅크, 토스뱅크 …)
  - `MockUserCredential` (로그인 ID/비밀번호 — 연동 시 검증용, 해시 저장)
  - `MockAccount` (계좌/카드. `type`: `CARD` | `BANK`)
  - `MockTransaction` (원본 거래. **여기에는 카테고리 컬럼이 없다.** 실제 카드사가 주는 수준의 원시 데이터만 담는다)

- `MockTransaction`이 제공하는 필드는 **딱 실제 명세서 수준**으로 제한하라. 이게 핵심이다.
  ```
  approvedAt        DateTime   // 승인 일시
  merchantName      String     // "배민)한식대첩 광주점", "이체 김**", "카카오페이"
  amount            Int        // 원 단위
  txType            String     // "APPROVAL" | "CANCEL" | "TRANSFER_OUT" | "TRANSFER_IN"
  mcc               String?    // 업종코드 (일부만 존재 — 30% 정도는 null로 시드)
  installmentMonths Int        // 할부 개월 (0 = 일시불)
  memo              String?
  ```
  → 카테고리를 미리 넣어두면 분류 엔진이 무의미해진다. **절대 넣지 마라.**

### 4-2. 접근 방식

- 서비스 코드는 `mock_` 테이블을 **직접 조회하지 않는다.**
- `FinancialProviderPort` 인터페이스를 정의하고, `MockFinancialProvider`가 이를 구현한다.
  ```ts
  interface FinancialProviderPort {
    listInstitutions(): Promise<InstitutionDto[]>;
    authenticate(institutionId: string, credential: CredentialDto): Promise<ProviderSession>;
    listAccounts(session: ProviderSession): Promise<ProviderAccountDto[]>;
    fetchTransactions(session: ProviderSession, accountId: string, from: Date, to: Date): Promise<ProviderTransactionDto[]>;
  }
  ```
- NestJS DI 토큰으로 주입한다. 나중에 실제 마이데이터 API가 붙으면 **`RealFinancialProvider`만 갈아끼우면 되도록** 한다.
- 실제 API처럼 보이게 **150~400ms 인위적 지연**을 넣고, `MOCK_LATENCY_MS` 환경변수로 조절 가능하게 하라. 발표 시 로딩 애니메이션이 자연스러워진다.

### 4-3. 시드 데이터 (발표 품질을 좌우한다)

- 데모 계정 1개: **광주광역시 거주 20대 후반 직장인** 페르소나
- **최근 6개월(약 180일) × 월 55~75건** 규모의 현실적인 거래를 생성한다. 총 350~450건.
- 반드시 포함할 패턴:
  - 배달앱: 평일 저녁·야간 집중, 건당 1.5~3.5만 원, **월 15만 원 이상** (발표 후킹 소재)
  - 구독: OTT·음원 등 **매월 같은 날 같은 금액** 3~4건 (정기결제 탐지 로직 검증용)
  - 카페/편의점: 오전·점심 시간대 소액 다건
  - 교통: 대중교통 소액, 가끔 택시(야간)
  - 쇼핑: 월 2~5건, 건당 3~15만 원, 저녁·야간 편중
  - **분류 불가 건 12~20건**: `merchantName`이 "이체 김**", "카카오페이", "토스페이", "(주)케이지이니시스" 같은 것들 → 4단계 "직접 확인" UI를 시연하기 위해 **의도적으로 심어둔다**
  - 취소 거래 2~3건 (`txType: "CANCEL"`, 원거래와 상계 처리되는지 검증)
  - 월급 입금 6건 (`TRANSFER_IN` — 지출 집계에서 제외되는지 검증)
- 금액은 **매 실행마다 랜덤하지 않게** 고정 시드(seeded PRNG)를 써라. 발표 리허설과 본 발표의 숫자가 달라지면 안 된다.

---

## 5. 소비 분류 엔진 (AI 사용 금지)

> 심사 대응 포인트: "유저가 늘어도 비용이 늘지 않는 구조"임을 증명해야 한다. LLM 호출 없이 전부 결정론적 규칙으로 처리하라.

### 5-1. 카테고리 (String 상수)

```
FOOD_DELIVERY   배달
DINING          외식
CAFE_CONV       카페·편의점
SHOPPING        쇼핑
TRANSPORT       교통
LIFE_CULTURE    생활·문화
FIXED           고정지출(통신·구독·보험)
UNCLASSIFIED    미분류 (사용자 확인 대기)
EXCLUDED        집계 제외 (수입, 계좌 간 이체, 취소 상계분)
```

### 5-2. 분류 파이프라인 (위에서부터 순서대로, 먼저 매칭되면 종료)

1. **정규화** — 가맹점명에서 접두 채널 표기(`배민)`, `쿠팡이츠)`), 지점 접미사(`OO점`, `OO지점`), 사업자 형태(`(주)`, `주식회사`), 공백·특수문자 제거
2. **사용자 개인 규칙** (`UserMerchantRule`) — 이 사용자가 과거에 직접 지정한 가맹점이면 그대로 적용
3. **전역 키워드 사전** (`MerchantRule` 시드 테이블, 200개 내외) — `pattern`(정규화된 부분문자열) → `category`, `priority` 컬럼으로 우선순위 제어
4. **MCC 매핑** — `mcc`가 있으면 코드→카테고리 매핑 테이블 적용
5. **정기결제 탐지** — 동일 정규화 가맹점 + 금액 편차 5% 이내 + 25~35일 주기가 **3회 이상** 반복 → `FIXED` + `isRecurring: true`
6. **거래 유형 필터** — `TRANSFER_IN`, 본인 명의 계좌 간 이체, `CANCEL` 상계분 → `EXCLUDED`
7. **위 모두 실패** → `UNCLASSIFIED`, `needsReview: true`

### 5-3. 사용자 확인 후 학습

- 사용자가 `UNCLASSIFIED` 건의 카테고리를 지정하면
  1. 해당 거래를 갱신하고
  2. **같은 정규화 가맹점의 다른 미분류 건을 일괄 갱신**하고 (N건이 1번의 응답으로 줄어드는 UX)
  3. `UserMerchantRule`에 규칙을 저장해 **다음 동기화부터 자동 적용**되게 한다
- 응답에 "이번 선택으로 함께 정리된 건수"를 담아라. 발표에서 잘 먹히는 디테일이다.

---

## 6. 핵심 계산 규칙 (테스트 필수)

### 6-1. 기준 소비 지표

- 기준 기간: **오늘 기준 직전 6개 완결 월**. 데이터가 6개월 미만이면 존재하는 월 수 `n`으로만 평균.
- `monthlyAvgByCategory[category] = 해당 카테고리 총액 / n`
- `EXCLUDED` 카테고리는 모든 집계에서 제외.
- 부분 월(이번 달 진행 중)은 평균 계산에서 제외한다. 단, 챌린지 진척 계산에는 사용한다.

### 6-2. 페르소나 (60종)

세 축의 조합으로 코드를 만든다. `{TIME}_{LEVEL}_{CATEGORY}`

- **시간대 축** (승인 건수 최다 구간, KST 기준)
  `MORNING` 05:00–10:59 / `LUNCH` 11:00–16:59 / `EVENING` 17:00–21:59 / `NIGHT` 22:00–04:59
- **소비량 축** — `SpendingBenchmark` 시드 테이블(연령대별 월평균 지출 기준값) 대비
  `LOW` < 80% / `NORMAL` 80~120% / `OVER` > 120%
- **카테고리 축** — 월평균 지출 **최다 카테고리** 5종 중 하나
  (`FIXED`, `UNCLASSIFIED`, `EXCLUDED`는 후보에서 제외)

→ 4 × 3 × 5 = **60개**. `Persona` 테이블에 60행을 전부 시드하고, 각 행에 `code`, `displayName`("쇼핑 러버" 등), `tagline`, `description`, `iconKey`를 넣어라.
계산은 코드로, **표시 문구는 DB에서** 가져온다. (기획이 문구를 바꿔도 코드 수정 불필요)

### 6-3. 절약 목표 → 챌린지 플랜

사용자가 카테고리별 절약 희망액을 지정한 합계를 `T`라 하자. **`T`는 4주 기준액**이다.

| 플랜 | 기간 | 목표 절약액 |
|---|---|---|
| SHORT | 2주 | `round(T × 0.5)` |
| STANDARD | 4주 | `T` |
| LONG | 8주 | `T × 2` |

- **난이도**: `절감률 = 목표액 / (해당 기간 예상 지출)`, 예상 지출 = `월평균 총지출 × (주수 / 4.345)`
  - `< 10%` → `EASY` / `10~25%` → `NORMAL` / `> 25%` → `HARD`
- **주차별 예산**: 카테고리별 `(월평균 - 절약목표) ÷ 4.345 × (주수)`를 주 단위로 균등 배분. 원 단위 반올림하고 **잔액은 마지막 주에 몰아넣어** 합계가 정확히 맞게 하라.
- 목표액이 해당 카테고리 월평균을 초과하는 입력은 **400 에러**로 거절하고, 어떤 카테고리가 문제인지 응답에 명시하라.

### 6-4. 챌린지 진척

- `현재 절약액 = Σ(카테고리별 기간 예산 - 카테고리별 실제 지출)`, 음수 카테고리는 0이 아니라 **음수 그대로 합산**한다 (한 카테고리 초과분이 다른 카테고리 절약분을 상쇄해야 정직하다)
- `progressRate = clamp(현재 절약액 / 목표 절약액, 0, 1)`
- 상태: `IN_PROGRESS` / `SUCCEEDED`(종료일에 진척 100% 이상) / `FAILED` / `ABANDONED`

### 6-5. 여행 처방

- 예상 절약액을 기준으로 `TravelDestination.minBudget ≤ 절약액` 인 여행지를 후보로 뽑는다.
- 각 여행지마다 **루트 2개**(`TravelRoute`)를 반환한다. 루트는 `RouteStop`(순서, 장소, 체류시간, 예상비용)으로 구성.
- **블러 정책**: `progressRate < 1.0` 이면 `TravelPhoto` 중 `revealOrder`가 앞선 것부터 `ceil(progressRate × 전체장수)` 장만 `blurred: false`, 나머지는 `blurred: true`로 내려준다. 이미지 URL 자체는 항상 내려주되 플래그로 프론트가 처리하게 한다.
- 여행지는 **호남권(광주·전남·전북) 인구소멸위험지역** 기준. 시드에는 **강진·보성·고흥·고창·신안** 5곳을 반드시 포함한다. 각 여행지에 기방문자 리뷰 3~5건 시드.
- 여행지 데이터는 목업이나, `TravelDestination`에 `regionCode`, `extinctionRiskIndex` 컬럼을 두어 **추후 실제 소멸위험지수 데이터로 교체 가능**하게 설계하라.

### 6-6. 보상

- 챌린지 성공 시 `Badge` 지급. 뱃지는 **수집형**이므로 조건을 테이블로 정의(`BadgeRule`: 첫 챌린지 성공, 3회 연속, 특정 카테고리 절약 달성 등)
- 쿠폰(`Coupon`)은 `validFrom` / `validUntil`, `discountType`(`RATE` | `AMOUNT`), `partnerName`을 갖는다. 발급 시 사용자별 `IssuedCoupon` 생성, 상태는 `ISSUED` | `USED` | `EXPIRED`.

---

## 7. API 설계 지침

- 베이스 경로 `/api/v1`, Swagger는 `/docs`
- 모든 응답은 아래 봉투로 통일한다.
  ```json
  { "success": true,  "data": { }, "meta": { } }
  { "success": false, "error": { "code": "SAVING_GOAL_EXCEEDS_AVERAGE", "message": "…", "details": [] } }
  ```
  → 전역 `TransformInterceptor` + `AllExceptionsFilter`로 구현
- 에러 코드는 `src/common/errors/error-codes.ts`에 **문자열 상수로 집중 관리**한다. 프론트가 분기할 수 있어야 한다.
- 모든 요청 바디에 DTO 클래스 + class-validator 데코레이터 + `@ApiProperty`를 붙인다. `whitelist: true, forbidNonWhitelisted: true, transform: true`로 전역 파이프 설정.
- 금액 필드명은 전부 `~Amount`로 끝내고 **원 단위 정수**임을 `@ApiProperty({ description: '원 단위 정수' })`에 명시.
- 페이지네이션은 `?cursor=&limit=` 커서 방식.

### 필요한 엔드포인트 (최소)

**auth**
- `POST /auth/login` — 데모 계정 로그인, accessToken 반환
- `GET /auth/me`

**connections**
- `GET /connections/institutions` — 연동 가능 기관 목록
- `POST /connections` — 기관 연동 (복수 가능), 계좌·카드 자동 등록
- `GET /connections` — 연동 현황
- `DELETE /connections/:id`

**transactions**
- `POST /transactions/sync` — 가상 금융 DB에서 최근 6개월 거래 수집 + 분류 파이프라인 실행. 응답에 `{ imported, classified, needsReview }`
- `GET /transactions` — 필터: 기간, 카테고리, 커서
- `GET /transactions/pending-review` — 미분류 건 목록 (**"확신 못한 N건" 화면**)
- `PATCH /transactions/:id/category` — 카테고리 직접 지정. 응답에 `alsoUpdatedCount`
- `POST /transactions/review/bulk` — 여러 건 한 번에 확정

**analysis**
- `GET /analysis/summary` — 6개월 평균, 카테고리별 금액·비중, 월별 추이, 시간대 분포, `monthsCovered`
- `GET /analysis/top-category`

**persona**
- `POST /persona/evaluate` — 페르소나 산출·저장
- `GET /persona/me`

**saving-goals**
- `GET /saving-goals/suggestions` — 카테고리별 슬라이더 기본값·최대값(= 월평균) 제공
- `POST /saving-goals` — 카테고리별 목표액 다중 저장
- `GET /saving-goals/current`

**challenges**
- `GET /challenges/plans` — 2주/4주/8주 후보 3종을 계산해 반환 (아직 저장 안 함)
- `POST /challenges` — 플랜 선택 후 챌린지 시작
- `GET /challenges/current` — 진척률, 주차별 예산 대비 실지출, 남은 일수
- `POST /challenges/:id/checkin` — 주차 체크인
- `POST /challenges/:id/complete` — 성공/실패 판정, 뱃지·쿠폰 지급 트리거
- `GET /challenges/history`

**travel**
- `GET /travel/prescriptions` — 현재 절약액 기준 처방(여행지 + 루트 2개 + 블러 플래그)
- `GET /travel/destinations/:id`
- `GET /travel/destinations/:id/reviews`

**rewards**
- `GET /rewards/badges` — 보유·미보유 전체 (수집형이므로 잠긴 것도 내려줌)
- `GET /rewards/coupons`

**demo (발표 전용, `DEMO_MODE=true`일 때만 등록)**
- `POST /demo/reset` — 전체 초기화 후 재시드 (리허설 반복용)
- `POST /demo/fast-forward` — 챌린지 시계를 N일 진행시켜 **성공 화면을 즉시 시연**
- `POST /demo/simulate-spending` — 임의 지출 주입해 진척률 변화 시연

> `demo` 모듈은 발표에서 실수를 없애주는 **가장 실용적인 장치**다. 반드시 만들어라.

---

## 8. 프로젝트 구조

```
src/
  common/          constants, decorators, filters, interceptors, errors, utils(money, date-kst)
  config/          환경변수 스키마 검증 (부팅 시 실패하도록)
  prisma/          PrismaModule, PrismaService
  auth/
  connections/
  financial/       FinancialProviderPort, MockFinancialProvider, dto
  transactions/    sync, classification/ (normalizer, rule-engine, recurring-detector)
  analysis/
  persona/
  saving-goals/
  challenges/      plan-calculator.ts, progress-calculator.ts
  travel/
  rewards/
  demo/
prisma/
  schema.prisma
  schema.sqlite.prisma
  seed/            index.ts, institutions.ts, transactions.ts, merchant-rules.ts,
                   personas.ts, travel.ts, badges.ts
scripts/
  use-db.ts
```

- **순수 계산 로직은 NestJS 의존성 없는 순수 함수**로 분리하라 (`plan-calculator.ts`, `progress-calculator.ts`, `rule-engine.ts`). 그래야 단위 테스트가 쉽고 검증이 빠르다.

---

## 9. 테스트 (범위 제한)

해커톤이므로 E2E는 만들지 않는다. 대신 아래 **순수 함수 단위 테스트만** 작성하라.

- `classification/rule-engine.spec.ts` — 정규화, 우선순위, 미분류 판정
- `classification/recurring-detector.spec.ts` — 정기결제 탐지 (3회 미만은 탐지 안 됨 포함)
- `persona/persona-calculator.spec.ts` — 경계값(정확히 80%, 120%), 최다 카테고리 동점 처리
- `challenges/plan-calculator.spec.ts` — 2/4/8주 비례, 반올림 잔액이 마지막 주에 들어가 합계가 정확히 일치하는지
- `challenges/progress-calculator.spec.ts` — 초과 지출 카테고리의 음수 상쇄
- `analysis/summary.spec.ts` — 6개월 미만일 때 `n`개월 평균

---

## 10. 산출물 및 진행 방식

### 진행 순서 (각 단계 끝날 때마다 멈추고 결과 보고)

1. **설계 확정** — Prisma 스키마 전체 + ERD 설명 + API 목록(경로·메서드·요청/응답 요약)을 먼저 문서로 제출. **코드 작성 전 승인 받을 것.**
2. 프로젝트 스캐폴딩 + 공통 레이어(응답 봉투, 예외 필터, 설정 검증, Swagger, PostgreSQL/SQLite 전환 스크립트)
3. Prisma 스키마 + 마이그레이션 + 시드 (가상 금융 DB 포함)
4. auth / connections / financial provider
5. transactions + 분류 엔진 + 미분류 확인 플로우
6. analysis / persona
7. saving-goals / challenges
8. travel / rewards
9. demo 모듈 + 최종 점검

### 각 단계 완료 시 함께 제출할 것

- 변경/추가된 파일 목록
- **PowerShell에서 그대로 실행 가능한 명령어**
- 해당 단계에서 확인 가능한 Swagger 엔드포인트와, 검증용 요청 예시(JSON)

### 최종 산출물에 포함

- `README.md` — PowerShell 기준 설치·실행·시드·오프라인(SQLite) 전환 절차, 데모 계정 정보, **발표 당일 트러블슈팅 체크리스트**
- `.env.example`
- `docs/api-contract.md` — 프론트 개발자가 디자인 확정 후 바로 붙일 수 있게, 화면 순서대로 정리한 엔드포인트·응답 예시 모음

---

## 11. 하지 말아야 할 것

- ❌ LLM / 외부 AI API 호출 (분류·페르소나·추천 전부 규칙 기반으로)
- ❌ 실제 외부 금융 API 연동 시도
- ❌ 프론트엔드 코드 작성
- ❌ Docker 필수화 (있으면 좋지만, **Docker 없이도 반드시 돌아가야 한다**)
- ❌ Prisma enum / Json / 스칼라 배열 / Decimal 사용
- ❌ 인증 고도화(refresh, OAuth, RBAC) — 범위 밖
- ❌ 한 번에 전체 코드 쏟아내기 — **10번의 진행 순서를 지켜 단계별로 보고할 것**

---

## 12. 첫 응답으로 해야 할 일

바로 코드를 쓰지 말고, **1단계(설계 확정)만** 수행하라.

1. 위 요구사항 중 **모호하거나 결정이 필요한 지점**을 최대 5개만 질문 형태로 정리 (내가 답하지 않으면 네가 합리적 기본값을 정해 진행)
2. **Prisma 스키마 전문** (PostgreSQL 기준, SQLite 호환 규칙 준수)
3. **전체 API 표** — 경로 / 메서드 / 인증 필요 여부 / 요청 요약 / 응답 요약 / 대응 화면(3장 플로우의 몇 번인지)
4. 모듈 의존 관계 다이어그램 (텍스트)
