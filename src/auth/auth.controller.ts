import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, LoginResponseDto, MeResponseDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '로그인 (화면 ①)',
    description:
      '데모 계정: `demo@yaho.kr` / `yaho1234`\n\n' +
      '응답의 accessToken 을 Swagger 우측 상단 **Authorize** 에 넣으면 이후 요청에 자동 적용됩니다.',
  })
  @ApiEnvelope(LoginResponseDto, { description: '로그인 성공' })
  @ApiErrors('INVALID_CREDENTIALS', 'VALIDATION_FAILED')
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: '내 정보 + 온보딩 진행 상태 (화면 ①)',
    description:
      '`has*` 플래그로 앱 부팅 시 어느 화면으로 보낼지 한 번에 결정할 수 있습니다.\n\n' +
      '`hasConnections` → 화면 ②, `hasSyncedTransactions` → 화면 ③, ' +
      '`hasPersona` → 화면 ④, `hasSavingGoal` → 화면 ⑤, `hasActiveChallenge` → 화면 ⑦',
  })
  @ApiEnvelope(MeResponseDto)
  @ApiErrors('UNAUTHORIZED')
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    return this.authService.me(user);
  }
}
