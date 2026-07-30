# 야호(Yaho) API 계약서

> 프론트엔드가 **추측 없이 바로 붙일 수 있게** 하는 것이 이 문서의 목적입니다.
> 화면 순서(①~⑨)대로 정리했고, **모든 응답 예시는 실제 서버에서 캡처한 것**입니다.
>
> - 베이스 경로 `http://localhost:3000/api/v1`
> - Swagger UI `http://localhost:3000/docs` (Authorize 버튼에 accessToken 입력)
> - 데모 계정 `demo@yaho.kr` / `yaho1234` · 기관 연동 `yaho` / `1234`

---

## 1. 공통 규약

### 1-1. 응답 봉투

**모든** 응답이 아래 두 형태 중 하나입니다.

```json
{ "success": true,  "data": { }, "meta": { } }
{ "success": false, "error": { "code": "…", "message": "…", "details": [] } }
```

- 프론트는 HTTP 상태가 아니라 **`error.code` 문자열로 분기**하세요.
- `error.message` 는 사용자에게 그대로 보여줄 수 있는 한국어입니다.
- `error.details` 에는 어떤 필드·카테고리가 문제인지 담깁니다.
- Swagger 스키마에도 이 봉투가 그대로 반영되어 있습니다.

### 1-2. 필드 규약

| 규약 | 내용 |
|---|---|
| **금액** | `~Amount` 로 끝나면 **원 단위 정수**. 소수·문자열 아님 |
| **비율** | `~Rate` 는 `0.0 ~ 1.0` 소수 (예: `0.598` = 59.8%) |
| **날짜** | 전부 **KST ISO 문자열** `2026-07-30T16:49:44.706+09:00` |
| **페이지네이션** | `?cursor=&limit=` 커서 방식. 응답 `meta`: `{ hasNext, nextCursor }` |
| **음수 허용** | `savedAmount` 는 **음수가 될 수 있습니다** (초과 지출). 0으로 자르지 않습니다 |

### 1-2-1. 소비 카테고리 12종

분류 결과와 페르소나 축이 **같은 12종**입니다.

```
DELIVERY_FOOD 배달음식        DINING_OUT 외식           CAFE_SNACK 카페+간식
ALCOHOL_NIGHTLIFE 술+유흥     TRANSPORT_CAR 교통+자동차   SHOPPING 쇼핑
GAME_INAPP 게임+인앱          SUBSCRIPTION_OTT 구독+OTT  CONVENIENCE_STORE 편의점
HEALTH_FITNESS 의료+건강+피트니스  EDUCATION 교육          TRAVEL_STAY 여행+숙박
```

여기에 더해 분류 결과에만 나오는 3종이 있습니다.

| 코드 | 의미 |
|---|---|
| `FIXED_BILLS` | 통신·보험·공과금. **절약 목표 대상도, 페르소나 축도 아닙니다** |
| `UNCLASSIFIED` | 사용자 확인 대기 |
| `EXCLUDED` | 수입·계좌간이체·취소 상계분. 모든 집계에서 빠집니다 |

> 넷플릭스 같은 **구독은 `SUBSCRIPTION_OTT`** 이지 `FIXED_BILLS` 가 아닙니다.
> 구독은 끊을 수 있어 절약 목표에 잡히고, 통신비는 그렇지 않기 때문입니다.

### 1-3. 에러 코드

| HTTP | 코드 | 발생 지점 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO 검증 실패 (허용되지 않은 필드 포함 시에도) |
| 400 | `SAVING_GOAL_EXCEEDS_AVERAGE` | 절약 목표 > 카테고리 월평균 |
| 400 | `INVALID_CATEGORY` | 중복/허용되지 않는 카테고리 |
| 400 | `INVALID_REQUEST` | 그 외 잘못된 요청 |
| 401 | `UNAUTHORIZED` | 토큰 없음·만료. **재시드 후 옛 토큰도 여기 걸립니다** |
| 401 | `INVALID_CREDENTIALS` | 로그인 실패 |
| 401 | `PROVIDER_AUTH_FAILED` | 기관 연동 자격증명 불일치 |
| 403 | `DEMO_MODE_DISABLED` | 데모 모드 꺼짐 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `CONNECTION_ALREADY_EXISTS` | 이미 연동된 기관 |
| 409 | `CHALLENGE_ALREADY_ACTIVE` | 진행 중 챌린지가 있는데 새로 시작 |
| 409 | `CHALLENGE_NOT_ACTIVE` | 종료된 챌린지에 체크인 |
| 409 | `ALREADY_CHECKED_IN` | 같은 주차 중복 체크인 |
| 422 | `NO_TRANSACTION_DATA` | 동기화 전에 분석 호출 |
| 422 | `NO_SAVING_GOAL` | 목표 없이 플랜 조회 |
| 422 | `NO_PERSONA` | 산출 전에 페르소나 조회 |
| 422 | `NO_ACTIVE_CHALLENGE` | 진행 중 챌린지 없음 |
| 500 | `INTERNAL_ERROR` | 그 외 |

---

## 2. 화면별 엔드포인트

### ① 시작 / 온보딩

#### `POST /auth/login` — 인증 불필요

```json
// 요청
{ "email": "demo@yaho.kr", "password": "yaho1234" }
```
```json
// 200
{ "success": true, "data": {
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "7d",
  "user": { "id": "cms77qkmv0000tcjc2noeff7n", "email": "demo@yaho.kr",
            "name": "김하늘", "ageBand": "20S_LATE", "regionCode": "29" }
}}
```
```json
// 401 — 이메일이 없어도 동일한 응답 (계정 존재 여부 노출 방지)
{ "success": false, "error": {
  "code": "INVALID_CREDENTIALS", "message": "이메일 또는 비밀번호가 올바르지 않습니다.", "details": [] }}
```

#### `GET /auth/me` 🔒

**앱 부팅 시 이 하나만 호출하면 어느 화면으로 갈지 정할 수 있습니다.**

```json
{ "success": true, "data": {
  "id": "cms77qkmv0000tcjc2noeff7n", "email": "demo@yaho.kr", "name": "김하늘",
  "ageBand": "20S_LATE", "regionCode": "29",
  "hasConnections": false,          // → 화면 ②
  "hasSyncedTransactions": false,   // → 화면 ③
  "pendingReviewCount": 0,          // > 0 이면 "확신 못한 N건" 배지
  "hasPersona": false,              // → 화면 ④
  "hasSavingGoal": false,           // → 화면 ⑤
  "hasActiveChallenge": false       // → 화면 ⑦
}}
```

---

### ② 결제수단 연동

#### `GET /connections/institutions` 🔒

카드사 3곳 · 은행 3곳. 실제 금융 API 처럼 **150~400ms 지연**이 들어가므로 로딩 애니메이션을 넣으세요.

```json
{ "success": true, "data": [
  { "code": "SHINHAN_CARD", "name": "신한카드", "type": "CARD",
    "logoKey": "shinhan", "brandColor": "#0046FF", "isConnected": false },
  { "code": "KB_CARD", "name": "KB국민카드", "type": "CARD",
    "logoKey": "kbcard", "brandColor": "#FFBC00", "isConnected": false }
]}
```

#### `POST /connections` 🔒

인증에 성공하면 **계좌·카드가 자동 등록**됩니다. 복수 기관을 순차 호출하세요.

