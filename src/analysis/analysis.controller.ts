import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { AnalysisService } from './analysis.service';
import { AnalysisSummaryDto, TopCategoryDto } from './dto/analysis.dto';

@ApiTags('analysis')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get('summary')
  @ApiOperation({
    summary: '6개월 소비 요약 (화면 ③)',
    description:
      '카테고리별 금액·비중, 월별 추이, 시간대 분포, 정기결제를 한 번에 반환합니다.\n\n' +
      '**기준 기간**: 직전 6개 완결 월 (월 경계는 KST 매월 1일 00:00). ' +
      '이력이 6개월 미만이면 존재하는 월 수로만 평균을 내고, 그 값이 `monthsCovered` 입니다.\n\n' +
      '진행 중인 이번 달은 평균에서 제외됩니다. `EXCLUDED`(월급·계좌간이체·취소)도 전부 빠집니다. ' +
      '`UNCLASSIFIED` 는 실제로 나간 돈이므로 포함되며, 사용자가 확정하면 총액은 그대로인 채 분포만 또렷해집니다.',
  })
  @ApiEnvelope(AnalysisSummaryDto)
  @ApiErrors('NO_TRANSACTION_DATA', 'UNAUTHORIZED')
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<AnalysisSummaryDto> {
    return this.analysisService.getSummary(user.id);
  }

  @Get('top-category')
  @ApiOperation({
    summary: '최다 지출 카테고리 (화면 ④)',
    description:
      '페르소나 부여 화면의 도입부에 쓰는 값입니다.\n\n' +
      '`FIXED`(고정지출)와 `UNCLASSIFIED` 는 "줄일 수 있는 소비"가 아니므로 후보에서 제외됩니다. ' +
      '1·2위가 동점이면 `isTie: true` 로 알려주므로 프론트가 "박빙" 표현을 쓸 수 있습니다.',
  })
  @ApiEnvelope(TopCategoryDto)
  @ApiErrors('NO_TRANSACTION_DATA', 'UNAUTHORIZED')
  getTopCategory(@CurrentUser() user: AuthenticatedUser): Promise<TopCategoryDto> {
    return this.analysisService.getTopCategory(user.id);
  }
}
