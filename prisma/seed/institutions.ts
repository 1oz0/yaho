/**
 * 가상 금융기관 시드.
 *
 * 실제 오픈뱅킹·마이데이터는 연동하지 않는다. 대신 "진짜 금융기관 서버가 있는 것처럼"
 * mock_* 테이블을 채우고, 서비스는 FinancialProviderPort 를 통해서만 접근한다.
 */
import * as bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

import { kstDate } from '../../src/common/utils/date-kst';

export interface SeededAccount {
  id: string;
  institutionCode: string;
  type: 'CARD' | 'BANK';
  /** 시드 거래를 어떤 성격으로 채울지 */
  usage: 'PRIMARY_CARD' | 'SECONDARY_CARD' | 'MAIN_BANK' | 'SUB_BANK';
}

export interface SeededInstitutions {
  ownerName: string;
  loginId: string;
  accounts: SeededAccount[];
}

const INSTITUTIONS = [
  { code: 'SHINHAN_CARD', name: '신한카드', type: 'CARD', logoKey: 'shinhan', brandColor: '#0046FF', sortOrder: 1 },
  { code: 'KB_CARD', name: 'KB국민카드', type: 'CARD', logoKey: 'kbcard', brandColor: '#FFBC00', sortOrder: 2 },
  { code: 'HYUNDAI_CARD', name: '현대카드', type: 'CARD', logoKey: 'hyundai', brandColor: '#1A1A1A', sortOrder: 3 },
  { code: 'KAKAO_BANK', name: '카카오뱅크', type: 'BANK', logoKey: 'kakaobank', brandColor: '#FFE300', sortOrder: 4 },
  { code: 'TOSS_BANK', name: '토스뱅크', type: 'BANK', logoKey: 'tossbank', brandColor: '#3182F6', sortOrder: 5 },
  { code: 'NH_BANK', name: 'NH농협은행', type: 'BANK', logoKey: 'nhbank', brandColor: '#1EB459', sortOrder: 6 },
] as const;

/** 기관별 계좌·카드 정의. usage 는 거래 시드가 어디에 무엇을 넣을지 결정한다. */
const ACCOUNTS: {
  institutionCode: string;
  type: 'CARD' | 'BANK';
  productName: string;
  accountNumberMasked: string;
  usage: SeededAccount['usage'];
  openedAt: Date;
}[] = [
  {
    institutionCode: 'SHINHAN_CARD',
    type: 'CARD',
    productName: '신한카드 Deep Dream 체크',
    accountNumberMasked: '4512-****-****-8821',
    usage: 'PRIMARY_CARD',
    openedAt: kstDate(2022, 3, 14),
  },
  {
    institutionCode: 'KB_CARD',
    type: 'CARD',
    productName: 'KB국민 노리 체크카드',
    accountNumberMasked: '5388-****-****-1043',
    usage: 'SECONDARY_CARD',
    openedAt: kstDate(2023, 8, 2),
  },
  {
    institutionCode: 'KAKAO_BANK',
    type: 'BANK',
    productName: '카카오뱅크 입출금통장',
    accountNumberMasked: '3333-**-7712045',
    usage: 'MAIN_BANK',
    openedAt: kstDate(2021, 5, 20),
  },
  {
    institutionCode: 'TOSS_BANK',
    type: 'BANK',
    productName: '토스뱅크 통장',
    accountNumberMasked: '1000-****-3092',
    usage: 'SUB_BANK',
    openedAt: kstDate(2023, 1, 9),
  },
];

export async function seedInstitutions(
  prisma: PrismaClient,
  options: { loginId: string; password: string; ownerName: string },
): Promise<SeededInstitutions> {
  const passwordHash = await bcrypt.hash(options.password, 8);

  const institutionIdByCode = new Map<string, string>();
  for (const inst of INSTITUTIONS) {
    const created = await prisma.mockInstitution.create({ data: { ...inst } });
    institutionIdByCode.set(inst.code, created.id);
  }

  // 모든 기관에 동일한 로그인 자격증명을 심는다 (데모 편의).
  const credentialIdByCode = new Map<string, string>();
  for (const inst of INSTITUTIONS) {
    const cred = await prisma.mockUserCredential.create({
      data: {
        institutionId: institutionIdByCode.get(inst.code)!,
        loginId: options.loginId,
        passwordHash,
        ownerName: options.ownerName,
      },
    });
    credentialIdByCode.set(inst.code, cred.id);
  }

  const accounts: SeededAccount[] = [];
  for (const acc of ACCOUNTS) {
    const created = await prisma.mockAccount.create({
      data: {
        institutionId: institutionIdByCode.get(acc.institutionCode)!,
        credentialId: credentialIdByCode.get(acc.institutionCode)!,
        type: acc.type,
        accountNumberMasked: acc.accountNumberMasked,
        productName: acc.productName,
        ownerName: options.ownerName,
        isOwnAccount: true,
        openedAt: acc.openedAt,
      },
    });
    accounts.push({
      id: created.id,
      institutionCode: acc.institutionCode,
      type: acc.type,
      usage: acc.usage,
    });
  }

  return { ownerName: options.ownerName, loginId: options.loginId, accounts };
}

export const INSTITUTION_COUNT = INSTITUTIONS.length;
export const ACCOUNT_COUNT = ACCOUNTS.length;