```json
// 요청
{ "institutionCode": "SHINHAN_CARD", "loginId": "yaho", "password": "1234" }
```
```json
// 201
{ "success": true, "data": {
  "id": "cms77qrgl0001tcc0ydrv8vur",
  "institutionCode": "SHINHAN_CARD", "institutionName": "신한카드", "institutionType": "CARD",
  "logoKey": "shinhan", "brandColor": "#0046FF",
  "status": "ACTIVE",
  "connectedAt": "2026-07-30T16:49:44.706+09:00",
  "lastSyncedAt": null,
  "accounts": [ { "id": "cms77qrgl0002tcc0nun11pkm", "type": "CARD",
                  "accountNumberMasked": "4512-****-****-8821",
                  "productName": "신한카드 Deep Dream 체크" } ]
}}
```

> 이 시점에는 거래를 가져오지 않습니다. `POST /transactions/sync` 를 따로 호출하세요.

#### `GET /connections` 🔒 · `DELETE /connections/{id}` 🔒

해제 시 해당 기관에서 수집한 거래도 함께 삭제되고, `removedTransactionCount` 로 몇 건이 정리됐는지 알려줍니다.

---

### ③ 소비 분석

#### `POST /transactions/sync` 🔒

최근 6개월 거래를 수집하고 분류 파이프라인을 돌립니다. **재호출해도 안전합니다** (중복은 `skipped`).

**약 14초 걸립니다** — Claude 가 가맹점을 분류하는 시간입니다. 로딩 화면을 띄워 주세요.

```json
// 요청 (선택)
{ "months": 6 }
```
```json
// 201
{ "success": true, "data": {
  "imported": 424, "skipped": 0,
  "classified": 405,        // 자동 분류 성공
  "needsReview": 19,        // ← 화면 ③ "확신 못한 N건" 의 N
  "recurringDetected": 6,   // 정기결제 가맹점 수
  "excluded": 20,           // 월급·계좌간이체·취소

  // --- AI 분류 결과 ---
  "aiClassified": 375,           // classified 중 Claude 가 판정한 거래 수
  "classificationSource": "AI",  // "AI" | "RULE"
  "aiMerchantsAsked": 72,        // 물어본 가맹점 수 (거래 수가 아님)
  "aiMerchantsAccepted": 60,     // 모델이 확신해서 채택
  "aiMerchantsDeferred": 12,     // 모델이 "모르겠다" → 규칙 엔진으로
  "aiFallbackReason": null,      // 실패했다면 사유
  "aiLatencyMs": 12470,

  "periodFrom": "2026-01-01T00:00:00.000+09:00",
  "periodTo":   "2026-07-30T16:49:47.714+09:00",
  "syncedAt":   "2026-07-30T16:49:47.714+09:00"
}}
```

**분류는 거래가 아니라 가맹점 단위입니다.** 거래 424건이 아니라 정규화 가맹점 72곳을
20곳씩 묶어 4번 호출합니다. 같은 가맹점이 달마다 다른 카테고리로 갈라지지 않게 하기 위함입니다 —
갈라지면 카테고리별 월평균이 흔들리고, 그 위에 얹힌 절약 슬라이더 상한과 진척률까지 흔들립니다.

**`classificationSource: "RULE"` 이어도 정상 응답입니다.** 키가 없거나 호출이 실패하면
키워드 사전·MCC 규칙 엔진만으로 분류하고 `aiFallbackReason` 에 사유를 담습니다.
자동 분류 건수는 거의 같고(405건), 응답 형태는 완전히 동일합니다. 프론트는 분기할 필요 없이
`classificationSource` 로 배지만 다르게 붙이면 됩니다.

**배치 단위 부분 실패가 가능합니다.** 4개 중 하나만 실패하면 나머지 3개의 AI 판정은 그대로
쓰이고 실패한 배치의 가맹점만 규칙 엔진으로 넘어갑니다. 이때 `classificationSource` 는 `AI`,
`aiFallbackReason` 은 채워진 상태가 됩니다.

#### `GET /transactions` 🔒

`?from=&to=&category=&onlyRecurring=&cursor=&limit=`

```json
{ "success": true,
  "data": [ {
    "id": "cms78t5a400bjtccgbj9safxk",
    "approvedAt": "2026-07-29T18:48:00.000+09:00",
    "merchantName": "송정떡갈비 광주충장로점",
    "normalizedMerchant": "송정떡갈비",
    "amount": 41500,
    "category": "DINING_OUT",
    "classifiedBy": "GLOBAL_RULE",   // 어느 단계가 분류했는지 → "왜 이 카테고리인지" 표시용
    "txType": "APPROVAL",
    "isRecurring": false, "needsReview": false,
    "installmentMonths": 0, "excludeReason": null,
    "accountName": "KB국민 노리 체크카드"
  } ],
  "meta": { "hasNext": true, "nextCursor": "cms78t5a300bitccgo9nl4fzr" }
}
```

`classifiedBy` 값 — 파이프라인에서 **어느 단계가 이 카테고리를 정했는지**입니다. 우선순위 순:

| 값 | 뜻 | 화면 라벨 예시 |
|---|---|---|
| `TX_TYPE_GUARD` | 거래유형(수입·취소)만으로 확정 | 거래유형 |
| `USER_RULE` | 사용자가 이전에 지정한 규칙 | 내가 정한 규칙 |
| `AI` | **Claude 가맹점 판정** | AI 분류 |
| `GLOBAL_RULE` | 전역 키워드 사전 (329개) | 가맹점 사전 |
| `MCC` | 업종코드 매핑 (54개) | 업종코드 |
| `RECURRING` | 정기결제 주기 탐지 | 정기결제 탐지 |
| `INTERNAL_TRANSFER` | 본인 명의 계좌 간 이체 | 계좌 간 이체 |
| `NONE` | 미분류 (사용자 확인 대기) | 미분류 |
| `MANUAL` | 사용자가 직접 지정 | 직접 지정 |

`USER_RULE` 과 `TX_TYPE_GUARD` 가 `AI` 보다 앞섭니다 — 사용자가 화면에서 고친 카테고리를
모델이 되돌리면 안 되고, 월급 입금은 판단이 아니라 사실이기 때문입니다.

#### `GET /transactions/pending-review` 🔒 — **핵심 화면**

미분류 거래를 **가맹점 단위로 묶어서** 반환합니다. 건별로 물으면 19번이지만 8번이면 끝납니다.

```json
{ "success": true, "data": {
  "totalCount": 19,   // 거래 수
  "groupCount": 8,    // ← 실제 질문 수
  "groups": [ {
    "normalizedMerchant": "이체김",      // 확정 요청 시 이 값을 보낸다
    "displayName": "이체 김**",
    "count": 5,
    "totalAmount": 207700,
    "samples": [
      { "id": "cms77qurn00butcc0f6eukm8a", "approvedAt": "2026-07-06T17:42:00.000+09:00",
        "amount": 55000, "merchantName": "이체 김**" }
    ]
  } ]
}}
```

건수가 많은 가맹점부터 정렬되어 있어, 위에서부터 답할수록 빨리 줄어듭니다.

#### `PATCH /transactions/{id}/category` 🔒 — **발표 후킹 포인트**

```json
// 요청
{ "category": "SHOPPING", "applyToSameMerchant": true, "saveRule": true }
```
```json
// 200
{ "success": true, "data": {
  "id": "cms77qurn00butcc0f6eukm8a",
  "category": "SHOPPING",
  "alsoUpdatedCount": 4,        // ← "4건이 함께 정리됐어요" 로 노출
  "ruleSaved": true,            // 다음 동기화부터 자동 적용
  "remainingReviewCount": 14
}}
```

지정 가능한 카테고리: 위 12종 + `FIXED_BILLS` + `EXCLUDED`

#### `POST /transactions/review/bulk` 🔒

