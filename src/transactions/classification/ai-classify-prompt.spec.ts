/**
 * AI 분류 출력 검증 테스트.
 *
 * 여기서 지키려는 것은 하나다 — **모델 출력을 그대로 믿지 않는다.**
 * 환각·중복·누락·열거값 이탈이 들어와도 나머지 판정은 살아남아야 하고,
 * 잘못된 판정이 DB 로 새어 들어가면 안 된다.
 */
import {
  buildClassifyUserPrompt,
  chunkMerchants,
  validateVerdicts,
  type AiClassifyDraft,
  type MerchantForClassification,
} from './ai-classify-prompt';
import { buildMerchantProfiles } from './ai-classifier.service';
import { kstDate } from '../../common/utils/date-kst';
import type { ClassifiableTransaction } from './rule-engine';

function verdict(
  normalizedMerchant: string,
  category: string,
  confidence = 'HIGH',
): AiClassifyDraft['verdicts'][number] {
  return { normalizedMerchant, category, confidence, reason: '테스트' };
}

function makeTx(overrides: Partial<ClassifiableTransaction> = {}): ClassifiableTransaction {
  return {
    providerTxId: 'tx-1',
    merchantName: '테스트가맹점',
    normalizedMerchant: '테스트가맹점',
    matchTarget: '테스트가맹점',
    amount: 10_000,
    txType: 'APPROVAL',
    mcc: null,
    approvalNo: null,
    counterpartKey: null,
    approvedAt: kstDate(2026, 7, 15, 19, 0),
    ...overrides,
  };
}

describe('validateVerdicts — 채택', () => {
  it('요청한 가맹점의 정상 판정을 채택한다', () => {
    const r = validateVerdicts({ verdicts: [verdict('본죽', 'DINING_OUT')] }, ['본죽']);
    expect(r.accepted).toEqual([
      { normalizedMerchant: '본죽', category: 'DINING_OUT', confidence: 'HIGH', reason: '테스트' },
    ]);
    expect(r.missing).toEqual([]);
  });

  it('reason 이 길면 100자로 자른다', () => {
    const r = validateVerdicts(
      { verdicts: [{ normalizedMerchant: '본죽', category: 'DINING_OUT', confidence: 'HIGH', reason: '가'.repeat(300) }] },
      ['본죽'],
    );
    expect(r.accepted[0].reason).toHaveLength(100);
  });
});

describe('validateVerdicts — 방어', () => {
  it('요청하지 않은 가맹점(환각)은 버리고 unknown 에 남긴다', () => {
    const r = validateVerdicts(
      { verdicts: [verdict('본죽', 'DINING_OUT'), verdict('있지도않은가게', 'SHOPPING')] },
      ['본죽'],
    );
    expect(r.accepted).toHaveLength(1);
    expect(r.unknown).toEqual(['있지도않은가게']);
  });

  it('열거값 밖의 카테고리는 버린다', () => {
    const r = validateVerdicts({ verdicts: [verdict('본죽', 'FOOD')] }, ['본죽']);
    expect(r.accepted).toEqual([]);
    expect(r.missing).toEqual([]); // 응답은 왔으니 missing 은 아니다
  });

  it('열거값 밖의 확신도는 버린다', () => {
    const r = validateVerdicts({ verdicts: [verdict('본죽', 'DINING_OUT', 'VERY_SURE')] }, ['본죽']);
    expect(r.accepted).toEqual([]);
  });

  it('같은 가맹점이 두 번 오면 먼저 온 것만 쓴다', () => {
    const r = validateVerdicts(
      { verdicts: [verdict('본죽', 'DINING_OUT'), verdict('본죽', 'SHOPPING')] },
      ['본죽'],
    );
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].category).toBe('DINING_OUT');
  });

  it('빠뜨린 가맹점을 missing 으로 보고한다', () => {
    const r = validateVerdicts({ verdicts: [verdict('본죽', 'DINING_OUT')] }, ['본죽', '무신사']);
    expect(r.missing).toEqual(['무신사']);
  });

  it('응답이 통째로 없어도 터지지 않는다', () => {
    expect(validateVerdicts(null, ['본죽']).missing).toEqual(['본죽']);
    expect(validateVerdicts(undefined, ['본죽']).accepted).toEqual([]);
    expect(validateVerdicts({ verdicts: [] }, ['본죽']).missing).toEqual(['본죽']);
  });
});

describe('validateVerdicts — 모델이 물러선 경우는 실패가 아니다', () => {
  it('UNCLASSIFIED 는 채택하지 않고 규칙 엔진으로 넘긴다', () => {
    const r = validateVerdicts({ verdicts: [verdict('수수께끼상회', 'UNCLASSIFIED')] }, ['수수께끼상회']);
    expect(r.accepted).toEqual([]);
    expect(r.lowConfidence).toEqual(['수수께끼상회']);
    expect(r.missing).toEqual([]);
  });

  it('confidence LOW 는 카테고리가 멀쩡해도 넘긴다', () => {
    const r = validateVerdicts({ verdicts: [verdict('수수께끼상회', 'SHOPPING', 'LOW')] }, ['수수께끼상회']);
    expect(r.accepted).toEqual([]);
    expect(r.lowConfidence).toEqual(['수수께끼상회']);
  });

  it('MEDIUM 은 채택한다', () => {
    const r = validateVerdicts({ verdicts: [verdict('수수께끼상회', 'SHOPPING', 'MEDIUM')] }, ['수수께끼상회']);
    expect(r.accepted).toHaveLength(1);
  });
});

