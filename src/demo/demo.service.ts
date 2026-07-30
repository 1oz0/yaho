/**
 * 발표 전용 유틸 (프롬프트 §7 demo).
 *
 * "발표에서 실수를 없애주는 가장 실용적인 장치" 라는 요구에 맞춰,
 * 리허설을 몇 번이든 같은 조건에서 반복할 수 있게 하는 것이 목적이다.
 */
import { Injectable, Logger } from '@nestjs/common';

import { ChallengesService } from '../challenges/challenges.service';
import { ClockService } from '../common/clock/clock.service';
import { CATEGORY_LABELS, type TxCategory } from '../common/constants/tx-category';
import { AppException } from '../common/errors/app.exception';
import { addDays, toKstIso } from '../common/utils/date-kst';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from '../transactions/classification/classification.service';
import {
  DemoResetResultDto,
  FastForwardChallengeDto,
  FastForwardResultDto,
  SimulateSpendingDto,
  SimulateSpendingResultDto,
} from './dto/demo.dto';

/** 카테고리별 기본 가맹점명 — simulate-spending 에서 이름을 생략했을 때 */
const DEFAULT_MERCHANTS: Record<string, string> = {
  DELIVERY_FOOD: '배민)한식대첩 광주상무점',
  DINING_OUT: '청기와타운 광주상무점',
  CAFE_SNACK: '스타벅스 광주상무점',
  CONVENIENCE_STORE: 'GS25 광주상무점',
  ALCOHOL_NIGHTLIFE: '역전할머니맥주 광주상무점',
  SHOPPING: '무신사',
  TRANSPORT_CAR: '카카오T택시',
  GAME_INAPP: '구글플레이',
  SUBSCRIPTION_OTT: '넷플릭스',
  HEALTH_FITNESS: '스포애니헬스 광주상무점',
  EDUCATION: 'CGV 광주터미널점',
  TRAVEL_STAY: '야놀자',
};

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly challenges: ChallengesService,
    private readonly classification: ClassificationService,
  ) {}

  /**
   * 사용자 진행 상태를 전부 지우고 시계를 되돌린다.
   *
   * **가상 금융 DB(mock_*)와 참조 데이터(키워드 사전·페르소나·여행지·뱃지)는 건드리지 않는다.**
   * 그쪽은 고정 시드로 이미 결정론적이라, 지우고 다시 만들어도 같은 값이 나온다.
   * 건드리지 않는 편이 빠르고, 리허설마다 은행 데이터가 동일하게 유지된다.
   *
   * 참조 데이터까지 새로 만들려면 터미널에서 `npm run db:seed` 를 실행한다.
   */
  async reset(userId: string): Promise<DemoResetResultDto> {
    const clockOffsetDaysBefore = this.clock.getOffsetDays();

    const [aiCourses, coupons, badges, challenges, transactions, connections] = await this.prisma.$transaction([
      // AI 여행코스는 페르소나에 종속된 캐시다. 페르소나를 지우면서 이걸 남겨 두면
      // 리셋 뒤에도 이전 페르소나로 짠 코스가 계속 보인다.
      this.prisma.aiTravelCourse.deleteMany({ where: { userId } }),
      this.prisma.issuedCoupon.deleteMany({ where: { userId } }),
      this.prisma.userBadge.deleteMany({ where: { userId } }),
      this.prisma.challenge.deleteMany({ where: { userId } }),
      this.prisma.transaction.deleteMany({ where: { userId } }),
      this.prisma.connection.deleteMany({ where: { userId } }),
      this.prisma.savingGoal.deleteMany({ where: { userId } }),
      this.prisma.userPersona.deleteMany({ where: { userId } }),
      this.prisma.userMerchantRule.deleteMany({ where: { userId } }),
    ]);

    await this.clock.reset();

    const now = this.clock.now();
    this.logger.log(
      `데모 초기화: 거래 ${transactions.count}건 / 연동 ${connections.count}건 / ` +
        `챌린지 ${challenges.count}건 / AI 코스 ${aiCourses.count}건`,
    );

    return {
      resetAt: toKstIso(now),
      removedTransactions: transactions.count,
      removedConnections: connections.count,
      removedChallenges: challenges.count,
      removedBadges: badges.count,
      removedCoupons: coupons.count,
      clockOffsetDaysBefore,
      preserved:
        '가상 금융 DB(mock_*)와 참조 데이터(키워드 사전·MCC·페르소나 48종·여행지 좌표·뱃지·쿠폰)는 보존됩니다. ' +
        '전체를 새로 만들려면 터미널에서 `npm run db:seed` 를 실행하세요.',
    };
  }

  /**
   * 가상 시계를 N일 앞으로 감는다.
   *
   * 감은 뒤 챌린지 상태를 즉시 지연 평가해서, 발표자가 별도로 조회 API 를 부르지 않아도
   * 응답에서 바로 성공 전환을 확인할 수 있게 한다.
   */
  async fastForward(userId: string, days: number): Promise<FastForwardResultDto> {
    const clockOffsetDays = await this.clock.fastForward(days);

    return {
      clockOffsetDays,
      virtualNow: toKstIso(this.clock.now()),
      realNow: toKstIso(this.clock.realNow()),
      challenge: await this.refreshChallenge(userId),
    };
  }

  /**
   * 임의 지출을 주입해 진척률이 움직이는 것을 보여준다.
   *
   * 분류 파이프라인을 태우지 않고 카테고리를 직접 지정한다 —
   * "이 카테고리에서 이만큼 더 쓰면 어떻게 되는지" 를 보여주는 것이 목적이기 때문이다.
   * 주입된 거래는 `isSimulated: true` 로 표시되어 실제 수집분과 구분된다.
   */
  async simulateSpending(
    userId: string,
    dto: SimulateSpendingDto,
  ): Promise<SimulateSpendingResultDto> {
    const account = await this.prisma.linkedAccount.findFirst({
      where: { connection: { userId, status: 'ACTIVE' } },
      orderBy: { id: 'asc' },
    });
    if (!account) {
      throw new AppException(
        'NO_TRANSACTION_DATA',
        '연동된 계좌가 없습니다. 결제수단을 먼저 연동해 주세요.',
      );
    }

    const merchantName = dto.merchantName ?? DEFAULT_MERCHANTS[dto.category] ?? '임의 지출';
    const approvedAt = addDays(this.clock.now(), -(dto.daysAgo ?? 0));
    const { normalizedMerchant } = this.classification.toClassifiable({
      providerTxId: '',
      merchantName,
      amount: dto.amount,
      txType: 'APPROVAL',
      mcc: null,
      approvalNo: null,
      counterpartKey: null,
      approvedAt,
    });

    const created = await this.prisma.transaction.create({
      data: {
        userId,
        linkedAccountId: account.id,
        providerTxId: `sim-${approvedAt.getTime()}-${dto.category}-${dto.amount}`,
        approvedAt,
        merchantName,
        amount: dto.amount,
        txType: 'APPROVAL',
        mcc: null,
        installmentMonths: 0,
        memo: '데모 주입 지출',
        approvalNo: null,
        counterpartKey: null,
        normalizedMerchant,
        category: dto.category,
        classifiedBy: 'MANUAL',
        isRecurring: false,
        needsReview: false,
        excludeReason: null,
        isSimulated: true,
      },
    });

    this.logger.log(
      `지출 주입: ${CATEGORY_LABELS[dto.category as TxCategory]} ${dto.amount.toLocaleString('ko-KR')}원`,
    );

    return {
      transactionId: created.id,
      approvedAt: toKstIso(created.approvedAt),
      merchantName: created.merchantName,
      amount: created.amount,
      category: created.category,
      challenge: await this.refreshChallenge(userId),
    };
  }

  /** 진행 중인 챌린지가 있으면 진척을 다시 계산해 요약을 돌려준다 */
  private async refreshChallenge(userId: string): Promise<FastForwardChallengeDto | null> {
    const active = await this.prisma.challenge.findFirst({
      where: { userId, status: { in: ['IN_PROGRESS', 'SUCCEEDED', 'FAILED'] } },
      orderBy: { startedAt: 'desc' },
    });
    if (!active) return null;

    // getCurrent 가 지연 평가까지 수행한다
    const current = await this.challenges.getCurrent(userId, active.id);
    return {
      id: current.id,
      status: current.status,
      progressRate: current.progressRate,
      currentSavedAmount: current.currentSavedAmount,
      daysRemaining: current.daysRemaining,
    };
  }
}