```json
// 요청
{ "items": [ { "normalizedMerchant": "케이지이니시스", "category": "HEALTH_FITNESS" } ] }
```
```json
// 201
{ "success": true, "data": {
  "updatedCount": 14, "remainingReviewCount": 0,
  "perItem": [ { "normalizedMerchant": "케이지이니시스", "category": "HEALTH_FITNESS", "updatedCount": 4 } ]
}}
```

#### `GET /analysis/summary` 🔒

```json
{ "success": true, "data": {
  "monthsCovered": 6,        // 이력이 짧으면 6보다 작다 → "최근 N개월 기준" 으로 표시
  "periodFrom": "2026-01-01T00:00:00.000+09:00",
  "periodTo":   "2026-07-01T00:00:00.000+09:00",
  "totalAmount": 5855640,
  "monthlyAvgTotalAmount": 975940,
  "totalTxCount": 346,
  "byCategory": [
    { "category": "DELIVERY_FOOD", "label": "배달음식", "monthlyAvgAmount": 175833,
      "totalAmount": 1055000, "shareRate": 0.1802, "txCount": 46 },
    { "category": "SHOPPING", "label": "쇼핑", "monthlyAvgAmount": 147400,
      "totalAmount": 884400, "shareRate": 0.151, "txCount": 16 }
  ],
  "monthlyTrend": [ { "month": "2026-01", "totalAmount": 1006190, "txCount": 60 } ],
  "hourlyDistribution": [ { "hour": 0, "txCount": 2, "totalAmount": 46700 } ],
  "timeBandDistribution": [
    { "timeBand": "MORNING", "label": "아침형", "window": "오전 5시~오전 10시",
      "txCount": 82, "totalAmount": 1092100 }
  ],
  "recurringPayments": [ { "merchantName": "SK텔레콤", "monthlyAmount": 55000, "occurrences": 7 } ]
}}
```

- 기준 기간은 **직전 6개 완결 월** (월 경계 = KST 매월 1일 00:00). 진행 중인 이번 달은 평균에서 제외됩니다.
- `hourlyDistribution` 은 **항상 24칸**, `monthlyTrend` 는 무지출 월도 0으로 채워 보냅니다 (그래프 구멍 방지).
- `EXCLUDED`(월급·계좌간이체·취소)는 전부 빠집니다. `UNCLASSIFIED` 는 실제로 나간 돈이라 **포함**되며, 사용자가 확정하면 **총액은 그대로인 채 분포만 또렷해집니다.**

#### `GET /analysis/top-category` 🔒

```json
{ "success": true, "data": {
  "category": "DELIVERY_FOOD", "label": "배달음식",
  "monthlyAvgAmount": 175833, "shareRate": 0.1802,
  "runnerUpCategory": "SHOPPING", "runnerUpAmount": 147400,
  "isTie": false        // true 면 "박빙" 표현 가능
}}
```

`FIXED_BILLS` 와 `UNCLASSIFIED` 는 "줄일 수 있는 소비"가 아니므로 후보에서 제외됩니다.

---

### ④ 페르소나

#### `POST /persona/evaluate` 🔒 · `GET /persona/me` 🔒

**Claude 가 두 축(시간대 × 카테고리)을 고르고, 서버가 48종 카탈로그에서 페르소나를 확정합니다.**
약 7초 걸립니다.

```json
{ "success": true, "data": {
  "code": "EVENING_DELIVERY_FOOD",
  "displayName": "혈당스파이크 취침형",
  "tagline": "하루를 마무리하는 저녁, 배달앱을 켜는 당신",
  "description": "저녁 5시~밤 10시 사이에 결제가 가장 많고, 그중 지출이 가장 큰 항목은 ‘배달음식’입니다. …",
  "iconKey": "delivery-evening",
  "axes": {
    "timeBand": "EVENING",
    "category": "DELIVERY_FOOD",
    "spendingLevel": "OVER"      // ← 코드에는 안 들어감. 과소비 진단 근거
  },
  "ai": {
    "generatedBy": "CLAUDE",     // "CLAUDE" | "RULE"
    "headline": "저녁마다 익숙한 메뉴를 부르는 소비",
    "reason": "쇼핑이 25.0%로 금액 1위지만 29건에 그치고, 배달음식은 18.9%에 47건으로 반복 빈도가 훨씬 높습니다. 교촌치킨 7건·마라공방 8건에 저녁 결제가 125건(36.9%)으로 가장 많습니다.",
    "fallbackReason": null,
    "divergedFromRule": true,           // 규칙과 다른 축을 골랐다
    "ruleBaselineCode": "EVENING_SHOPPING"  // 규칙만 썼다면 나왔을 코드
  },
  "evidence": {
    "topCategoryAmount": 175833, "topCategoryLabel": "배달음식",
    "monthlyAvgTotalAmount": 975940,
    "benchmarkAmount": 650000,
    "benchmarkSource": "통계청 가계동향조사(1인 가구) 기반 가공값",
    "spendingRatio": 1.5014,      // 또래 대비 1.5배
    "topTimeBandTxCount": 128,
    "monthsCovered": 6,
    "fallbackApplied": false, "actualTopCategory": null
  },
  "evaluatedAt": "2026-07-30T16:49:49.236+09:00"
}}
```

- **시간대 축** `NIGHT` 22~05 / `MORNING` 05~11 / `LUNCH` 11~17 / `EVENING` 17~22 (승인 **건수** 기준)
- **카테고리 축** 위 12종 (§1-2-1)
- **`spendingLevel`** `LOW` < 80% / `NORMAL` 80~120% / `OVER` > 120% — **페르소나 코드에는 포함되지 않습니다.**
- `evidence` 를 화면에 그대로 띄우면 "왜 이 페르소나인지" 설명이 됩니다.
- `POST` 와 `GET` 의 `evidence` · `ai` 는 **항상 동일**합니다 (산출 시점 스냅샷).

#### AI 가 무엇을 하고 무엇을 안 하는가

| 항목 | 담당 |
|---|---|
| 두 축을 무엇으로 볼지 | Claude |
| `ai.reason` · `ai.headline` | Claude |
| `displayName` · `tagline` · `description` | **서버 (Persona 카탈로그 48행)** |
| `spendingLevel` · `spendingRatio` · 모든 금액 | **서버 (산술)** |

**모델은 페르소나 이름을 짓지 않습니다.** 축 두 개만 고르고 코드 조합·카탈로그 조회는
서버가 하므로 48종 밖의 페르소나는 나올 수 없습니다.

#### 화면에 어떻게 쓰나

- `ai.headline` 이 있으면 **`tagline` 대신** 띄우세요. `tagline` 은 페르소나 48종 공통 문구이고
  `headline` 은 이 사용자 전용입니다.
- `ai.reason` 은 "왜 이 페르소나인가" 영역에 그대로 넣으면 됩니다. 숫자가 포함돼 있습니다.
- `ai.divergedFromRule: true` 면 규칙과 AI 가 갈린 경우입니다. `ruleBaselineCode` 와 함께
  "단순 1위는 쇼핑이지만 AI 는 배달로 봤습니다" 같은 설명을 붙일 수 있습니다.

#### `generatedBy: "RULE"` 이어도 정상입니다

키가 없거나 호출이 실패하면 각 축의 1위를 그대로 집어 페르소나를 산출하고
`ai.fallbackReason` 에 사유를 담습니다. **페르소나는 항상 나옵니다.**
`ai.reason` / `ai.headline` 이 `null` 이 될 뿐이니, 프론트는 분기하지 말고
`null` 이면 그 영역만 숨기면 됩니다.

> 분류 엔진이 12종을 그대로 내보내므로 **48종 전부 산출 가능**합니다.

---

### ⑤ 절약 목표

#### `GET /saving-goals/suggestions` 🔒

