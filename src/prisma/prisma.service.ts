import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('데이터베이스 연결 완료');
    } catch (error) {
      this.logger.error(
        [
          '데이터베이스에 연결하지 못했습니다.',
          '',
          '오프라인/장애 상황이라면 SQLite 로 즉시 전환하세요 (PowerShell):',
          '  npm run db:use:sqlite',
          '  npm run db:push',
          '  npm run db:seed',
          '',
        ].join('\n'),
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * 모든 도메인 테이블을 비운다. demo/reset 전용.
   * 외래키 순서를 고려해 자식 → 부모 순으로 지운다.
   */
  async truncateAll(): Promise<void> {
    await this.$transaction([
      this.issuedCoupon.deleteMany(),
      this.userBadge.deleteMany(),
      this.challengeCheckIn.deleteMany(),
      this.challengeWeekBudget.deleteMany(),
      this.challengeWeek.deleteMany(),
      this.challengeCategoryBudget.deleteMany(),
      this.challenge.deleteMany(),
      this.savingGoalItem.deleteMany(),
      this.savingGoal.deleteMany(),
      this.userPersona.deleteMany(),
      this.userMerchantRule.deleteMany(),
      this.transaction.deleteMany(),
      this.linkedAccount.deleteMany(),
      this.connection.deleteMany(),
      this.user.deleteMany(),

      this.coupon.deleteMany(),
      this.badgeRule.deleteMany(),
      this.badge.deleteMany(),
      this.travelReview.deleteMany(),
      this.travelPhoto.deleteMany(),
      this.routeStop.deleteMany(),
      this.travelRoute.deleteMany(),
      this.travelDestination.deleteMany(),
      this.persona.deleteMany(),
      this.spendingBenchmark.deleteMany(),
      this.mccMapping.deleteMany(),
      this.merchantRule.deleteMany(),

      this.mockTransaction.deleteMany(),
      this.mockAccount.deleteMany(),
      this.mockUserCredential.deleteMany(),
      this.mockInstitution.deleteMany(),

      this.demoState.deleteMany(),
    ]);
  }
}
