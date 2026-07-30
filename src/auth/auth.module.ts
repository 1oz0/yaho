import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfigService } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * jsonwebtoken 의 expiresIn 은 `"7d"` 같은 템플릿 리터럴 유니온이라 plain string 이 들어가지 않는다.
 * 환경변수는 string 으로 올 수밖에 없으므로 여기서 한 번만 좁혀준다.
 */
type ExpiresIn = NonNullable<NonNullable<JwtModuleOptions['signOptions']>['expiresIn']>;

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): JwtModuleOptions => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: config.jwtExpiresIn as ExpiresIn },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