| 쿼리 | 설명 |
|---|---|
| `targetAmount` | 채워야 할 목표액(원). 주면 `autoAllocation` 이 함께 옵니다. 생략하면 null |

**`items` 는 9종만 옵니다** (§12-1). 의료·건강 / 교육 / 여행·숙박은 절약 대상이 아니라
`excludedCategories` 로 이유와 함께 분리됩니다.

> ⚠️ 분류·집계·페르소나 축은 **12종 그대로**입니다. 소비 내역 탭과 페르소나 화면에서는
> 이 3종도 계속 보입니다. 줄어드는 건 슬라이더뿐입니다.

```json
{ "success": true, "data": {
  "monthsCovered": 6,
  "monthlyAvgTotalAmount": 975940,
  "defaultTotalAmount": 209000,
  "allocatableTotalAmount": 678757,   // 9종 상한 합계. 이보다 큰 목표는 불가능
  "items": [
    { "category": "DELIVERY_FOOD", "label": "배달음식",
      "monthlyAvgAmount": 175833,
      "maxAmount": 175833,        // ← 슬라이더 상한. 넘기면 400
      "defaultAmount": 53000,     // 월평균의 30%
      "step": 1000,
      "unitLabel": "끼",
      "unitPriceAmount": 22935,   // 이 사용자의 실제 평균 결제액 (총액 ÷ 건수)
      "defaultUnitCount": 2.3 }   // → 화면에 "(배달음식 약 2.3끼)"
  ],
  "excludedCategories": [
    { "category": "HEALTH_FITNESS", "label": "의료+건강+피트니스",
      "reason": "병원·약국이 포함된 항목이라 절약을 권하지 않습니다." },
    { "category": "EDUCATION", "label": "교육",
      "reason": "자기계발 지출은 줄이라고 권하지 않습니다." },
    { "category": "TRAVEL_STAY", "label": "여행+숙박",
      "reason": "여행 가려고 여행비를 줄이는 건 앞뒤가 맞지 않습니다." }
  ],
  "autoAllocation": null
}}
```

**환산 힌트**: `unitPriceAmount` 는 **이 사용자의 실제 평균 결제액**이라 사람마다 다릅니다
(배달을 2만원씩 시키는 사람과 5천원씩 시키는 사람의 "3.9끼"는 달라야 하니까요).
슬라이더를 움직이면 프론트가 `금액 ÷ unitPriceAmount` 로 다시 계산하세요.
거래가 없으면 `null` 이니 힌트를 숨기면 됩니다.

#### `GET /saving-goals/suggestions?targetAmount=60000` 🔒

화면 S12 의 [✨ 자동 배분] 버튼. **합계가 목표액과 정확히 일치**합니다 — 화면에
`60,000 / 60,000원` 이 그대로 찍히므로 1원이라도 어긋나면 바로 티가 납니다.

```json
{ "success": true, "data": {
  "...": "위와 동일",
  "autoAllocation": {
    "targetAmount": 60000,
    "items": [
      { "category": "DELIVERY_FOOD",     "targetAmount": 16000 },
      { "category": "SHOPPING",          "targetAmount": 12000 },
      { "category": "DINING_OUT",        "targetAmount": 7000 },
      { "category": "TRANSPORT_CAR",     "targetAmount": 7000 },
      { "category": "ALCOHOL_NIGHTLIFE", "targetAmount": 6000 },
      { "category": "SUBSCRIPTION_OTT",  "targetAmount": 5000 },
      { "category": "CONVENIENCE_STORE", "targetAmount": 3000 },
      { "category": "CAFE_SNACK",        "targetAmount": 2000 },
      { "category": "GAME_INAPP",        "targetAmount": 2000 }
    ],
    "allocatedAmount": 60000,
    "shortfallAmount": 0
  }
}}
```

배분 규칙: 월평균이 큰 카테고리가 더 많이 부담하고, 어떤 카테고리도 자기 월평균을 넘지 않으며,
1,000원 단위로 떨어집니다. **`shortfallAmount > 0` 이면 지금 소비 규모로는 그 목표가 불가능**
하다는 뜻이니, 화면은 다른 여행지를 권해야 합니다.

#### `POST /saving-goals` 🔒

```json
// 요청
{ "items": [ { "category": "DELIVERY_FOOD", "targetAmount": 80000 },
             { "category": "SHOPPING",       "targetAmount": 50000 } ] }
```
```json
// 201 — totalTargetAmount 가 T (4주 기준액)
{ "success": true, "data": {
  "id": "cms77qv0f00cgtcc0fmyu15y3",
  "totalTargetAmount": 130000,
  "status": "ACTIVE",
  "createdAt": "2026-07-30T16:49:49.311+09:00",
  "items": [
    { "category": "DELIVERY_FOOD", "label": "배달음식", "targetAmount": 80000,
      "monthlyAvgAmount": 175833, "reductionRate": 0.455 }
  ]
}}
```
```json
// 400 — 어떤 카테고리가 문제인지 details 에 담깁니다 (해당 슬라이더를 짚어주세요)
{ "success": false, "error": {
  "code": "SAVING_GOAL_EXCEEDS_AVERAGE",
  "message": "절약 목표액이 월평균 지출을 초과한 카테고리가 있습니다: 배달음식",
  "details": [ { "category": "DELIVERY_FOOD", "label": "배달음식",
                 "targetAmount": 9999999, "monthlyAvgAmount": 175833 } ]
}}
```

---

### ⑥ 처방 선택 → 목표 배분 → 챌린지 시작

> **§12-2 로 방향이 뒤집혔습니다.** 예전에는 슬라이더로 T 를 정하면 2/4/8주 플랜이 파생됐지만,
> 이제 **여행지가 목표액과 기간을 정합니다.** 화면 흐름 `S10 → S11 → S12` 와 일치합니다.

#### `GET /challenges/plans` 🔒

여행지 5곳이 곧 챌린지 카드입니다. **절약 목표가 없어도 호출됩니다** — S10 은 S12 보다 앞입니다.

| 여행지 | 기간 | 목표액 |
|---|---|---|
| 강진 | 2주 | 60,000원 |
| 보성 | 2주 | 90,000원 |
| 고흥 | 4주 | 130,000원 |
| 고창 | 4주 | 200,000원 |
| 신안 | 8주 | 280,000원 |

```json
{ "success": true, "data": [ {
  "destinationId": "cms7...", "code": "GANGJIN", "name": "강진", "province": "전라남도",
  "heroImageUrl": "…",
  "catchphrase": "지친 위장과 지갑에 휴식을",   // S10 카드의 한 줄 카피
  "tagline": "다산이 18년을 머문 남도의 서재",  // 여행지 자체 설명 (카피와 다름)
  "planType": "SHORT", "label": "2주 챌린지", "weeks": 2,
  "targetSavingAmount": 60000,      // ← 여행지가 정한다. 사용자 입력에서 파생되지 않음
  "expectedSpendAmount": 449148,    // 월평균 × 주수/4.345
  "reductionRate": 0.1336,
  "difficulty": "NORMAL",           // <10% EASY / 10~25% NORMAL / >25% HARD
  "achievable": true,               // ← 이게 false 면 목록에서 빼세요
  "allocatableAmount": 339379,      // 9종 상한 × 주수/4
  "shortfallAmount": 0
} ]}
```

- 응답은 **기간 → 목표액 순**으로 정렬돼 있어 화면의 "2주 / 4주 / 8주" 섹션으로 바로 묶입니다.
- **`achievable: false` 는 목록에서 빼세요.** 화면 문서의 "월평균 총지출을 넘는 챌린지는
  목록에서 아예 제외" 규칙입니다. 판정 기준은 **절약 대상 9종의 기간 환산 상한**입니다.

