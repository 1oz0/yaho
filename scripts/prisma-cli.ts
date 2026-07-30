/**
 * prisma CLI 래퍼.
 *
 * 모든 db:* npm 스크립트는 이 파일을 거친다. 활성 스키마(prisma/.active-schema)를
 * 읽어 --schema 인자로 자동 주입하므로, 사용자가 매번 경로를 기억할 필요가 없다.
 *
 *   npm run db:push      →  prisma db push --skip-generate --schema <활성>
 *   npm run db:generate  →  prisma generate --schema <활성>
 *
 * node_modules/.bin/prisma.cmd 를 쉘로 부르지 않고 node 로 CLI JS 를 직접 실행한다.
 * 프로젝트 경로에 한글이 포함돼 있어도 따옴표 문제가 발생하지 않는다.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

import { ROOT, resolveActiveSchema, resolvePrismaCli } from './schema-paths';

/** --schema 를 사용자가 직접 넘겼는지 확인 (넘겼으면 존중한다) */
function hasExplicitSchema(args: string[]): boolean {
  return args.some((a) => a === '--schema' || a.startsWith('--schema='));
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('사용법: ts-node scripts/prisma-cli.ts <prisma 명령> [옵션...]');
    process.exit(1);
  }

  const schemaPath = resolveActiveSchema();
  const finalArgs = hasExplicitSchema(args) ? args : [...args, '--schema', schemaPath];

  console.log(`[prisma] schema = ${path.relative(ROOT, schemaPath).split(path.sep).join('/')}`);
  console.log(`[prisma] prisma ${finalArgs.join(' ')}\n`);

  const result = spawnSync(process.execPath, [resolvePrismaCli(), ...finalArgs], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  process.exit(result.status ?? 1);
}

main();
