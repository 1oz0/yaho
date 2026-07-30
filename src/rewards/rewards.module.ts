import { Module } from '@nestjs/common';

import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

/**
 * 보상 모듈.
 *  - 지급: challenges 의 complete 가 RewardsService.grantForChallenge 를 호출한다
 *  - 조회: GET /rewards/badges, /rewards/coupons
 *
 * 지급 판정과 조회 진행도가 collectStats/measureRule 을 공유하므로
 * "99% 인데 이미 받았다" 같은 어긋남이 생기지 않는다.
 */
@Module({
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