describe('chunkMerchants', () => {
  it('배치 크기로 자른다', () => {
    expect(chunkMerchants([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('배치보다 적으면 한 덩어리다', () => {
    expect(chunkMerchants([1, 2], 60)).toEqual([[1, 2]]);
  });

  it('빈 목록이면 배치도 없다', () => {
    expect(chunkMerchants([], 60)).toEqual([]);
  });
});

describe('buildMerchantProfiles', () => {
  it('같은 가맹점을 하나로 묶고 평균 결제액을 낸다', () => {
    const profiles = buildMerchantProfiles(
      [
        makeTx({ normalizedMerchant: '본죽', amount: 10_000 }),
        makeTx({ normalizedMerchant: '본죽', amount: 20_000 }),
      ],
      new Set(),
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].txCount).toBe(2);
    expect(profiles[0].avgAmount).toBe(15_000);
  });

  it('사용자 규칙이 이미 있는 가맹점은 묻지 않는다', () => {
    const profiles = buildMerchantProfiles(
      [makeTx({ normalizedMerchant: '본죽' }), makeTx({ normalizedMerchant: '무신사' })],
      new Set(['본죽']),
    );
    expect(profiles.map((p) => p.normalizedMerchant)).toEqual(['무신사']);
  });

  it('수입·취소는 거래유형만으로 끝나므로 묻지 않는다', () => {
    const profiles = buildMerchantProfiles(
      [
        makeTx({ normalizedMerchant: '(주)야호컴퍼니', txType: 'TRANSFER_IN' }),
        makeTx({ normalizedMerchant: '취소건', txType: 'CANCEL' }),
        makeTx({ normalizedMerchant: '본죽' }),
      ],
      new Set(),
    );
    expect(profiles.map((p) => p.normalizedMerchant)).toEqual(['본죽']);
  });

  it('건수 많은 순으로 정렬한다 — 동점이면 이름순 (배치 경계 재현성)', () => {
    const profiles = buildMerchantProfiles(
      [
        makeTx({ normalizedMerchant: '나가게' }),
        makeTx({ normalizedMerchant: '가가게' }),
        makeTx({ normalizedMerchant: '많은가게' }),
        makeTx({ normalizedMerchant: '많은가게' }),
      ],
      new Set(),
    );
    expect(profiles.map((p) => p.normalizedMerchant)).toEqual(['많은가게', '가가게', '나가게']);
  });

  it('결제가 가장 잦은 KST 시각을 뽑는다', () => {
    const profiles = buildMerchantProfiles(
      [
        makeTx({ normalizedMerchant: '야식집', approvedAt: kstDate(2026, 7, 1, 23, 0) }),
        makeTx({ normalizedMerchant: '야식집', approvedAt: kstDate(2026, 7, 2, 23, 30) }),
        makeTx({ normalizedMerchant: '야식집', approvedAt: kstDate(2026, 7, 3, 12, 0) }),
      ],
      new Set(),
    );
    expect(profiles[0].peakHour).toBe(23);
  });

  it('MCC 는 처음 나온 값을 쓴다', () => {
    const profiles = buildMerchantProfiles(
      [
        makeTx({ normalizedMerchant: '본죽', mcc: null }),
        makeTx({ normalizedMerchant: '본죽', mcc: '5812' }),
      ],
      new Set(),
    );
    expect(profiles[0].mcc).toBe('5812'); // 첫 건이 null 이면 다음 값으로 채운다
  });
});

describe('buildClassifyUserPrompt', () => {
  const merchant: MerchantForClassification = {
    normalizedMerchant: '본죽',
    sampleMerchantName: '배민)본죽 광주상무점',
    txCount: 7,
    avgAmount: 12_500,
    peakHour: 21,
    mcc: '5812',
  };

  it('정규화명과 원본 이름을 둘 다 싣는다 — 채널 접두가 단서다', () => {
    const prompt = buildClassifyUserPrompt({ merchants: [merchant] });
    expect(prompt).toContain('"본죽"');
    expect(prompt).toContain('배민)본죽 광주상무점');
  });

  it('선택 정보가 없으면 그 항목을 아예 빼서 빈 값을 보내지 않는다', () => {
    const prompt = buildClassifyUserPrompt({
      merchants: [{ ...merchant, peakHour: null, mcc: null }],
    });
    expect(prompt).not.toContain('MCC');
    expect(prompt).not.toContain('주로');
  });

  it('가맹점 수를 명시해 누락을 줄인다', () => {
    const prompt = buildClassifyUserPrompt({ merchants: [merchant, { ...merchant, normalizedMerchant: '무신사' }] });
    expect(prompt).toContain('2곳');
  });
});
