/**
 * 여행지·루트·사진·리뷰·쿠폰 시드.
 *
 * 사진은 revealOrder 순으로 저장한다. 블러 정책(§6-5)이 이 순서를 그대로 쓴다:
 * progressRate 가 오를수록 revealOrder 가 앞선 사진부터 공개된다.
 */
import type { PrismaClient } from '@prisma/client';

import { addDays } from '../../src/common/utils/date-kst';
import {
  DESTINATION_COORDS,
  STOP_COORDS,
  assertGeoCoverage,
} from './data/travel-geo.data';
import { COUPONS, DESTINATIONS } from './data/travel.data';

/**
 * 1박 2일 구조가 성립하는지 검증한다 (§12-3).
 *
 * 여기서 막지 않으면 "Day2 가 비어 있는 1박 2일 처방전" 이나 "숙소 없이 1박" 같은 데이터가
 * 조용히 들어간다. 화면은 Day 탭을 그리는데 내용이 없으면 발표에서 바로 티가 난다.
 */
function assertItineraryShape(): void {
  const problems: string[] = [];

  for (const dest of DESTINATIONS) {
    for (const route of dest.routes) {
      const where = `${dest.name} / ${route.title}`;
      const days = route.stops.map((s) => s.day ?? 1);

      // Day1 이 전부 앞에, Day2 가 전부 뒤에 와야 한다.
      // sortOrder 가 Day 를 가로지르는 전체 순번이라 섞이면 타임라인이 뒤엉킨다.
      for (let i = 1; i < days.length; i += 1) {
        if (days[i] < days[i - 1]) {
          problems.push(`${where}: Day 순서가 뒤섞였습니다 (${days.join(',')})`);
          break;
        }
      }

      const day1 = route.stops.filter((s) => (s.day ?? 1) === 1);
      const day2 = route.stops.filter((s) => s.day === 2);

      if (day1.length < 3) problems.push(`${where}: Day1 경유지가 ${day1.length}곳 (3곳 이상 필요)`);
      if (day2.length < 2) problems.push(`${where}: Day2 경유지가 ${day2.length}곳 (2곳 이상 필요)`);

      // 1박이므로 숙소가 정확히 하나, 그리고 Day1 의 마지막이어야 한다.
      const stays = route.stops.filter((s) => s.stopType === 'STAY');
      if (stays.length !== 1) {
        problems.push(`${where}: 숙소(STAY)가 ${stays.length}곳 (정확히 1곳이어야 함)`);
      } else if (day1[day1.length - 1] !== stays[0]) {
        problems.push(`${where}: 숙소가 Day1 마지막이 아닙니다`);
      }

      // 제휴 할인은 표기명과 짝을 이뤄야 한다. 한쪽만 있으면 화면에 "🏷 undefined 15% 할인" 이 뜬다.
      for (const s of route.stops) {
        const hasRate = s.discountRate !== undefined;
        const hasName = s.partnerName !== undefined;
        if (hasRate !== hasName) {
          problems.push(`${where} / ${s.placeName}: discountRate 와 partnerName 은 함께 있어야 합니다`);
        }
        if (hasRate && (s.discountRate! <= 0 || s.discountRate! >= 100)) {
          problems.push(`${where} / ${s.placeName}: 할인율 ${s.discountRate}% 가 범위를 벗어났습니다`);
        }
      }
    }
  }

  // --- 목표액이 실제 여행 경비를 덮는가 (§12-2 서사의 근간) ------------------
  //
  // "아낀 돈이 이 여행이 됩니다" 가 이 앱의 핵심 서사다. 목표액보다 여행 경비가 크면
  // 챌린지를 성공해도 그 여행을 갈 수 없다 — 서사가 그 자리에서 무너진다.
  // 시드 데이터를 손볼 때마다 조용히 깨지기 쉬운 관계라 여기서 못박는다.
  for (const dest of DESTINATIONS) {
    const transport = dest.oneWayFareAmount * 2;
    for (const route of dest.routes) {
      const gross = route.stops.reduce((s, st) => s + st.estimatedAmount, 0);
      const discount = route.stops.reduce(
        (s, st) => s + Math.floor((st.estimatedAmount * (st.discountRate ?? 0)) / 100),
        0,
      );
      const tripCost = gross - discount + transport;
      if (tripCost > dest.targetSavingAmount) {
        problems.push(
          `${dest.name} / ${route.title}: 여행 경비 ${tripCost.toLocaleString('ko-KR')}원 > ` +
            `목표액 ${dest.targetSavingAmount.toLocaleString('ko-KR')}원 — ` +
            '아낀 돈으로 갈 수 없는 코스입니다',
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(['1박 2일 코스 검증 실패:', ...problems.map((p) => `  - ${p}`)].join('\n'));
  }
}

export interface SeedTravelResult {
  destinations: number;
  routes: number;
  stops: number;
  photos: number;
  reviews: number;
  coupons: number;
}

export async function seedTravel(prisma: PrismaClient, anchor: Date): Promise<SeedTravelResult> {
  const result: SeedTravelResult = {
    destinations: 0,
    routes: 0,
    stops: 0,
    photos: 0,
    reviews: 0,
    coupons: 0,
  };

  // 좌표 표가 여행지 데이터와 어긋나면 여기서 즉시 죽는다.
  // 지도에 핀이 조용히 빠지는 것보다 시드가 터지는 편이 낫다.
  assertGeoCoverage(
    DESTINATIONS.map((d) => d.code),
    DESTINATIONS.flatMap((d) => d.routes.flatMap((r) => r.stops.map((s) => s.placeName))),
  );
  assertItineraryShape();

  const destinationIdByCode = new Map<string, string>();

  for (const [index, dest] of DESTINATIONS.entries()) {
    const created = await prisma.travelDestination.create({
      data: {
        code: dest.code,
        name: dest.name,
        province: dest.province,
        regionCode: dest.regionCode,
        extinctionRiskIndexBp: dest.extinctionRiskIndexBp,
        riskGrade: dest.riskGrade,
        tagline: dest.tagline,
        summary: dest.summary,
        description: dest.description,
        heroImageUrl: dest.heroImageUrl,
        catchphrase: dest.catchphrase,
        challengeWeeks: dest.challengeWeeks,
        targetSavingAmount: dest.targetSavingAmount,
        oneWayFareAmount: dest.oneWayFareAmount,
        travelMinutesFromGwangju: dest.travelMinutesFromGwangju,
        recommendedNights: dest.recommendedNights,
        sortOrder: index,
        latitude: DESTINATION_COORDS[dest.code].latitude,
        longitude: DESTINATION_COORDS[dest.code].longitude,
      },
    });
    destinationIdByCode.set(dest.code, created.id);
    result.destinations += 1;

    // --- 사진 (블러 정책의 revealOrder) ---
    await prisma.travelPhoto.createMany({
      data: dest.photos.map((p, i) => ({
        destinationId: created.id,
        imageUrl: `https://images.yaho.kr/destinations/${dest.code.toLowerCase()}/${i + 1}.jpg`,
        caption: p.caption,
        revealOrder: i + 1,
      })),
    });
    result.photos += dest.photos.length;

    // --- 루트 2개 + 경유지 ---
    for (const [routeIndex, route] of dest.routes.entries()) {
      const totalEstimatedAmount = route.stops.reduce((s, st) => s + st.estimatedAmount, 0);
      const totalDurationMinutes = route.stops.reduce((s, st) => s + st.stayMinutes, 0);

      const createdRoute = await prisma.travelRoute.create({
        data: {
          destinationId: created.id,
          title: route.title,
          theme: route.theme,
          summary: route.summary,
          totalEstimatedAmount,
          totalDurationMinutes,
          sortOrder: routeIndex,
        },
      });
      result.routes += 1;

      await prisma.routeStop.createMany({
        data: route.stops.map((st, i) => ({
          routeId: createdRoute.id,
          sortOrder: i + 1,
          placeName: st.placeName,
          description: st.description,
          stopType: st.stopType,
          stayMinutes: st.stayMinutes,
          estimatedAmount: st.estimatedAmount,
          dayNumber: st.day ?? 1,
          // 할인율은 % 로 적고 basis point 로 저장한다 (15 → 1500)
          discountRateBp: st.discountRate === undefined ? null : st.discountRate * 100,
          partnerName: st.partnerName ?? null,
          latitude: STOP_COORDS[st.placeName].latitude,
          longitude: STOP_COORDS[st.placeName].longitude,
        })),
      });
      result.stops += route.stops.length;
    }

    // --- 기방문자 리뷰 ---
    await prisma.travelReview.createMany({
      data: dest.reviews.map((r) => ({
        destinationId: created.id,
        authorNickname: r.authorNickname,
        rating: r.rating,
        content: r.content,
        visitedAt: addDays(anchor, -r.daysAgo),
        helpfulCount: r.helpfulCount,
      })),
    });
    result.reviews += dest.reviews.length;
  }

  // --- 제휴 쿠폰 캠페인 ---
  // 캠페인 기간은 앵커 기준 -30일 ~ +365일. 발표 시점에 항상 유효하다.
  const validFrom = addDays(anchor, -30);
  const validUntil = addDays(anchor, 365);

  await prisma.coupon.createMany({
    data: COUPONS.map((c) => ({
      code: c.code,
      partnerName: c.partnerName,
      title: c.title,
      description: c.description,
      destinationId: c.destinationCode ? destinationIdByCode.get(c.destinationCode)! : null,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minSpendAmount: c.minSpendAmount,
      maxDiscountAmount: c.maxDiscountAmount,
      validFrom,
      validUntil,
      validDays: c.validDays,
    })),
  });
  result.coupons = COUPONS.length;

  return result;
}
