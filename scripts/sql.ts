/**
 * 임의 SQL 실행기 — DB 안을 직접 들여다보기 위한 도구.
 *
 *   npm run db:sql "SELECT * FROM \"transaction\" LIMIT 5"
 *   npm run db:sql -- --file scripts/queries/spending.sql
 *   npm run db:sql                      (인자 없으면 자주 쓰는 조회 목록을 보여준다)
 *
 * sqlite3 CLI 가 Windows 에 기본 설치되어 있지 않아, 이미 있는 Prisma 연결을 그대로 쓴다.
 * SQLite / PostgreSQL 어느 쪽이 활성이든 동일하게 동작한다.
 *
 * ⚠️ 개발·확인 전용이다. 사용자 입력을 여기에 흘려보내지 말 것 (SQL 을 그대로 실행한다).
 */
import * as fs from 'fs';
import * as path from 'path';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * 자주 쓰는 조회 — 이름으로 바로 부를 수 있다.
 *
 * ⚠️ SQLite 시각 함수 주의: Prisma 는 DateTime 을 **유닉스 epoch 밀리초 정수**로 저장한다.
 *    `date(approvedAt, '+9 hours')` 는 빈 값을 낸다. 반드시 초로 나누고 unixepoch 를 붙일 것:
 *      date(approvedAt/1000, 'unixepoch', '+9 hours')
 */
