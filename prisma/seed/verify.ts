/**
 * 시드 자체 검증.
 *
 * 프롬프트 §4-3 이 요구하는 소비 패턴이 실제로 만들어졌는지 코드로 확인한다.
 * 하나라도 어긋나면 시드를 실패시킨다 — "발표 품질"을 사람 눈이 아니라
 * assert 로 고정하는 장치다. 시드 파라미터를 튜닝하다 패턴이 깨지면 즉시 알 수 있다.
 */
import { formatWon } from '../../src/common/utils/money';

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export class SeedVerifier {
  private readonly checks: Check[] = [];

  expectRange(label: string, actual: number, min: number, max: number, unit = '건'): void {
    const ok = actual >= min && actual <= max;
    this.checks.push({
      label,
      ok,
      detail: `${actual}${unit} (기대: ${min}~${max}${unit})`,
    });
  }

  expectAtLeast(label: string, actual: number, min: number, unit = '건'): void {
    this.checks.push({
      label,
      ok: actual >= min,
      detail: `${actual}${unit} (기대: ${min}${unit} 이상)`,
    });
  }

  expectAmountAtLeast(label: string, actual: number, min: number): void {
    this.checks.push({
      label,
      ok: actual >= min,
      detail: `${formatWon(actual)} (기대: ${formatWon(min)} 이상)`,
    });
  }

  expectEqual(label: string, actual: number, expected: number, unit = '건'): void {
    this.checks.push({
      label,
      ok: actual === expected,
      detail: `${actual}${unit} (기대: ${expected}${unit})`,
    });
  }

  expectTrue(label: string, ok: boolean, detail: string): void {
    this.checks.push({ label, ok, detail });
  }

  /** 결과를 표로 출력하고, 실패가 있으면 예외를 던진다. */
  report(): void {
    const width = Math.max(...this.checks.map((c) => c.label.length)) + 2;
    console.log('\n  시드 검증 (프롬프트 §4-3 소비 패턴)');
    console.log('  ' + '─'.repeat(width + 42));
    for (const c of this.checks) {
      const mark = c.ok ? '✓' : '✗';
      console.log(`  ${mark} ${c.label.padEnd(width)} ${c.detail}`);
    }
    console.log('  ' + '─'.repeat(width + 42));

    const failed = this.checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      throw new Error(
        `시드 검증 실패 ${failed.length}건:\n` +
          failed.map((f) => `  - ${f.label}: ${f.detail}`).join('\n') +
          '\n\nprisma/seed/transactions.ts 의 CATEGORY_PLANS 를 조정하세요.',
      );
    }
    console.log(`  전체 ${this.checks.length}개 항목 통과\n`);
  }
}