#### `POST /saving-goals` 🔒 — 고른 여행지의 목표액을 배분

```json
// 요청 — items 합계가 여행지 targetSavingAmount 와 정확히 일치해야 합니다
{ "destinationId": "cms7...",
  "items": [ { "category": "DELIVERY_FOOD", "targetAmount": 16000 },
             { "category": "SHOPPING",      "targetAmount": 12000 } ] }
```
```json
// 201
{ "success": true, "data": {
  "id": "cms7...", "destinationId": "cms7...", "destinationName": "강진", "weeks": 2,
  "totalTargetAmount": 60000, "status": "ACTIVE", "items": [ … ]
}}
```

> ⚠️ `targetAmount` 는 **기간 전체 금액**입니다 (8주 챌린지면 8주 동안 줄일 금액).
> 상한도 기간 환산됩니다 — 2주 챌린지에서 월평균만큼 줄이겠다고 하면 그 기간 예산이
> 음수가 되므로 `SAVING_GOAL_EXCEEDS_AVERAGE` 로 거절합니다.

합계가 목표액과 다르면 `INVALID_REQUEST` (400):

```json
{ "success": false, "error": {
  "code": "INVALID_REQUEST",
  "message": "배분 합계가 목표액과 다릅니다. 강진 목표는 60,000원인데 10,000원이 배분됐습니다.",
  "details": [ { "destinationId": "cms7...", "requiredAmount": 60000,
                 "allocatedAmount": 10000, "differenceAmount": 50000 } ]
}}
```

#### `POST /challenges` 🔒

`{ "destinationId": "cms7..." }` → 201. 응답은 `GET /challenges/current` 와 같은 형태입니다.

기간·목표액은 활성 절약 목표가 가리키는 여행지에서 나옵니다. 보낸 `destinationId` 가
목표의 여행지와 다르면 400 으로 거절합니다 — 프론트가 상태를 잃은 채 엉뚱한 목표로
시작하는 것을 막기 위해서입니다.

- **`baselineAmount` − `periodBudgetAmount` = `periodTargetAmount`** 가 항상 성립합니다.
  예산을 정확히 지키면 목표를 채웁니다.
- **주차 예산 합계 = `budgetTotalAmount`** 가 1원 오차 없이 맞습니다 (잔액은 마지막 주에).

---

### ⑦ 챌린지 진행

#### `GET /challenges/current` 🔒

**상태는 이 API 를 호출하는 시점에 판정됩니다** (백그라운드 스케줄러 없음).

```json
{ "success": true, "data": {
  "id": "cms77qv2500cktcc0l03feokv",
  "planType": "STANDARD", "label": "4주 표준", "weeks": 4,
  "status": "IN_PROGRESS", "difficulty": "NORMAL",
  "targetSavingAmount": 130000,
  "startedAt": "2026-07-30T00:00:00.000+09:00",
  "endsAt":    "2026-08-27T00:00:00.000+09:00",

  "currentSavedAmount": 93617,
  "progressRate": 0.7201,       // clamp(절약/목표, 0, 1)
  "rawProgressRate": 0.7201,    // clamp 안 한 값. 1.0 초과 = 초과 달성
  "elapsedRatio": 0.5,          // 기간 경과 비율
  "daysElapsed": 14, "daysRemaining": 14, "currentWeekNo": 3,

  "byCategory": [
    { "category": "DELIVERY_FOOD", "label": "배달음식",
      "periodBudgetAmount": 95833,    // 기간 전체 예산
      "budgetSoFarAmount": 47917,     // 지금까지 안분된 예산
      "baselineSoFarAmount": 87917,   // 지금까지 안분된 기준 지출
      "spentAmount": 45000,
      "savedAmount": 42917,           // ← 음수 가능
      "isOver": false }               // 프론트는 이걸로 빨강 처리
  ],
  "weeklyProgress": [
    { "weekNo": 1, "startsAt": "…", "endsAt": "…",
      "budgetAmount": 48308, "spentAmount": 45000, "savedAmount": 3308,
      "checkedIn": false, "isCurrent": false, "isPast": true, "isOver": false }
  ]
}}
```

- **진행 중에는 경과 일수만큼 기준 지출을 안분**합니다. 안 그러면 1주차에 "4주치 예산 − 1주치 지출"이 되어 진척률이 터무니없이 높게 나옵니다.
- **`savedAmount` 는 초과 시 음수로 내려갑니다.** 한 카테고리 초과분이 다른 카테고리 절약분을 상쇄해야 정직하기 때문입니다.

#### `POST /challenges/{id}/checkin` 🔒

`{ "weekNo": 1, "note": "1주차 점검" }` → 201 `{ weekNo, budgetAmount, spentAmount, savedAmount, checkedAt, checkedInCount }`

#### `POST /challenges/{id}/complete` 🔒

기간이 남아 있어도 호출할 수 있습니다 (발표에서 결과 화면으로 바로 넘어가기 위함).

```json
{ "success": true, "data": {
  "id": "cms77qv2500cktcc0l03feokv",
  "status": "SUCCEEDED",
  "finalSavedAmount": 255233, "finalProgressRate": 1, "targetSavingAmount": 130000,
  "earnedBadges": [
    { "code": "FIRST_WIN", "displayName": "첫 번째 성공",
      "description": "첫 절약 챌린지를 성공적으로 완주했습니다.",
      "iconKey": "badge-first-win", "tier": "BRONZE" }
  ],
  "issuedCoupons": [
    { "issueCode": "GOHEUNG_SPACE_3000-3FEOKV", "title": "관람료 3,000원 할인",
      "partnerName": "나로우주센터 우주과학관", "validUntil": "2026-12-01T16:49:49.676+09:00" }
  ]
}}
```

재호출해도 **이미 보유한 뱃지·쿠폰은 다시 발급되지 않습니다.**

#### `GET /challenges/history` 🔒 — 커서 페이지네이션

---

### ⑧ 여행 처방

#### `GET /travel/prescriptions` 🔒

```json
{ "success": true, "data": {
  "basisSource": "CHALLENGE",     // CHALLENGE | SAVING_GOAL | NONE
  "basisSavedAmount": 291617,     // 여행지 후보를 고른 기준 금액
  "currentSavedAmount": 255233,
  "progressRate": 1,              // ← 사진 블러 해제 비율과 동일
  "destinations": [ {
    "id": "…", "code": "BOSEONG", "name": "보성", "province": "전라남도", "regionCode": "46780",
    "extinctionRiskIndex": 0.142, "riskGrade": "소멸고위험",
    "tagline": "초록이 끝까지 이어지는 차밭의 도시",
    "summary": "…", "description": "…", "heroImageUrl": "https://images.yaho.kr/…",
    "targetSavingAmount": 90000, "recommendedNights": 1,
    "routes": [ {                                  // ← 여행지마다 정확히 2개
      "id": "…", "title": "보성 초록 힐링 코스", "theme": "HEALING", "summary": "…",
      "totalEstimatedAmount": 44000, "totalDurationMinutes": 295,
      "stops": [ { "sortOrder": 1, "placeName": "대한다원", "description": "…",
                   "stopType": "SIGHT", "stayMinutes": 100, "estimatedAmount": 4000 } ]
    } ],
    "photos": [ { "id": "…", "imageUrl": "https://images.yaho.kr/destinations/boseong/1.jpg",
                  "caption": "대한다원 계단식 차밭", "revealOrder": 1, "blurred": false } ],
    "revealedPhotoCount": 6,
    "reviewSummary": { "avgRating": 4.6, "count": 5 }
  } ],
  "lockedDestinations": [ {
    "id": "…", "code": "SINAN", "name": "신안", "province": "전라남도",
    "tagline": "1004개의 섬, 색으로 칠해진 바다",
    "heroImageUrl": "…", "targetSavingAmount": 280000,
    "shortfallAmount": 50000          // ← "5만원만 더 아끼면" 동기 부여
  } ]
}}
```

