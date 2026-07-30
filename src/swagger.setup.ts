/**
 * Swagger 구성.
 *
 * 프론트가 이 문서만 보고 붙을 수 있어야 한다 (평가 기준 ②).
 * 태그 순서는 프롬프트 §3 서비스 플로우(화면 1~9) 순서와 일치시킨다.
 */
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ErrorEnvelopeDto, ResponseMetaDto } from './common/dto/envelope.dto';

const DESCRIPTION = `
과소비를 진단하고, 절약 챌린지로 아낀 돈을 **호남 여행으로 처방**하는 서비스의 백엔드 API.

### 공통 응답 봉투
모든 응답은 아래 형태로 감싸여 있습니다.

\`\`\`json
{ "success": true,  "data": { }, "meta": { } }
{ "success": false, "error": { "code": "…", "message": "…", "details": [] } }
\`\`\`

프론트는 HTTP 상태가 아니라 **\`error.code\` 문자열로 분기**하세요.

### 필드 규약
- \`~Amount\` 로 끝나는 필드는 **원 단위 정수**입니다. (소수·문자열 아님)
- \`~Rate\` 로 끝나는 필드는 **0.0 ~ 1.0 소수**입니다.
- 모든 날짜는 **KST ISO 문자열** (\`2026-07-30T19:24:00.000+09:00\`) 입니다.
- 목록 조회는 커서 페이지네이션 (\`?cursor=&limit=\`) 을 씁니다.

### 인증
\`POST /api/v1/auth/login\` 으로 accessToken 을 받은 뒤,
우측 상단 **Authorize** 버튼에 토큰을 넣으면 이하 모든 요청에 적용됩니다.
`;

/** 화면 플로우 순서대로 태그를 선언한다 — Swagger UI 에 이 순서로 표시된다. */
const TAGS: { name: string; description: string }[] = [
  { name: 'health', description: '서버 상태 확인 (발표 전 점검용)' },
  { name: 'auth', description: '① 시작 / 온보딩 — 로그인' },
  { name: 'connections', description: '② 결제수단 연동 — 카드사·은행 1회 연동' },
  { name: 'transactions', description: '③ 소비 분석 — 거래 수집·분류·직접 확인' },
  { name: 'analysis', description: '③ 소비 분석 — 6개월 집계' },
  { name: 'persona', description: '④ 페르소나 부여' },
  { name: 'saving-goals', description: '⑤ 절약 목표 설정' },
  { name: 'challenges', description: '⑥⑦ 챌린지 플랜 생성 및 진행' },
  { name: 'travel', description: '⑧ 여행 처방 — 호남 소멸위험지역' },
  { name: 'rewards', description: '⑨ 보상 — 뱃지 · 쿠폰' },
  { name: 'demo', description: '발표 전용 — DEMO_MODE=true 일 때만 등록됨' },
];

export function setupSwagger(app: INestApplication, path: string): void {
  const builder = new DocumentBuilder()
    .setTitle('야호(Yaho) API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'accessToken',
    )
    .addServer('/api/v1', '기본 베이스 경로');

  for (const tag of TAGS) builder.addTag(tag.name, tag.description);

  const document = SwaggerModule.createDocument(app, builder.build(), {
    extraModels: [ErrorEnvelopeDto, ResponseMetaDto],
  });

  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 새로고침해도 토큰 유지 — 발표 중 재로그인 방지
      docExpansion: 'list',
      tagsSorter: undefined, // 위에서 선언한 화면 플로우 순서를 유지한다
      operationsSorter: undefined,
      displayRequestDuration: true,
    },
    customSiteTitle: '야호 API 문서',
  });
}
