/**
 * DB 전환 스크립트.
 *
 *   npm run db:use:sqlite     — 오프라인 시연용 (별도 설치 불필요)
 *   npm run db:use:postgres   — PostgreSQL
 *
 * 하는 일
 *   1) 대상에 맞는 스키마 파일을 준비한다
 *      - postgres : prisma/schema.prisma (저작 원본을 그대로 사용)
 *      - sqlite   : prisma/schema.sqlite.prisma 를 원본에서 "생성" (datasource 블록만 치환)
 *   2) prisma/.active-schema 에 활성 스키마 경로를 기록한다
 *   3) .env 의 DATABASE_URL 이 대상 프로바이더와 어긋나면 맞춰준다
 *   4) prisma generate 까지 수행한다
 *
 * Prisma 는 datasource.provider 에 env() 를 쓸 수 없으므로 파일 치환 방식이 유일한 해법이다.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';

import {
  ACTIVE_MARKER,
  BASE_SCHEMA,
  DEFAULT_URL,
  DbTarget,
  ENV_FILE,
  ROOT,
  SQLITE_SCHEMA,
  readBaseSchema,
  resolvePrismaCli,
  writeActiveMarker,
  writeSchemaFile,
} from './schema-paths';

const GENERATED_BANNER = `// =============================================================================
// ⚠️ 자동 생성 파일 — 직접 편집하지 마세요.
//    prisma/schema.prisma 를 수정한 뒤 \`npm run db:use:sqlite\` 를 다시 실행하세요.
//    (생성 위치: scripts/use-db.ts)
// =============================================================================
`;

function parseTarget(): DbTarget {
  const raw = (process.argv[2] ?? '').toLowerCase();
  if (raw === 'sqlite') return 'sqlite';
  if (raw === 'postgres' || raw === 'postgresql') return 'postgres';
  console.error('사용법: ts-node scripts/use-db.ts <postgres|sqlite>');
  process.exit(1);
}

/** 저작 원본의 datasource 블록에서 provider 만 sqlite 로 바꾼 사본을 만든다. */
function buildSqliteSchema(base: string): string {
  const replaced = base.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');
  if (replaced === base) {
    throw new Error(
      'schema.prisma 에서 `provider = "postgresql"` 을 찾지 못했습니다. datasource 블록을 확인하세요.',
    );
  }
  return GENERATED_BANNER + replaced;
}

/** .env 의 DATABASE_URL 이 대상 프로바이더와 맞는지 확인하고, 아니면 교체한다. */
function syncEnvDatabaseUrl(target: DbTarget): void {
  if (!fs.existsSync(ENV_FILE)) {
    console.warn('  ! .env 가 없습니다. `Copy-Item .env.example .env` 를 먼저 실행하세요.');
    return;
  }

  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const match = content.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]*)"?\s*$/m);
  const current = match?.[1] ?? '';
  const isSqliteUrl = current.startsWith('file:');
  const matchesTarget = target === 'sqlite' ? isSqliteUrl : !isSqliteUrl && current.length > 0;

  if (matchesTarget) {
    console.log(`  · DATABASE_URL 유지: ${current}`);
    return;
  }

  const nextUrl = DEFAULT_URL[target];
  const line = `DATABASE_URL="${nextUrl}"`;
  const updated = match
    ? content.replace(/^\s*DATABASE_URL\s*=.*$/m, line)
    : `${content.trimEnd()}\n${line}\n`;

  fs.writeFileSync(ENV_FILE, updated, 'utf8');
  console.log(`  · DATABASE_URL 변경: ${current || '(없음)'}`);
  console.log(`                  →  ${nextUrl}`);
}

function runPrismaGenerate(schemaPath: string): void {
  const result = spawnSync(process.execPath, [resolvePrismaCli(), 'generate', '--schema', schemaPath], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error('\nprisma generate 에 실패했습니다.');
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const target = parseTarget();
  console.log(`\n[use-db] 대상 = ${target}`);

  let activeSchema: string;
  if (target === 'sqlite') {
    writeSchemaFile(SQLITE_SCHEMA, buildSqliteSchema(readBaseSchema()));
    activeSchema = SQLITE_SCHEMA;
    console.log('  · 생성: prisma/schema.sqlite.prisma');
  } else {
    activeSchema = BASE_SCHEMA;
    console.log('  · 사용: prisma/schema.prisma (저작 원본)');
  }

  writeActiveMarker(activeSchema);
  console.log(`  · 기록: ${ACTIVE_MARKER.replace(ROOT, '.')}`);

  syncEnvDatabaseUrl(target);

  console.log('  · prisma generate 실행\n');
  runPrismaGenerate(activeSchema);

  console.log(`\n[use-db] 완료. 이어서 실행하세요:`);
  console.log('  npm run db:push');
  console.log('  npm run db:seed\n');
}

main();