**블러 정책**
- 공개 장수 = `ceil(progressRate × 전체 장수)`, `revealOrder` 앞선 것부터
- **블러된 사진도 `imageUrl` 은 항상 내려갑니다.** 프론트가 `blurred` 로 CSS 블러를 걸어주세요. 서버가 URL 을 숨기면 진척률이 바뀔 때마다 이미지를 다시 받아야 해서 해제 연출이 끊깁니다.
- 목표·챌린지가 없어도 **에러가 아닙니다** (`basisSource: "NONE"`). 전부 `lockedDestinations` 로 내려가 화면이 항상 렌더됩니다.

#### `GET /travel/destinations/{id}` 🔒 · `GET /travel/destinations/{id}/reviews` 🔒

리뷰는 도움된 순 정렬, 커서 페이지네이션.

---

### ⑨ AI 여행코스 (Claude API)

#### `POST /travel/destinations/{destinationId}/ai-course` 🔒

**현재 페르소나에 맞춘 하루 코스를 Claude 가 생성합니다.** 이 백엔드에서 유일하게 LLM 을
호출하는 지점입니다.

| 쿼리 | 기본값 | 설명 |
|---|---|---|
| `refresh` | `false` | `true` 면 캐시를 무시하고 새로 생성 |

**선행 조건**: `POST /persona/evaluate` 로 페르소나가 있어야 합니다 (없으면 `422 NO_PERSONA`).

**역할 분담** — 프론트가 "이 숫자는 믿어도 되나" 를 판단할 수 있어야 하므로 명시합니다.

| 항목 | 생성 주체 |
|---|---|
| 경유지 선택 · 방문 순서 | Claude |
| `title` `summary` `personaFitReason` `budgetNote` `activity` `personaTip` `packingTips` | Claude |
| `estimatedAmount` `stayMinutes` `latitude` `longitude` | **시드 데이터 그대로** |
| `arrivalTime` `travelMinutesFromPrevious` `total*` `remainingBudgetAmount` | **서버 산술** |

경유지는 해당 여행지의 시드 경유지 중에서만 고릅니다. 모델이 목록에 없는 장소를 만들어내면
서버가 걸러내고, 남은 경유지가 3곳 미만이면 폴백으로 전환합니다.

응답 (실제 캡처, 경유지 6곳 중 2곳만 발췌):

```json
{
  "success": true,
  "data": {
    "id": "cms7eii7a02kotcdc4048doc1",
    "destinationId": "cms7e9jt900rbtcvcfmcucbwu",
    "destinationName": "강진",
    "title": "저녁이 길어지는 강진",
    "summary": "낮에는 다산의 숲길, 저녁에는 한정식과 갈대밭 노을로 하루를 닫습니다.",
    "personaFitReason": "저녁 시간에 배달앱을 켜며 하루를 마무리하시던 리듬을 그대로 살려, 오후부터 저녁까지 밀도가 높은 코스로 짰습니다. 배달로 흩어졌던 저녁 한 끼를 남도 한정식 한 상으로 모으고, 식후에는 갈대밭을 걸으며 소화시키는 순서로 배치했습니다. 화면을 보며 앉아 있던 저녁 대신, 걷고 앉고 바라보는 저녁이 됩니다.",
    "budgetNote": "월 배달비 정도를 한 달 아끼신 금액으로 입장료와 식사, 카페까지 여유 있게 감당되는 하루입니다.",
    "packingTips": [
      "숲길용 편한 운동화",
      "해질녘 바람막이 한 장",
      "한정식 남은 반찬 담을 통"
    ],
    "startTime": "10:00",
    "endTime": "17:10",
    "totalEstimatedAmount": 36000,
    "totalDurationMinutes": 430,
    "budgetAmount": 130000,
    "remainingBudgetAmount": 94000,
    "stops": [
      {
        "sortOrder": 1,
        "placeName": "백련사",
        "stopType": "SIGHT",
        "arrivalTime": "10:00",
        "stayMinutes": 60,
        "estimatedAmount": 0,
        "travelMinutesFromPrevious": 0,
        "activity": "동백숲을 지나 천년 고찰 마당을 천천히 둘러봅니다.",
        "personaTip": "휴대폰은 주머니에 두고 숲 소리만 들어 보세요.",
        "latitude": 34.6297,
        "longitude": 126.7053
      },
      {
        "sortOrder": 2,
        "placeName": "다산초당 뿌리길",
        "stopType": "ACTIVITY",
        "arrivalTime": "11:10",
        "stayMinutes": 50,
        "estimatedAmount": 0,
        "travelMinutesFromPrevious": 10,
        "activity": "정약용이 오갔던 800m 숲길을 걸어 초당으로 넘어갑니다.",
        "personaTip": "저녁 산책을 낮으로 옮겨 놓은 구간입니다.",
        "latitude": 34.6285,
        "longitude": 126.7
      }
    ],
    "meta": {
      "generatedBy": "CLAUDE",
      "model": "claude-opus-5",
      "fallbackReason": null,
      "cached": false,
      "latencyMs": 16885,
      "personaCode": "EVENING_DELIVERY_FOOD",
      "generatedAt": "2026-07-30T19:59:16.769+09:00"
    }
  }
}
```

**실패해도 200 입니다.** API 키가 없거나 타임아웃·거절·검증 실패가 나면 시드 루트를 재구성한
코스가 **완전히 같은 형태로** 내려갑니다. 프론트는 분기할 필요 없이 `meta` 만 보면 됩니다.

```json
{ "meta": {
  "generatedBy": "FALLBACK",
  "model": "seed-route",
  "fallbackReason": "OVERLOADED",
  "cached": false, "latencyMs": 0,
  "personaCode": "EVENING_DELIVERY_FOOD",
  "generatedAt": "2026-07-30T19:41:02.118+09:00"
} }
```

| `fallbackReason` | 뜻 |
|---|---|
| `DISABLED` | 키 없음 또는 `AI_COURSE_ENABLED=false` |
| `TIMEOUT` | 제한 시간 초과 |
| `RATE_LIMITED` | 429 |
| `OVERLOADED` | 529 — Anthropic 쪽 일시 과부하 |
| `AUTH_FAILED` | 키가 유효하지 않음 |
| `REFUSED` | 모델이 요청을 거절 |
| `MAX_TOKENS` | 응답이 잘려 JSON 불완전 |
| `BAD_JSON` | 파싱 실패 |
| `API_ERROR` | 그 외 |
| `INVALID_COURSE` | 검증 실패 (후보 밖 장소만 골랐을 때 등) |

**캐시**: `(사용자 · 여행지 · 페르소나)` 조합으로 캐시합니다. **폴백은 캐시하지 않습니다** —
일시적인 529 한 번에 시드 루트가 영구히 고정되지 않도록, 다음 호출에서 자동 재시도합니다.
재생성해도 `id` 는 유지되므로 앞서 받은 courseId 로 지도를 계속 열 수 있습니다.

#### `GET /travel/destinations/{destinationId}/ai-course` 🔒

이미 생성해 둔 코스만 돌려줍니다. **조회가 생성을 유발하지 않습니다** — 화면 진입마다
API 가 과금되면 안 되기 때문입니다. 만든 적이 없으면 `404 NOT_FOUND`.

