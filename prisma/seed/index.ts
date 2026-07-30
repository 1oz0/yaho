/**
 * 시드 진입점.
 *
 *   npm run db:seed
 *
 * 전체를 지우고 다시 채운다. 리허설을 몇 번 반복해도 같은 결과가 나온다.
 *
 * 시간 앵커
 *   시드 실행 시각의 **KST 자정**을 앵커로 잡고 모든 날짜를 상대 생성한다.
 *   금액은 고정 시드 PRNG 로 재현되므로, 같은 날 재시드하면 100% 동일한 데이터가 나온다.
 *   (docs/design.md §1-③)
 */
// ⚠️ 반드시 최상단. ts-node 는 .env 를 자동으로 읽지 않는다.
// 이걸 빠뜨리면 .env 의 DEMO_USER_PASSWORD 를 바꿔도 시드는 아래 폴백 값을 쓰고,
// 발표 당일 "비밀번호가 틀렸다"는 상황이 조용히 만들어진다.
import * as dotenv from 'dotenv';
dotenv.config();

import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

import { PERSONA_CATEGORIES } from '../../src/common/constants/persona-category';
import {
  kstDateKey,
  lastNCompleteMonths,
  startOfKstDay,
  toKstIso,
} from '../../src/common/utils/date-kst';
import { formatWon } from '../../src/common/utils/money';
import { BADGE_COUNT, seedBadges } from './badges';
import { ACCOUNT_COUNT, INSTITUTION_COUNT, seedInstitutions } from './institutions';
import { EXPECTED_PERSONA_COUNT, seedPersonas } from './personas';
import { findDuplicatePatterns, seedReferenceData } from './reference';
import { seedTransactions } from './transactions';
import { seedTravel } from './travel';
import { SeedVerifier } from './verify';

const prisma = new PrismaClient();

/** 고정 PRNG 시드. 이 값을 바꾸지 않는 한 거래 금액은 영원히 동일하다. */
const PRNG_SEED = 'yaho-2026-honam-hackathon';
const SEED_VERSION = 'v1';

const DEMO_USER = {
  email: process.env.DEMO_USER_EMAIL ?? 'demo@yaho.kr',
  password: process.env.DEMO_USER_PASSWORD ?? 'yaho1234',
  name: '김하늘',
  ageBand: '20S_LATE', // 20대 후반
  regionCode: '29', // 광주광역시
};

const PROVIDER_LOGIN = {
  loginId: 'yaho',
  password: process.env.MOCK_PROVIDER_PASSWORD ?? '1234',
  ownerName: DEMO_USER.name,
};

