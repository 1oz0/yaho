import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InstitutionDto {
  @ApiProperty({
    type: String,
    description: '기관 코드. 연동 요청에 이 값을 그대로 보낸다. 재시드해도 변하지 않는다.',
    example: 'SHINHAN_CARD',
  })
  code!: string;

  @ApiProperty({ type: String, example: '신한카드' })
  name!: string;

  @ApiProperty({ type: String, enum: ['CARD', 'BANK'], example: 'CARD' })
  type!: string;

  @ApiProperty({ type: String, description: '프론트 아이콘 키', example: 'shinhan' })
  logoKey!: string;

  @ApiProperty({ type: String, description: '브랜드 컬러 HEX', example: '#0046FF' })
  brandColor!: string;

  @ApiProperty({ type: Boolean, description: '이미 연동되어 있는가. true 면 버튼을 비활성화한다.' })
  isConnected!: boolean;
}

export class CreateConnectionDto {
  @ApiProperty({
    type: String,
    description: '연동할 기관 코드 (GET /connections/institutions 의 code)',
    example: 'SHINHAN_CARD',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  institutionCode!: string;

  @ApiProperty({ type: String, description: '기관 로그인 아이디 (데모: yaho)', example: 'yaho' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  loginId!: string;

  @ApiProperty({ type: String, description: '기관 로그인 비밀번호 (데모: 1234)', example: '1234' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password!: string;
}

export class LinkedAccountDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: ['CARD', 'BANK'] })
  type!: string;

  @ApiProperty({ type: String, example: '4512-****-****-8821' })
  accountNumberMasked!: string;

  @ApiProperty({ type: String, example: '신한카드 Deep Dream 체크' })
  productName!: string;
}

export class ConnectionDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, example: 'SHINHAN_CARD' })
  institutionCode!: string;

  @ApiProperty({ type: String, example: '신한카드' })
  institutionName!: string;

  @ApiProperty({ type: String, enum: ['CARD', 'BANK'] })
  institutionType!: string;

  @ApiProperty({ type: String, description: '프론트 아이콘 키' })
  logoKey!: string;

  @ApiProperty({ type: String, description: '브랜드 컬러 HEX' })
  brandColor!: string;

  @ApiProperty({ type: String, enum: ['ACTIVE', 'REVOKED'] })
  status!: string;

  @ApiProperty({ type: String, description: 'KST ISO', example: '2026-07-30T19:24:00.000+09:00' })
  connectedAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '마지막 거래 동기화 시각 (KST ISO). 아직 동기화하지 않았으면 null.',
  })
  lastSyncedAt!: string | null;

  @ApiProperty({ type: [LinkedAccountDto], description: '자동 등록된 계좌·카드' })
  accounts!: LinkedAccountDto[];
}

export class RevokeConnectionDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: ['REVOKED'], example: 'REVOKED' })
  status!: string;

  @ApiProperty({
    type: Number,
    description: '함께 정리된 거래 건수. 해당 기관에서 수집한 거래도 같이 삭제된다.',
  })
  removedTransactionCount!: number;
}
