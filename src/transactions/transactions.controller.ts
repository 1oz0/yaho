import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { WithMeta } from '../common/interceptors/transform.interceptor';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import {
  BulkReviewDto,
  BulkReviewResultDto,
  ListTransactionsQueryDto,
  PendingReviewDto,
  SyncResultDto,
  SyncTransactionsDto,
  TransactionDto,
  UpdateCategoryDto,
  UpdateCategoryResultDto,
} from './dto/transactions.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('sync')
  @ApiOperation({
    summary: '거래 수집 + 분류 (화면 ③)',
    description:
      '연동된 모든 기관에서 최근 6개월 거래를 가져와 분류 파이프라인을 돌립니다.\n\n' +
      '**분류는 전부 결정론적 규칙**입니다 — LLM 호출이 한 번도 없습니다. ' +
      '사용자가 늘어도 분류 비용은 0원입니다.\n\n' +
      '파이프라인: 거래유형 가드 → 정규화 → 사용자 규칙 → 전역 키워드(236개) → ' +
      'MCC(40개) → 정기결제 탐지 → 계좌간이체 → 미분류\n\n' +
      '재호출해도 이미 저장된 거래는 `skipped` 로 빠지므로 안전합니다.',
  })
  @ApiEnvelope(SyncResultDto, { status: 201, description: '동기화 결과' })
  @ApiErrors('NO_TRANSACTION_DATA', 'PROVIDER_AUTH_FAILED', 'UNAUTHORIZED')
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncTransactionsDto,
  ): Promise<SyncResultDto> {
    return this.transactionsService.sync(user.id, dto.months);
  }

  @Get()
  @ApiOperation({
    summary: '거래 목록 (화면 ③)',
    description: '기간·카테고리 필터와 커서 페이지네이션을 지원합니다.',
  })
  @ApiEnvelope(TransactionDto, { isArray: true, paginated: true })
  @ApiErrors('UNAUTHORIZED', 'VALIDATION_FAILED')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<WithMeta<TransactionDto[]>> {
    return this.transactionsService.list(user.id, query);
  }

  @Get('pending-review')
  @ApiOperation({
    summary: '확신 못한 N건 (화면 ③)',
    description:
      '미분류 거래를 **가맹점 단위로 묶어서** 반환합니다.\n\n' +
      '건별로 물어보면 18번 질문해야 하지만, 정규화 가맹점으로 묶으면 6번이면 끝납니다. ' +
      '`totalCount` 는 거래 수, `groupCount` 는 실제 질문 수입니다.\n\n' +
      '건수가 많은 가맹점부터 정렬되어 있어, 위에서부터 답할수록 빨리 줄어듭니다.',
  })
  @ApiEnvelope(PendingReviewDto)
  @ApiErrors('UNAUTHORIZED')
  pendingReview(@CurrentUser() user: AuthenticatedUser): Promise<PendingReviewDto> {
    return this.transactionsService.pendingReview(user.id);
  }

  @Patch(':id/category')
  @ApiOperation({
    summary: '카테고리 직접 지정 (화면 ③)',
    description:
      '한 번의 선택으로 세 가지가 함께 일어납니다.\n' +
      '1. 해당 거래 갱신\n' +
      '2. **같은 가맹점의 다른 미분류 건 일괄 갱신** → 응답의 `alsoUpdatedCount`\n' +
      '3. `UserMerchantRule` 저장 → 다음 동기화부터 자동 적용\n\n' +
      '`alsoUpdatedCount` 를 화면에 "N건이 함께 정리됐어요" 로 노출하세요.',
  })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiEnvelope(UpdateCategoryResultDto)
  @ApiErrors('NOT_FOUND', 'INVALID_CATEGORY', 'VALIDATION_FAILED', 'UNAUTHORIZED')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<UpdateCategoryResultDto> {
    return this.transactionsService.updateCategory(user.id, id, dto);
  }

  @Post('review/bulk')
  @ApiOperation({
    summary: '미분류 일괄 확정 (화면 ③)',
    description:
      'pending-review 의 그룹들을 한 번에 확정합니다. ' +
      '각 항목마다 UserMerchantRule 도 함께 저장되어 다음 동기화부터 자동 분류됩니다.',
  })
  @ApiEnvelope(BulkReviewResultDto, { status: 201 })
  @ApiErrors('VALIDATION_FAILED', 'UNAUTHORIZED')
  bulkReview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkReviewDto,
  ): Promise<BulkReviewResultDto> {
    return this.transactionsService.bulkReview(user.id, dto);
  }
}
