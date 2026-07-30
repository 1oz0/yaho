/**
 * 페르소나 카탈로그 시드 — 48행.
 *
 * 데이터 원본은 `페르소나 완성.xlsx` → prisma/seed/data/personas.data.ts
 * 문구를 바꾸려면 그 파일만 고치면 된다. 서비스 코드는 손댈 필요가 없다.
 */
import type { PrismaClient } from '@prisma/client';

import { buildPersonaRows } from './data/personas.data';

export { EXPECTED_PERSONA_COUNT } from './data/personas.data';

export async function seedPersonas(prisma: PrismaClient): Promise<number> {
  const rows = buildPersonaRows();
  await prisma.persona.createMany({
    data: rows.map((r) => ({
      code: r.code,
      timeBand: r.timeBand,
      category: r.category,
      displayName: r.displayName,
      tagline: r.tagline,
      description: r.description,
      iconKey: r.iconKey,
    })),
  });
  return rows.length;
}
