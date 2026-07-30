import { Module } from '@nestjs/common';

import { FINANCIAL_PROVIDER } from './financial-provider.port';
import { MockFinancialProvider } from './mock-financial.provider';

/**
 * 금융 프로바이더 모듈.
 *
 * 실제 마이데이터 API 가 붙는 날에는 아래 useClass 만 RealFinancialProvider 로 바꾼다.
 * 그 외 어떤 도메인 코드도 수정할 필요가 없다.
 */
@Module({
  providers: [{ provide: FINANCIAL_PROVIDER, useClass: MockFinancialProvider }],
  exports: [FINANCIAL_PROVIDER],
})
export class FinancialModule {}
