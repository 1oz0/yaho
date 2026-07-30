/**
 * use-db.ts 와 prisma-cli.ts 가 공유하는 경로/해석 로직.
 *
 * 설계 의도 (docs/design.md §0-1 참조)
 *  - prisma/schema.prisma (PostgreSQL) 가 유일한 저작 원본이다.
 *  - schema.sqlite.prisma 는 여기서 "생성"된다. 손으로 편집하면 안 된다.
 *  - 활성 스키마 경로는 prisma/.active-schema 에 기록되고,
 *    모든 prisma 명령이 그 파일을 읽어 --schema 로 넘긴다.
 */
import * as fs from 'fs';
import * as path from 'path';

export type DbTarget = 'postgres' | 'sqlite';

export const ROOT = path.resolve(__dirname, '..');
export const PRISMA_DIR = path.join(ROOT, 'prisma');
export const BASE_SCHEMA = path.join(PRISMA_DIR, 'schema.prisma');
export const SQLITE_SCHEMA = path.join(PRISMA_DIR, 'schema.sqlite.prisma');
export const ACTIVE_MARKER = path.join(PRISMA_DIR, '.active-schema');
export const ENV_FILE = path.join(ROOT, '.env');

export const DEFAULT_URL: Record<DbTarget, string> = {
  sqlite: 'file:./dev.db',
  postgres: 'postgresql://postgres:postgres@localhost:5432/yaho?schema=public',
};

/**
 * .prisma 파일 쓰기.
 *
 * ⚠️ BOM 금지. Prisma 파서는 UTF-8 BOM 이 붙은 스키마를 P1012 로 거부한다.
 *    (PowerShell 의 `Set-Content -Encoding utf8` 이 BOM 을 붙이기 때문에
 *     이 전환 로직은 PowerShell 이 아니라 Node 로 구현해야 한다.)
 */
export function writeSchemaFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, stripBom(content), 'utf8');
}

/** 선두 BOM(U+FEFF) 제거 */
export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export function readBaseSchema(): string {
  if (!fs.existsSync(BASE_SCHEMA)) {
    throw new Error(`저작 원본 스키마를 찾을 수 없습니다: ${BASE_SCHEMA}`);
  }
  return fs.readFileSync(BASE_SCHEMA, 'utf8').replace(/^\uFEFF/, '');
}

/** 현재 활성 스키마의 절대 경로. 마커가 없으면 PostgreSQL 원본이 기본. */
export function resolveActiveSchema(): string {
  if (fs.existsSync(ACTIVE_MARKER)) {
    const recorded = fs.readFileSync(ACTIVE_MARKER, 'utf8').trim();
    const abs = path.isAbsolute(recorded) ? recorded : path.join(ROOT, recorded);
    if (fs.existsSync(abs)) return abs;
  }
  return BASE_SCHEMA;
}

export function writeActiveMarker(schemaPath: string): void {
  writeSchemaFile(ACTIVE_MARKER, path.relative(ROOT, schemaPath).split(path.sep).join('/'));
}

/**
 * 설치된 prisma CLI 의 진입 JS 파일 경로.
 *
 * node_modules/.bin/prisma.cmd 를 shell 로 호출하지 않고 node 로 직접 실행한다.
 * 경로에 한글·공백이 있어도 쉘 따옴표 문제가 생기지 않는다 (이 프로젝트 경로에 한글이 있다).
 */
export function resolvePrismaCli(): string {
  const pkgJsonPath = require.resolve('prisma/package.json', { paths: [ROOT] });
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prisma;
  if (!rel) throw new Error('prisma 패키지에서 CLI 진입점을 찾지 못했습니다.');
  return path.join(path.dirname(pkgJsonPath), rel);
}