/** 도메인 테이블을 자식 → 부모 순으로 비운다 */
async function truncateAll(): Promise<void> {
  await prisma.$transaction([
    prisma.aiTravelCourseStop.deleteMany(),
    prisma.aiTravelCourse.deleteMany(),
    prisma.issuedCoupon.deleteMany(),
    prisma.userBadge.deleteMany(),
    prisma.challengeCheckIn.deleteMany(),
    prisma.challengeWeekBudget.deleteMany(),
    prisma.challengeWeek.deleteMany(),
    prisma.challengeCategoryBudget.deleteMany(),
    prisma.challenge.deleteMany(),
    prisma.savingGoalItem.deleteMany(),
    prisma.savingGoal.deleteMany(),
    prisma.userPersona.deleteMany(),
    prisma.userMerchantRule.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.linkedAccount.deleteMany(),
    prisma.connection.deleteMany(),
    prisma.user.deleteMany(),

    prisma.coupon.deleteMany(),
    prisma.badgeRule.deleteMany(),
    prisma.badge.deleteMany(),
    prisma.travelReview.deleteMany(),
    prisma.travelPhoto.deleteMany(),
    prisma.routeStop.deleteMany(),
    prisma.travelRoute.deleteMany(),
    prisma.travelDestination.deleteMany(),
    prisma.persona.deleteMany(),
    prisma.spendingBenchmark.deleteMany(),
    prisma.mccMapping.deleteMany(),
    prisma.merchantRule.deleteMany(),

    prisma.mockTransaction.deleteMany(),
    prisma.mockAccount.deleteMany(),
    prisma.mockUserCredential.deleteMany(),
    prisma.mockInstitution.deleteMany(),

    prisma.demoState.deleteMany(),
  ]);
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  // 시드 스크립트는 ClockService 를 쓸 수 없으므로 여기서만 실제 시각을 읽는다.
  const anchor = startOfKstDay(new Date());

  console.log('\n야호 시드 시작');
  console.log(`  앵커(KST 자정)  ${toKstIso(anchor)}`);
  console.log(`  PRNG 시드       "${PRNG_SEED}"`);

  const dupPatterns = findDuplicatePatterns();
  if (dupPatterns.length > 0) {
    throw new Error(`전역 키워드 사전에 중복 패턴이 있습니다: ${dupPatterns.join(', ')}`);
  }

  console.log('\n  [1/6] 기존 데이터 삭제');
  await truncateAll();

  console.log('  [2/6] 데모 사용자');
  const user = await prisma.user.create({
    data: {
      email: DEMO_USER.email,
      passwordHash: await bcrypt.hash(DEMO_USER.password, 8),
      name: DEMO_USER.name,
      ageBand: DEMO_USER.ageBand,
      regionCode: DEMO_USER.regionCode,
    },
  });

  console.log('  [3/6] 가상 금융기관 · 계좌');
  const institutions = await seedInstitutions(prisma, PROVIDER_LOGIN);

  console.log('  [4/6] 가상 거래 내역');
  const tx = await seedTransactions(prisma, institutions.accounts, anchor, PRNG_SEED);

  console.log('  [5/6] 참조 데이터 (키워드 사전 · MCC · 벤치마크 · 페르소나)');
  const reference = await seedReferenceData(prisma);
  const personaCount = await seedPersonas(prisma);

  console.log('  [6/6] 여행지 · 뱃지 · 쿠폰');
  const travel = await seedTravel(prisma, anchor);
  const badges = await seedBadges(prisma);

  await prisma.demoState.create({
    data: { id: 'singleton', clockOffsetDays: 0, seededAt: anchor, seedVersion: SEED_VERSION },
  });

  // ---------------------------------------------------------------------------
  // 검증 — 프롬프트 §4-3 이 요구한 소비 패턴이 실제로 만들어졌는가
  // ---------------------------------------------------------------------------
  const v = new SeedVerifier();
  const completeMonths = lastNCompleteMonths(anchor, 6);

  v.expectRange('총 거래 건수', tx.total, 350, 450);
  v.expectRange(
    '월평균 거래 건수',
    Math.round(tx.total / tx.monthKeys.length),
    55,
    75,
  );
  v.expectAmountAtLeast('배달 월평균 지출', tx.deliveryMonthlyAvgAmount, 150_000);
  v.expectRange('구독 서비스 종류', tx.subscriptionCount, 3, 4, '종');
  v.expectAtLeast('정기결제 가맹점 종류', tx.recurringMerchantCount, 4, '종');
  v.expectRange('분류 불가 거래', tx.unclassifiableCount, 12, 20);
  v.expectRange('취소 거래', tx.cancelCount, 2, 3);
  v.expectRange('월급 입금(TRANSFER_IN)', tx.salaryCount, 6, 7);
  v.expectAtLeast('본인 계좌 간 이체', tx.internalTransferCount, 5);
  v.expectEqual('완결 월 수', completeMonths.length, 6, '개월');
  v.expectEqual('페르소나 카탈로그', personaCount, EXPECTED_PERSONA_COUNT, '행');
  v.expectEqual('가상 금융기관', INSTITUTION_COUNT, 6, '곳');
  v.expectEqual('연동 가능 계좌', ACCOUNT_COUNT, 4, '개');
  v.expectAtLeast('전역 키워드 사전', reference.merchantRules, 150, '개');
  v.expectAtLeast('MCC 매핑', reference.mccMappings, 30, '개');
  v.expectEqual('여행지', travel.destinations, 5, '곳');
  v.expectEqual('여행 루트', travel.routes, 10, '개'); // 5곳 × 2개
  v.expectAtLeast('여행지 리뷰', travel.reviews, 15, '건');
  v.expectEqual('뱃지', badges.badges, BADGE_COUNT, '종');

  // 지도 탭은 좌표가 하나라도 비면 핀이 조용히 사라진다. 여기서 전수 확인한다.
  const destWithoutCoords = await prisma.travelDestination.count({ where: { latitude: null } });
  const stopWithoutCoords = await prisma.routeStop.count({ where: { latitude: null } });
  v.expectEqual('좌표 없는 여행지', destWithoutCoords, 0, '곳');
  v.expectEqual('좌표 없는 경유지', stopWithoutCoords, 0, '개');
  v.expectAtLeast('지도 마커(경유지)', travel.stops, 60, '개');

  // --- 1박 2일 구조 (§12-3) --------------------------------------------------
  // 루트마다 Day1·Day2가 모두 있고 숙소가 정확히 하나여야 한다.
  // travel.ts 의 assertItineraryShape 가 시드 데이터를 검증하지만, 여기서는 **DB 에 실제로
  // 들어간 결과**를 다시 본다 (매핑 실수로 dayNumber 가 전부 1이 되는 사고를 잡는다).
  const day1 = await prisma.routeStop.count({ where: { dayNumber: 1 } });
  const day2 = await prisma.routeStop.count({ where: { dayNumber: 2 } });
  const stays = await prisma.routeStop.count({ where: { stopType: 'STAY' } });
  const routesWithoutDay2 = (
    await prisma.travelRoute.findMany({ include: { stops: { where: { dayNumber: 2 } } } })
  ).filter((r) => r.stops.length === 0).length;

  v.expectAtLeast('Day1 경유지', day1, 40, '개');
  v.expectAtLeast('Day2 경유지', day2, 20, '개');
  v.expectEqual('숙소(루트당 1곳)', stays, travel.routes, '곳');
  v.expectEqual('Day2 가 비어 있는 루트', routesWithoutDay2, 0, '개');

  // --- 여행지가 목표액·기간을 갖는다 (§12-2) ---------------------------------
  const destinations = await prisma.travelDestination.findMany({ orderBy: { sortOrder: 'asc' } });
  v.expectEqual(
    '목표액이 0인 여행지',
    destinations.filter((d) => d.targetSavingAmount <= 0).length,
    0,
    '곳',
  );
  v.expectEqual(
    '기간이 2/4/8주가 아닌 여행지',
    destinations.filter((d) => ![2, 4, 8].includes(d.challengeWeeks)).length,
    0,
    '곳',
  );
  v.expectEqual(
    '교통비가 0인 여행지',
    destinations.filter((d) => d.oneWayFareAmount <= 0).length,
    0,
    '곳',
  );

  // --- 페르소나 3축이 의도한 값으로 떨어지는가 -------------------------------
  // 계산기가 아무리 정확해도 시드가 이 그림을 만들지 못하면 시연이 밋밋해진다.
  const benchmark = await prisma.spendingBenchmark.findUniqueOrThrow({
    where: { ageBand_scope: { ageBand: DEMO_USER.ageBand, scope: 'TOTAL' } },
  });
  const spendingRatio = tx.monthlyAvgTotalAmount / benchmark.monthlyAvgAmount;

  v.expectTrue(
    '최다 지출 카테고리 = 배달',
    tx.topCategory === 'DELIVERY_FOOD',
    `${tx.topCategory} (${formatWon(tx.monthlyAvgByCategory[tx.topCategory] ?? 0)}/월)`,
  );
  v.expectTrue(
    '최다 시간대 = 저녁',
    tx.topTimeBand === 'EVENING',
    `${tx.topTimeBand} — ${Object.entries(tx.timeBandCounts)
      .map(([b, c]) => `${b} ${c}`)
      .join(' / ')}`,
  );
  v.expectTrue(
    '소비량 축 = OVER (벤치마크 120% 초과)',
    spendingRatio > 1.2,
    `${formatWon(tx.monthlyAvgTotalAmount)} / ${formatWon(benchmark.monthlyAvgAmount)} = ${spendingRatio.toFixed(3)}`,
  );
  // 분류 카테고리와 페르소나 카테고리가 같은 12종이라 변환 없이 그대로 붙인다
  const expectedPersonaCode = `${tx.topTimeBand}_${tx.topCategory}`;
  v.expectTrue(
    '페르소나 카탈로그에 대상 코드 존재',
    (await prisma.persona.count({ where: { code: expectedPersonaCode } })) === 1,
    expectedPersonaCode,
  );

  // MockTransaction 에 카테고리 컬럼이 없다는 것을 구조적으로 재확인
  const mockColumns = Object.keys(
    (await prisma.mockTransaction.findFirst()) ?? {},
  );
  v.expectTrue(
    'MockTransaction 에 카테고리 없음',
    !mockColumns.some((c) => c.toLowerCase().includes('category')),
    mockColumns.join(', '),
  );

  v.report();

  // ---------------------------------------------------------------------------
  // 요약 출력
  // ---------------------------------------------------------------------------
  const intended = Object.entries(tx.byIntended).sort((a, b) => b[1] - a[1]);

  console.log('  거래 생성 요약');
  console.log(`    기간        ${kstDateKey(tx.spanFrom)} ~ ${kstDateKey(tx.spanTo)}`);
  console.log(`    대상 월     ${tx.monthKeys.join(', ')}`);
  console.log(`    월별 건수   ${tx.perMonthCounts.join(' / ')}`);
  console.log('    의도한 분포 (검증 태그 — DB 에는 저장되지 않음)');
  for (const [cat, count] of intended) {
    console.log(`      ${cat.padEnd(16)} ${String(count).padStart(4)}건`);
  }
  console.log(`    배달 월평균 ${formatWon(tx.deliveryMonthlyAvgAmount)}`);

  console.log('\n  6개월 월평균 지출 (페르소나·절약목표의 기준값)');
  for (const [cat, amount] of Object.entries(tx.monthlyAvgByCategory).sort(
    (a, b) => b[1] - a[1],
  )) {
    const share = ((amount / tx.monthlyAvgTotalAmount) * 100).toFixed(1);
    console.log(`      ${cat.padEnd(16)} ${formatWon(amount).padStart(12)}  ${share.padStart(5)}%`);
  }
  console.log(`      ${'합계'.padEnd(15)} ${formatWon(tx.monthlyAvgTotalAmount).padStart(12)}`);
  const expectedPersona = await prisma.persona.findUnique({ where: { code: expectedPersonaCode } });
  console.log(
    `\n  예상 페르소나  ${expectedPersonaCode}` +
      (expectedPersona ? ` — "${expectedPersona.displayName}"` : '') +
      `\n                 (시간대 ${Object.entries(tx.timeBandCounts)
        .map(([b, c]) => `${b} ${c}`)
        .join(' / ')})`,
  );

  console.log('\n  데모 계정');
  console.log(`    이메일      ${DEMO_USER.email}`);
  console.log(`    비밀번호    ${DEMO_USER.password}`);
  console.log(`    사용자 ID   ${user.id}`);
  console.log('\n  금융기관 연동 (POST /connections)');
  console.log(`    아이디      ${PROVIDER_LOGIN.loginId}`);
  console.log(`    비밀번호    ${PROVIDER_LOGIN.password}`);
  console.log(`    (6개 기관 모두 동일한 자격증명)`);

  console.log(
    `\n  페르소나 카탈로그 ${personaCount}행 (시간대 4 × 카테고리 ${PERSONA_CATEGORIES.length})`,
  );
  console.log(`    분류 카테고리와 페르소나 축이 동일 — 12종 전부 산출 가능`);
  console.log(`\n시드 완료 (${Date.now() - startedAt}ms)\n`);
}

main()
  .catch((error) => {
    console.error('\n시드 실패');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
