import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok', 'degraded'], description: 'DB 까지 정상이면 ok' })
  status!: 'ok' | 'degraded';

  @ApiProperty({ description: 'DB 연결 및 쿼리 성공 여부' })
  databaseOk!: boolean;

  @ApiProperty({ enum: ['sqlite', 'postgresql'], description: '현재 연결된 DB 프로바이더' })
  databaseProvider!: 'sqlite' | 'postgresql';

  @ApiProperty({ description: 'true 이면 /demo/* 라우트가 등록되어 있다' })
  demoMode!: boolean;

  @ApiProperty({ description: 'demo/fast-forward 로 누적된 가상 시계 오프셋(일)' })
  clockOffsetDays!: number;

  @ApiProperty({ description: '앱이 인식하는 현재 시각 (KST ISO)', example: '2026-07-30T19:24:00.000+09:00' })
  virtualNow!: string;

  @ApiProperty({ description: '오프셋이 섞이지 않은 실제 시각 (KST ISO)' })
  realNow!: string;
}
