/**
 * 환경변수 스키마 검증.
 *
 * 잘못된 설정으로 서버가 "일단 뜨고 나중에 이상하게 동작"하는 것이 발표 당일 최악의
 * 시나리오다. 그래서 부팅 시점에 전부 검증하고, 하나라도 어긋나면 즉시 죽인다.
 * 오류 메시지는 PowerShell 기준 해결 방법까지 같이 출력한다.
 */
import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** AI 여행코스 생성에 쓰는 모델. 목록에 없는 값을 넣으면 부팅 시 죽는다. */
export const ANTHROPIC_MODELS = [
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5',
] as const;

export const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

const toBool = ({ value }: { value: unknown }): boolean => {
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
};

const toInt = ({ value }: { value: unknown }): number => Number.parseInt(String(value), 10);

export class EnvVars {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL 이 비어 있습니다. `Copy-Item .env.example .env` 후 확인하세요.' })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET 은 16자 이상이어야 합니다.' })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN = '7d';

  @IsString()
  @IsNotEmpty()
  DEMO_USER_EMAIL = 'demo@yaho.kr';

  @IsString()
  @MinLength(8, { message: 'DEMO_USER_PASSWORD 는 8자 이상이어야 합니다.' })
  DEMO_USER_PASSWORD = 'yaho1234';

  @Transform(toInt)
  @IsInt()
  @Min(0)
  MOCK_LATENCY_MIN_MS = 150;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  MOCK_LATENCY_MAX_MS = 400;

  @IsString()
  @IsNotEmpty()
  MOCK_PROVIDER_PASSWORD = '1234';

  @Transform(toBool)
  @IsBoolean()
  DEMO_MODE = true;

  @Transform(toBool)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  @IsNotEmpty()
  SWAGGER_PATH = 'docs';

  // --- Claude API (AI 여행코스 생성) -----------------------------------------
  // 빈 문자열을 허용한다. 키가 없으면 AI 코스가 시드 루트 폴백으로 내려갈 뿐,
  // 서버는 정상 기동한다 — 발표 당일 네트워크가 죽어도 화면이 비지 않아야 한다.
  @IsString()
  ANTHROPIC_API_KEY = '';

  @IsIn(ANTHROPIC_MODELS)
  ANTHROPIC_MODEL: (typeof ANTHROPIC_MODELS)[number] = 'claude-opus-5';

  @IsIn(ANTHROPIC_EFFORTS)
  ANTHROPIC_EFFORT: (typeof ANTHROPIC_EFFORTS)[number] = 'medium';

  /** 이 시간을 넘기면 폴백으로 전환한다. 발표에서 무한 로딩을 막는 장치. */
  @Transform(toInt)
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  ANTHROPIC_TIMEOUT_MS = 30_000;

  /** false 면 키가 있어도 Claude 를 호출하지 않고 항상 폴백을 쓴다 (오프라인 리허설용). */
  @Transform(toBool)
  @IsBoolean()
  AI_COURSE_ENABLED = true;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const config = plainToInstance(EnvVars, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const lines = errors.flatMap((e) =>
      Object.values(e.constraints ?? {}).map((msg) => `  - ${e.property}: ${msg}`),
    );
    throw new Error(
      [
        '',
        '환경변수 검증에 실패했습니다. 서버를 시작할 수 없습니다.',
        ...lines,
        '',
        '해결 방법 (PowerShell):',
        '  Copy-Item .env.example .env',
        '  notepad .env',
        '',
      ].join('\n'),
    );
  }

  if (config.MOCK_LATENCY_MIN_MS > config.MOCK_LATENCY_MAX_MS) {
    throw new Error(
      `MOCK_LATENCY_MIN_MS(${config.MOCK_LATENCY_MIN_MS}) 가 MOCK_LATENCY_MAX_MS(${config.MOCK_LATENCY_MAX_MS}) 보다 큽니다.`,
    );
  }

  return config;
}
