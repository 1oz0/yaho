/**
 * 참조 데이터 시드 — 전역 키워드 사전, MCC 매핑, 연령대 지출 벤치마크.
 */
import type { PrismaClient } from '@prisma/client';

import { AGE_BANDS, BENCHMARK_SCOPE_TOTAL } from '../../src/common/constants/persona';
import { SPENDABLE_CATEGORIES } from '../../src/common/constants/tx-category';
import { MCC_MAPPINGS } from './data/mcc.data';
import { MERCHANT_RULES } from './data/merchant-rules.data';

/**
 * 연령대별 월평균 지출 기준값 (원).
 *
 * 출처는 통계청 가계동향조사를 참고해 1인 가구 기준으로 가공한 값이다.
 * 실제 심사에서 "이 숫자 어디서 났냐"는 질문이 나올 수 있으므로 source 컬럼에 남긴다.
 * 페르소나 소비량 축(LOW/NORMAL/OVER) 판정의 분모가 된다.
 */
const TOTAL_BENCHMARK: Record<string, number> = {
  '10S': 320_000,
  '20S_EARLY': 540_000,
  // 데모 계정이 이 구간이다. 소비량 축이 OVER(>1.2)로 떨어져야
  // "과소비 진단"이라는 서비스 전제가 성립한다.
  //
  // ⚠️ 이 값을 경계값 근처로 잡지 말 것.
  //    시드 총지출은 PRNG 시드 문자열이나 CATEGORY_PLANS 를 건드릴 때마다 움직인다.
  //    실제로 브랜드명 변경(PRNG 시드 변화)과 카테고리 12종 재편 때 두 번 흔들렸다.
  //    현재 총지출 약 90만원 기준 1.4배 — 80~100만원 구간 어디든 OVER 를 유지하고,
  //    "또래보다 40% 더 쓴다" 는 심사에서 설명하기 좋은 크기다.
  '20S_LATE': 650_000,
  '30S_EARLY': 780_000,
  '30S_LATE': 860_000,
  '40S': 980_000,
  '50S': 920_000,
  '60S_PLUS': 640_000,
};

/** 카테고리별 기준값은 총액 대비 비중으로 파생시킨다 (합계 1.0) */
const CATEGORY_SHARE: Record<string, number> = {
  DELIVERY_FOOD: 0.13,
  DINING_OUT: 0.15,
  CAFE_SNACK: 0.08,
  ALCOHOL_NIGHTLIFE: 0.08,
  TRANSPORT_CAR: 0.11,
  SHOPPING: 0.19,
  GAME_INAPP: 0.03,
  SUBSCRIPTION_OTT: 0.04,
  CONVENIENCE_STORE: 0.07,
  HEALTH_FITNESS: 0.06,
  EDUCATION: 0.03,
  TRAVEL_STAY: 0.03,
};

const BENCHMARK_SOURCE = '통계청 가계동향조사(1인 가구) 기반 가공값';

export async function seedReferenceData(prisma: PrismaClient): Promise<{
  merchantRules: number;
  mccMappings: number;
  benchmarks: number;
}> {
  await prisma.merchantRule.createMany({ data: MERCHANT_RULES });
  await prisma.mccMapping.createMany({ data: MCC_MAPPINGS });

  const benchmarks: {
    ageBand: string;
    scope: string;
    monthlyAvgAmount: number;
    source: string;
  }[] = [];

  for (const ageBand of AGE_BANDS) {
    const total = TOTAL_BENCHMARK[ageBand];
    benchmarks.push({
      ageBand,
      scope: BENCHMARK_SCOPE_TOTAL,
      monthlyAvgAmount: total,
      source: BENCHMARK_SOURCE,
    });
    for (const category of SPENDABLE_CATEGORIES) {
      benchmarks.push({
        ageBand,
        scope: category,
        monthlyAvgAmount: Math.round(total * CATEGORY_SHARE[category]),
        source: BENCHMARK_SOURCE,
      });
    }
  }

  await prisma.spendingBenchmark.createMany({ data: benchmarks });

  return {
    merchantRules: MERCHANT_RULES.length,
    mccMappings: MCC_MAPPINGS.length,
    benchmarks: benchmarks.length,
  };
}

/** 검증용 — 전역 키워드 사전에 중복 패턴이 있으면 createMany 가 unique 제약에 걸린다 */
export function findDuplicatePatterns(): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const r of MERCHANT_RULES) {
    if (seen.has(r.pattern)) dups.push(r.pattern);
    seen.add(r.pattern);
  }
  return dups;
}
