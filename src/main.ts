import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger.setup';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api/v1');

  // 프론트는 아직 붙지 않았지만, 붙는 순간 바로 되도록 열어둔다.
  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.swaggerEnabled) {
    setupSwagger(app, config.swaggerPath);
  }

  await app.listen(config.port);

  const base = `http://localhost:${config.port}`;
  logger.log('');
  logger.log('  야호(Yaho) 백엔드 기동 완료');
  logger.log(`  API      ${base}/api/v1`);
  if (config.swaggerEnabled) logger.log(`  Swagger  ${base}/${config.swaggerPath}`);
  logger.log(`  Health   ${base}/api/v1/health`);
  logger.log(`  DB       ${config.databaseProvider}`);
  logger.log(`  DEMO_MODE ${config.demoMode ? 'ON — /demo/* 라우트 활성' : 'OFF'}`);
  logger.log('');
}

void bootstrap();
