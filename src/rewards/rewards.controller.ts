import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { BadgeCollectionDto, IssuedCouponDto, ListCouponsQueryDto } from './dto/rewards.dto';
import { RewardsService } from './rewards.service';

@ApiTags('rewards')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('badges')
  @ApiOperation({
    summary: '뱃지 컬렉션 (화면 ⑨)',
    description:
      '뱃지는 **수집형**이므로 미보유 항목도 전부 내려갑니다 — 프론트는 잠긴 칸으로 표시하세요.\n\n' +
      '미보유 뱃지에는 `progress` 로 달성 진행도가 붙습니다 (`current` / `threshold` / `rate`). ' +
      '조건이 여러 개면 전부 만족해야 획득합니다.\n\n' +
      '지급 조건은 코드가 아니라 `BadgeRule` 테이블에 있습니다. 기획이 기준을 바꿔도 API 는 그대로입니다.',
  })
  @ApiEnvelope(BadgeCollectionDto)
  @ApiErrors('UNAUTHORIZED')
  getBadges(@CurrentUser() user: AuthenticatedUser): Promise<BadgeCollectionDto> {
    return this.rewardsService.getBadgeCollection(user.id);
  }

  @Get('coupons')
  @ApiOperation({
    summary: '보유 쿠폰 (화면 ⑨)',
    description:
      '챌린지 성공으로 발급받은 숙소·관광지 제휴 쿠폰입니다.\n\n' +
      '유효기간이 지난 쿠폰은 **이 API 를 호출하는 시점에** `EXPIRED` 로 정리됩니다 ' +
      '(백그라운드 스케줄러 없음).\n\n' +
      '`discountType` 이 `RATE` 면 `discountValue` 는 퍼센트(20 = 20%), ' +
      '`AMOUNT` 면 원 단위 금액입니다.',
  })
  @ApiEnvelope(IssuedCouponDto, { isArray: true })
  @ApiErrors('UNAUTHORIZED', 'VALIDATION_FAILED')
  getCoupons(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCouponsQueryDto,
  ): Promise<IssuedCouponDto[]> {
    return this.rewardsService.getIssuedCoupons(user.id, query.status);
  }
}
