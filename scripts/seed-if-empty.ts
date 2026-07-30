/**
 * 배포 환경용 조건부 시드.
 *
 * ── 왜 조건부인가 ────────────────────────────────────────────────────────────
 * `db:seed` 는 모든 테이블을 비우고 다시 채운다. 배포 서버가 재시작될 때마다 그걸 돌리면
 * 심사위원이 만들어 둔 챌린지·페르소나가 통째로 날아간다. Railway 는 코드 push,
 * 환경변수 변경, 인스턴스 재배치 등으로 생각보다 자주 재시작된다.
 *
 * 그래서 **참조 데이터가 비어 있을 때만** 시드를 돌린다. 첫 배포에서 한 번 채워지고,
 * 이후 재시작에서는 건너뛴다.
 *
 * 참조 데이터를 다시 만들고 싶으면 Railway 콘솔에서 직접 `npm run db:seed` 를 실행하면 된다.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // 여행지를 기준으로 삼는다 — 시드가 만드는 참조 데이터 중 가장 늦게 채워지는 축이라
    // 이게 있으면 나머지도 있다고 봐도 된다.
    const destinations = await prisma.travelDestination.count();
    const users = await prisma.user.count();

    if (destinations > 0 && users > 0) {
      console.log(
        `[seed-if-empty] 이미 채워져 있습니다 (여행지 ${destinations}곳 / 사용자 ${users}명). 건너뜁니다.`,
      );
      return;
    }

    console.log(
      `[seed-if-empty] 비어 있습니다 (여행지 ${destinations}곳 / 사용자 ${users}명). 시드를 실행합니다.`,
    );
  } finally {
    await prisma.$disconnect();
  }

  // 시드는 자체 PrismaClient 를 열고 닫으므로 별도 프로세스로 돌린다.
  // ts-node 를 직접 부르지 않고 node 로 진입점을 실행해 Windows/Linux 차이를 피한다.
  const tsNode = require.resolve('ts-node/dist/bin.js');
  const seedEntry = path.join(__dirname, '..', 'prisma', 'seed', 'index.ts');

  const result = spawnSync(process.execPath, [tsNode, seedEntry], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error('[seed-if-empty] 시드가 실패했습니다.');
    process.exit(result.status ?? 1);
  }
}

void main();