응답 본문은 POST 와 동일하며 `meta.cached: true` 입니다.

---

### ⑩ 지도 (상태바 "지도" 탭)

특정 지도 SDK 에 묶이지 않습니다. 위경도 · 경계상자 · 중심점 · 구간 거리만 내려주므로
카카오맵 `map.setBounds()`, 네이버맵, Leaflet `fitBounds()` 어디에나 그대로 들어갑니다.

> ⚠️ 좌표는 공개 정보를 옮겨 적은 **근사값**입니다. 핀 표시용이며 내비게이션 목적지로는
> 부정확할 수 있습니다. `distanceKm` 는 **직선거리**로, 실제 도로 주행거리는 20~40% 더 깁니다.
> 화면에도 "직선거리"라고 표기해 주세요.

#### `GET /travel/map` 🔒

지도 탭 진입 화면. **잠긴 여행지도 포함**해서 내려줍니다 — 사라지면 "얼마를 더 아끼면
갈 수 있는지" 를 보여줄 자리가 없어집니다.

기준 절약액은 `/travel/prescriptions` 와 **같은 규칙**(챌린지 → 절약목표 → 0)을 씁니다.

실제 캡처 (마커 5개 중 2개만 발췌):

```json
{
  "success": true,
  "data": {
    "viewport": {
      "bounds": {
        "north": 35.435,
        "south": 34.611,
        "east": 127.285,
        "west": 126.351
      },
      "center": {
        "latitude": 35.023,
        "longitude": 126.818
      }
    },
    "destinations": [
      {
        "id": "cms7e9jtv00rztcvclueylvre",
        "code": "BOSEONG",
        "name": "보성",
        "province": "전라남도",
        "tagline": "초록이 끝까지 이어지는 차밭의 도시",
        "latitude": 34.7714,
        "longitude": 127.08,
        "riskGrade": "소멸고위험",
        "targetSavingAmount": 90000,
        "unlocked": true,
        "shortfallAmount": 0,
        "routeCount": 2,
        "hasAiCourse": false
      },
      {
        "id": "cms7e9jv600t9tcvcdkbiiuj8",
        "code": "GOCHANG",
        "name": "고창",
        "province": "전라북도",
        "tagline": "가을이면 분홍으로 물드는 청보리밭의 고장",
        "latitude": 35.435,
        "longitude": 126.702,
        "riskGrade": "소멸고위험",
        "targetSavingAmount": 200000,
        "unlocked": true,
        "shortfallAmount": 0,
        "routeCount": 2,
        "hasAiCourse": false
      }
    ],
    "unlockedCount": 3,
    "missingCoordinateCount": 0,
    "basisSavedAmount": 130000,
    "basisSource": "CHALLENGE"
  }
}
```

| 필드 | 프론트에서 쓰는 법 |
|---|---|
| `viewport.bounds` | fitBounds 에 그대로 |
| `viewport.center` | 마커 평균이 아니라 **경계상자의 중심**. 마커가 몰려도 외곽이 안 밀린다 |
| `unlocked: false` | 마커를 흐리게 + `shortfallAmount` 표시 |
| `hasAiCourse: true` | 탭하면 바로 AI 코스를 열 수 있다 |
| `missingCoordinateCount` | 0 이 아니면 좌표 없는 항목이 빠진 것. 정상은 항상 0 |

#### `GET /travel/routes/{routeId}/map` 🔒

시드 루트 하나의 지도. `stops` 를 `sortOrder` 순으로 이으면 그것이 폴리라인입니다.

실제 캡처 (경유지 5곳 중 2곳, 구간 4개 중 1개만 발췌):

```json
{
  "success": true,
  "data": {
    "id": "cms7e9jth00rjtcvc7wwync95",
    "kind": "SEED_ROUTE",
    "title": "강진 다산 사색 코스",
    "destinationId": "cms7e9jt900rbtcvcfmcucbwu",
    "destinationName": "강진",
    "viewport": {
      "bounds": {
        "north": 34.642,
        "south": 34.539,
        "east": 126.768,
        "west": 126.696
      },
      "center": {
        "latitude": 34.5905,
        "longitude": 126.732
      }
    },
    "stops": [
      {
        "sortOrder": 1,
        "placeName": "백련사",
        "stopType": "SIGHT",
        "latitude": 34.6297,
        "longitude": 126.7053,
        "stayMinutes": 60,
        "estimatedAmount": 0,
        "arrivalTime": null
      },
      {
        "sortOrder": 2,
        "placeName": "다산초당 뿌리길",
        "stopType": "ACTIVITY",
        "latitude": 34.6285,
        "longitude": 126.7,
        "stayMinutes": 50,
        "estimatedAmount": 0,
        "arrivalTime": null
      }
    ],
    "legs": [
      {
        "fromSortOrder": 1,
        "toSortOrder": 2,
        "fromPlaceName": "백련사",
        "toPlaceName": "다산초당 뿌리길",
        "distanceKm": 0.5
      }
    ],
    "totalDistanceKm": 20.33,
    "totalEstimatedAmount": 36000,
    "missingCoordinateCount": 0
  }
}
```

#### `GET /travel/ai-courses/{courseId}/map` 🔒

AI 코스의 지도. **루트 지도와 응답 형태가 같습니다.** 차이는 `kind` 값과 `arrivalTime` 이
채워진다는 것뿐이라 같은 컴포넌트로 둘 다 그릴 수 있습니다.

본인이 만든 코스만 조회할 수 있습니다 (남의 코스는 존재 여부를 흘리지 않기 위해 동일하게 404).

실제 캡처 (경유지 6곳 중 2곳, 구간 5개 중 1개만 발췌):

```json
{
  "success": true,
  "data": {
    "id": "cms7eii7a02kotcdc4048doc1",
    "kind": "AI_COURSE",
    "title": "저녁이 길어지는 강진",
    "destinationId": "cms7e9jt900rbtcvcfmcucbwu",
    "destinationName": "강진",
    "viewport": {
      "bounds": {
        "north": 34.642,
        "south": 34.539,
        "east": 126.768,
        "west": 126.696
      },
      "center": {
        "latitude": 34.5905,
        "longitude": 126.732
      }
    },
    "stops": [
      {
        "sortOrder": 1,
        "placeName": "백련사",
        "stopType": "SIGHT",
        "latitude": 34.6297,
        "longitude": 126.7053,
        "stayMinutes": 60,
        "estimatedAmount": 0,
        "arrivalTime": "10:00"
      },
      {
        "sortOrder": 2,
        "placeName": "다산초당 뿌리길",
        "stopType": "ACTIVITY",
        "latitude": 34.6285,
        "longitude": 126.7,
        "stayMinutes": 50,
        "estimatedAmount": 0,
        "arrivalTime": "11:10"
      }
    ],
    "legs": [
      {
        "fromSortOrder": 1,
        "toSortOrder": 2,
        "fromPlaceName": "백련사",
        "toPlaceName": "다산초당 뿌리길",
        "distanceKm": 0.5
      }
    ],
    "totalDistanceKm": 25.48,
    "totalEstimatedAmount": 36000,
    "missingCoordinateCount": 0
  }
}
```

---

### ⑪ 보상

#### `GET /rewards/badges` 🔒

수집형이므로 **미보유 항목도 전부** 내려갑니다.

