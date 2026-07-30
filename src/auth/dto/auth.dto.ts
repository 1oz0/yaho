import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: '데모 계정 이메일',
    example: 'demo@yaho.kr',
    format: 'email',
  })
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email!: string;

  @ApiProperty({
    description: '비밀번호 (데모 계정: yaho1234)',
    example: 'yaho1234',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상입니다.' })
  password!: string;
}

export class UserDto {
  @ApiProperty({ type: String, example: 'cms736k330000tcmsrqwp7l8q' })
  id!: string;

  @ApiProperty({ type: String, example: 'demo@yaho.kr' })
  email!: string;

  @ApiProperty({ type: String, example: '김하늘' })
  name!: string;

  @ApiProperty({
    type: String,
    description: '연령대. 페르소나 소비량 축의 벤치마크 조회 키.',
    example: '20S_LATE',
  })
  ageBand!: string;

  @ApiProperty({ type: String, description: '행정구역 코드 (29 = 광주광역시)', example: '29' })
  regionCode!: string;
}

export class LoginResponseDto {
  @ApiProperty({
    type: String,
    description: 'JWT accessToken. 이후 요청에 Authorization: Bearer <token> 으로 실어 보낸다.',
  })
  accessToken!: string;

  @ApiProperty({ type: String, description: '만료 기간', example: '7d' })
  expiresIn!: string;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

/**
 * 앱 부팅 시 어느 온보딩 단계로 보낼지 한 번의 호출로 정하기 위한 응답.
 * 프론트가 화면 전환 로직을 이 플래그만 보고 짤 수 있다.
 */
export class MeResponseDto extends UserDto {
  @ApiProperty({ type: Boolean, description: '연동된 금융기관이 하나라도 있는가 (화면 ②)' })
  hasConnections!: boolean;

  @ApiProperty({ type: Boolean, description: '거래 동기화를 한 번이라도 했는가 (화면 ③)' })
  hasSyncedTransactions!: boolean;

  @ApiProperty({ type: Number, description: '사용자 확인 대기 중인 미분류 거래 수 (화면 ③)' })
  pendingReviewCount!: number;

  @ApiProperty({ type: Boolean, description: '페르소나가 산출되었는가 (화면 ④)' })
  hasPersona!: boolean;

  @ApiProperty({ type: Boolean, description: '절약 목표가 설정되었는가 (화면 ⑤)' })
  hasSavingGoal!: boolean;

  @ApiProperty({ type: Boolean, description: '진행 중인 챌린지가 있는가 (화면 ⑦)' })
  hasActiveChallenge!: boolean;
}