const PRESETS: Record<string, { label: string; sql: string }> = {
  tables: {
    label: '테이블 목록과 행 수',
    sql: `SELECT name FROM sqlite_master
          WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'
          ORDER BY name`,
  },
  accounts: {
    label: '연동 계좌와 계좌별 지출 집계',
    sql: `SELECT la.accountNumberMasked AS 계좌번호, la.productName AS 상품명,
                 la.type AS 종류,
                 COUNT(t.id) AS 거래건수,
                 SUM(CASE WHEN t.txType = 'APPROVAL' THEN t.amount ELSE 0 END) AS 지출합계,
                 SUM(CASE WHEN t.txType = 'TRANSFER_IN' THEN t.amount ELSE 0 END) AS 입금합계,
                 MIN(date(t.approvedAt/1000, 'unixepoch', '+9 hours')) AS 최초거래,
                 MAX(date(t.approvedAt/1000, 'unixepoch', '+9 hours')) AS 최종거래
          FROM linked_account la
          LEFT JOIN "transaction" t ON t.linkedAccountId = la.id
          GROUP BY la.id ORDER BY 지출합계 DESC`,
  },
  ledger: {
    label: '계좌별 거래 원장 최근 20건',
    sql: `SELECT date(t.approvedAt/1000, 'unixepoch', '+9 hours') AS 날짜,
                 la.accountNumberMasked AS 계좌, t.merchantName AS 가맹점,
                 t.amount AS 금액, t.txType AS 유형, t.category AS 카테고리
          FROM "transaction" t
          JOIN linked_account la ON la.id = t.linkedAccountId
          ORDER BY t.approvedAt DESC LIMIT 20`,
  },
  spending: {
    label: '지출 내역 최근 20건 (분류 결과 포함)',
    sql: `SELECT date(approvedAt/1000, 'unixepoch', '+9 hours') AS 날짜_KST,
                 merchantName AS 가맹점, amount AS 금액,
                 category AS 카테고리, classifiedBy AS 분류근거,
                 CASE isRecurring WHEN 1 THEN '정기' ELSE '' END AS 정기결제
          FROM "transaction"
          ORDER BY approvedAt DESC LIMIT 20`,
  },
  bycategory: {
    label: '카테고리별 지출 합계 (6개월 누적)',
    sql: `SELECT category AS 카테고리, COUNT(*) AS 건수, SUM(amount) AS 합계,
                 ROUND(SUM(amount) / 6.0) AS 월평균
          FROM "transaction"
          WHERE txType = 'APPROVAL' AND category NOT IN ('EXCLUDED')
          GROUP BY category ORDER BY 합계 DESC`,
  },
  bymonth: {
    label: '월별 지출 추이',
    sql: `SELECT strftime('%Y-%m', approvedAt/1000, 'unixepoch', '+9 hours') AS 월,
                 COUNT(*) AS 건수, SUM(amount) AS 합계
          FROM "transaction"
          WHERE txType = 'APPROVAL' AND category NOT IN ('EXCLUDED')
          GROUP BY 월 ORDER BY 월`,
  },
  source: {
    label: '거래의 출처 — mock_transaction 과 1:1 대응하는지',
    sql: `SELECT t.providerTxId, t.merchantName AS 서비스DB, m.merchantName AS 가상금융DB,
                 t.amount, t.category AS 분류결과
          FROM "transaction" t
          LEFT JOIN mock_transaction m ON m.id = t.providerTxId
          ORDER BY t.approvedAt DESC LIMIT 10`,
  },
  users: {
    label: '등록된 사용자 전체',
    sql: `SELECT id, email, name, ageBand, regionCode, createdAt FROM app_user`,
  },
  aicourse: {
    label: 'AI 여행코스와 경유지',
    sql: `SELECT c.title AS 코스, c.generatedBy AS 생성주체, c.modelName AS 모델,
                 s.sortOrder AS 순서, s.arrivalTime AS 도착, s.placeName AS 장소,
                 s.estimatedAmount AS 비용
          FROM ai_travel_course c
          JOIN ai_travel_course_stop s ON s.courseId = c.id
          ORDER BY c.createdAt DESC, s.sortOrder`,
  },
};

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log('  (결과 없음)');
    return;
  }

  const cols = Object.keys(rows[0]);
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'bigint') return v.toString();
    return String(v);
  };

  // 한글·한자·전각기호는 터미널에서 폭이 2다. 그대로 padEnd 하면 열이 어긋난다.
  // 코드포인트를 이스케이프로 적는다 — 전각 공백(U+3000)을 소스에 그대로 넣으면
  // 눈에 보이지 않는 문자가 되어 lint(no-irregular-whitespace)에 걸린다.
  const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
  const width = (s: string): number =>
    [...s].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0);
  const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - width(s)));

  const widths = cols.map((c) =>
    Math.max(width(c), ...rows.map((r) => width(cell(r[c])))),
  );

  console.log('  ' + cols.map((c, i) => pad(c, widths[i])).join('  '));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) {
    console.log('  ' + cols.map((c, i) => pad(cell(r[c]), widths[i])).join('  '));
  }
  console.log(`\n  ${rows.length}행`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prisma = new PrismaClient();

  try {
    if (args.length === 0) {
      console.log('\n사용법:');
      console.log('  npm run db:sql <프리셋 이름>');
      console.log('  npm run db:sql "SELECT * FROM app_user"');
      console.log('  npm run db:sql --file 경로.sql\n');
      console.log('프리셋:');
      for (const [key, { label }] of Object.entries(PRESETS)) {
        console.log(`  ${key.padEnd(12)} ${label}`);
      }
      console.log(`\n현재 DB: ${process.env.DATABASE_URL ?? '(미설정)'}\n`);
      return;
    }

    let sql: string;
    let title = '';

    if (args[0] === '--file') {
      const file = path.resolve(args[1]);
      sql = fs.readFileSync(file, 'utf8');
      title = file;
    } else if (PRESETS[args[0]]) {
      sql = PRESETS[args[0]].sql;
      title = PRESETS[args[0]].label;
    } else {
      sql = args.join(' ');
    }

    if (title) console.log(`\n${title}`);
    console.log('');

    const rows = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    printTable(Array.isArray(rows) ? rows : [rows]);
    console.log('');
  } catch (error) {
    console.error('\nSQL 실행 실패:');
    console.error(`  ${error instanceof Error ? error.message.split('\n')[0] : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