```json
{ "success": true, "data": {
  "earnedCount": 3, "totalCount": 10,
  "badges": [
    { "code": "FIRST_WIN", "displayName": "첫 번째 성공", "description": "…",
      "iconKey": "badge-first-win", "tier": "BRONZE",
      "earned": true, "earnedAt": "2026-09-02T16:49:49.657+09:00",
      "progress": [] },
    { "code": "CHALLENGER_3", "displayName": "도전하는 사람", "description": "…",
      "iconKey": "badge-challenger-3", "tier": "BRONZE",
      "earned": false, "earnedAt": null,
      "progress": [ { "ruleType": "CHALLENGE_COUNT", "label": "챌린지 3회 완료",
                      "current": 1, "threshold": 3, "rate": 0.3333 } ] }
  ]
}}
```

#### `GET /rewards/coupons` 🔒 — `?status=ISSUED|USED|EXPIRED`

```json
{ "success": true, "data": [ {
  "issueCode": "SINAN_PURPLE_25-3FEOKV",
  "title": "숙박 25% 할인", "partnerName": "퍼플섬 게스트하우스",
  "description": "신안 퍼플섬 인근 제휴 게스트하우스 25% 할인",
  "discountType": "RATE",      // RATE = 퍼센트, AMOUNT = 원
  "discountValue": 25,
  "minSpendAmount": 40000, "maxDiscountAmount": 40000,
  "status": "ISSUED",
  "validFrom": "2026-09-02T16:49:49.676+09:00",
  "validUntil": "2026-11-01T16:49:49.676+09:00",
  "daysLeft": 60,
  "destination": { "id": "…", "name": "신안" }
} ]}
```

만료된 쿠폰은 **이 API 를 호출하는 시점에** `EXPIRED` 로 정리됩니다.

---

## 3. demo 엔드포인트 (발표 전용)

`DEMO_MODE=true` 일 때만 등록됩니다. `false` 면 라우트가 존재하지 않고(404) Swagger 에도 없습니다.

#### `POST /demo/fast-forward` 🔒

```json
// 요청 — 누적됩니다. 음수로 되감기 가능
{ "days": 30 }
```
```json
{ "success": true, "data": {
  "clockOffsetDays": 34,
  "virtualNow": "2026-09-02T16:49:49.579+09:00",
  "realNow":    "2026-07-30T16:49:49.579+09:00",
  "challenge": { "id": "…", "status": "SUCCEEDED", "progressRate": 1,
                 "currentSavedAmount": 255233, "daysRemaining": 0 }
}}
```

#### `POST /demo/simulate-spending` 🔒

```json
// 요청
{ "category": "SHOPPING", "amount": 23000, "daysAgo": 4 }
```
```json
{ "success": true, "data": {
  "transactionId": "cms77qv5600d2tcc0gkibltpa",
  "approvedAt": "2026-08-09T16:49:49.481+09:00",
  "merchantName": "무신사", "amount": 23000, "category": "SHOPPING",
  "challenge": { "id": "…", "status": "IN_PROGRESS", "progressRate": 0.7201,
                 "currentSavedAmount": 93617, "daysRemaining": 14 }
}}
```

#### `POST /demo/reset` 🔒

```json
{ "success": true, "data": {
  "resetAt": "2026-07-30T16:49:49.784+09:00",
  "removedTransactions": 423, "removedConnections": 4, "removedChallenges": 1,
  "removedBadges": 3, "removedCoupons": 3,
  "clockOffsetDaysBefore": 34,
  "preserved": "가상 금융 DB(mock_*)와 참조 데이터…는 보존됩니다."
}}
```

---

## 4. 화면 순서대로 본 호출 시퀀스

```
0  준비        POST /demo/reset                     ← 리허설 반복 시

1  온보딩      POST /auth/login                     → accessToken 저장
              GET  /auth/me                        → has* 로 진입 화면 결정

2  연동        GET  /connections/institutions
              POST /connections            × 4     → 계좌 자동 등록 (150~400ms 지연)

3  소비 분석   POST /transactions/sync              → { imported:424, classified:405, needsReview:19 }
                                                   ★ Claude 가맹점 분류 (약 14초, 로딩 필요)
              GET  /transactions/pending-review    → 19건이 8개 질문으로
              PATCH /transactions/{id}/category    → alsoUpdatedCount 로 "N건 정리됨"
              POST /transactions/review/bulk       → 남은 것 일괄 확정
              GET  /analysis/summary               → 도넛 + 추이 + 시간대

4  페르소나    GET  /analysis/top-category
              POST /persona/evaluate               → "혈당스파이크 취침형"
                                                   ★ Claude 축 선정 (약 7초) + 개인화 문구

5  처방 선택   GET  /challenges/plans               → 여행지 5곳 카드 (기간·목표액 고정)
              ※ 절약 목표가 없어도 호출됩니다 — S10 이 S12 보다 앞입니다
                 achievable:false 인 카드는 목록에서 빼세요

6  목표 배분   GET  /saving-goals/suggestions       → 슬라이더 9종 + 환산 힌트
              GET  /saving-goals/suggestions?targetAmount=200000
                                                   → 자동 배분 (합계 정확히 일치)
              POST /saving-goals {destinationId}   → 배분 저장 (합계 = 목표액)
              POST /challenges   {destinationId}   → 챌린지 시작

7  진행        POST /demo/fast-forward {days:14}    ★ 시계 점프
              POST /demo/simulate-spending × 2     ★ 진척 100% → 72%
              GET  /challenges/current             → 진척 게이지
              GET  /travel/prescriptions           → 사진 5/6장 공개 (예고편)
              POST /challenges/{id}/checkin

8  여행 처방   POST /demo/fast-forward {days:20}    ★ 종료일 통과 → SUCCEEDED
              GET  /travel/prescriptions           → 블러 전부 해제
              GET  /travel/destinations/{id}/reviews

9  AI 코스     POST /travel/destinations/{id}/ai-course
                                                   → Claude 가 페르소나 맞춤 코스 생성 (15~20초)
              GET  /travel/destinations/{id}/ai-course
                                                   → 재조회는 캐시 (meta.cached: true)

10 지도        GET  /travel/map                     → 여행지 마커 + 해금/잠김 + 경계상자
              GET  /travel/ai-courses/{id}/map     → 코스 마커 + 구간 직선거리

11 보상        POST /challenges/{id}/complete       → 뱃지 3개 + 쿠폰 3장
              GET  /rewards/badges                 → 3/10, 잠긴 칸에 진행도
              GET  /rewards/coupons
```

> ⑦의 `simulate-spending` 을 건너뛰면 진척률이 곧장 100% 가 됩니다. 시드 거래가 챌린지
> 시작 전날까지만 있어서 "지출 0원 = 절약 만점"이 되기 때문입니다 (산술적으로는 맞습니다).

> ⑨의 첫 호출은 **15~20초** 걸립니다 (Claude API 왕복). 발표에서 기다리기 부담스러우면
> ⑧ 직후에 미리 호출해 캐시를 채워 두세요 — 이후 조회는 20ms 안에 끝납니다.
> 네트워크가 끊겨도 폴백 코스가 같은 형태로 내려오므로 화면은 비지 않습니다.

> **Claude 를 타는 호출은 ③ · ④ · ⑨ 셋입니다** (약 14초 / 7초 / 20초).
> 셋 다 실패해도 **200/201 로 규칙 기반 결과가 같은 형태로** 내려오므로 프론트는 분기가
> 필요 없습니다. 어느 경로였는지는 각각 `classificationSource` · `ai.generatedBy` ·
> `meta.generatedBy` 로 알 수 있으니 배지만 다르게 붙이세요.
>
> 오프라인 리허설이 필요하면 서버의 `AI_CLASSIFY_ENABLED` / `AI_PERSONA_ENABLED` /
> `AI_COURSE_ENABLED` 를 `false` 로 두면 됩니다 — 각각 1.1초 / 0.05초 / 즉시로 끝나고
> 화면 구성은 완전히 같습니다.
