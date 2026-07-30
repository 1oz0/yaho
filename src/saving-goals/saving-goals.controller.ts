import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import {
  CreateSavingGoalDto,
  SavingGoalDto,
  SavingSuggestionsDto,
  SuggestionsQueryDto,
} from './dto/saving-goals.dto';
import { SavingGoalsService } from './saving-goals.service';

@ApiTags('saving-goals')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('saving-goals')
export class SavingGoalsController {
  constructor(private readonly savingGoalsService: SavingGoalsService) {}

  @Get('suggestions')
  @ApiOperation({
    summary: '슬라이더 기본값·최대값·환산 힌트 (화면 S12)',
    description:
      '카테고리별 슬라이더를 그리는 데 필요한 값을 모두 반환합니다.\n\n' +
      '### 9종만 옵니다\n' +
      '`items` 는 **절약 대상 9종**뿐입니다. 의료·건강 / 교육 / 여행·숙박은 빠집니다 — ' +
      '빠진 이유는 `excludedCategories` 에 문구로 담겨 있습니다.\n\n' +
      '> ⚠️ 분류·집계·페르소나 축은 **12종 그대로**입니다. 소비 내역 탭과 페르소나 화면에서는 ' +
      '이 3종도 계속 보입니다.\n\n' +
      '### 슬라이더 값\n' +
      '- `maxAmount` = 해당 카테고리 월평균. **이 값을 넘기면 400 으로 거절**됩니다.\n' +
      '- `defaultAmount` = 월평균의 30% (1,000원 단위 반올림)\n' +
      '- `step` = 1,000원\n\n' +
      '### 환산 힌트\n' +
      '`(배달 약 3.9끼)` 를 그리기 위한 값입니다. `unitPriceAmount` 는 **이 사용자의 실제 평균 ' +
      '결제액**(기간 총액 ÷ 건수)이라 사람마다 다릅니다. 슬라이더를 움직이면 프론트가 ' +
      '`금액 ÷ unitPriceAmount` 로 다시 계산하세요. 거래가 없으면 null 이니 힌트를 숨기면 됩니다.\n\n' +
      '### 자동 배분\n' +
      '`?targetAmount=60000` 을 주면 그 금액을 **정확히 채우는** 배분안이 `autoAllocation` 에 옵니다. ' +
      '화면의 [✨ 자동 배분] 버튼이 이걸 씁니다. `shortfallAmount > 0` 이면 지금 소비 규모로는 ' +
      '그 목표가 불가능하다는 뜻입니다.',
  })
  @ApiEnvelope(SavingSuggestionsDto)
  @ApiErrors('NO_TRANSACTION_DATA', 'UNAUTHORIZED')
  getSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SuggestionsQueryDto,
  ): Promise<SavingSuggestionsDto> {
    return this.savingGoalsService.getSuggestions(user.id, query.targetAmount);
  }

  @Post()
  @ApiOperation({
    summary: '절약 목표 저장 (화면 ⑤)',
    description:
      '카테고리별 절약 희망액을 한 번에 저장합니다. 합계가 **T (4주 기준액)** 이 되어 ' +
      '챌린지 플랜 계산의 기준값이 됩니다.\n\n' +
      '목표액이 해당 카테고리 월평균을 초과하면 `SAVING_GOAL_EXCEEDS_AVERAGE` (400) 이고, ' +
      '`error.details` 에 **문제가 된 카테고리와 두 금액**이 담겨 프론트가 해당 슬라이더를 짚어줄 수 있습니다.\n\n' +
      '기존 활성 목표가 있으면 보관 처리되고 새 목표가 활성화됩니다.',
  })
  @ApiEnvelope(SavingGoalDto, { status: 201 })
  @ApiErrors('SAVING_GOAL_EXCEEDS_AVERAGE', 'INVALID_CATEGORY', 'NO_TRANSACTION_DATA', 'VALIDATION_FAILED')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavingGoalDto,
  ): Promise<SavingGoalDto> {
    return this.savingGoalsService.create(user.id, dto);
  }

  @Get('current')
  @ApiOperation({ summary: '현재 절약 목표 (화면 ⑤)' })
  @ApiEnvelope(SavingGoalDto)
  @ApiErrors('NO_SAVING_GOAL', 'UNAUTHORIZED')
  getCurrent(@CurrentUser() user: AuthenticatedUser): Promise<SavingGoalDto> {
    return this.savingGoalsService.getCurrent(user.id);
  }
}
