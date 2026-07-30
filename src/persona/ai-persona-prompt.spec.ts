/**
 * AI 페르소나 축 선정 — 프롬프트·검증 테스트.
 *
 * 핵심 방어선은 하나다. **모델은 페르소나를 지어낼 수 없다.**
 * 축 두 개만 고르고, 그마저 열거값 밖이면 통째로 거부되어 규칙 기반으로 되돌아간다.
 */
import {
  buildPersonaSystemPrompt,
  buildPersonaUserPrompt,
  validatePersonaDraft,
  type PersonaPromptInput,
} from './ai-persona-prompt';
import { TIME_BANDS } from '../common/constants/persona';
import { PERSONA_CATEGORIES } from '../common/constants/persona-category';

const INPUT: PersonaPromptInput = {
  categories: [
    { category: 'DELIVERY_FOOD', label: '배달음식', monthlyAvgAmount: 181_050, shareRate: 0.189, txCount: 42 },
    { category: 'DINING_OUT', label: '외식', monthlyAvgAmount: 172_400, shareRate: 0.18, txCount: 23 },
    { category: 'GAME_INAPP', label: '게임+인앱', monthlyAvgAmount: 0, shareRate: 0, txCount: 0 },
  ],
  timeBands: [
    { timeBand: 'EVENING', label: '저녁형', txCount: 120, shareRate: 0.41 },
    { timeBand: 'NIGHT', label: '심야형', txCount: 90, shareRate: 0.31 },
    { timeBand: 'LUNCH', label: '점심형', txCount: 60, shareRate: 0.2 },
    { timeBand: 'MORNING', label: '아침형', txCount: 23, shareRate: 0.08 },
  ],
  monthlyAvgTotalAmount: 959_507,
  benchmarkAmount: 650_000,
  spendingRatio: 1.4762,
  monthsCovered: 6,
  topMerchants: [{ name: '배민', category: '배달음식', txCount: 42, totalAmount: 1_086_300 }],
  ruleBaseline: { timeBand: 'EVENING', category: 'DELIVERY_FOOD' },
};

describe('buildPersonaSystemPrompt', () => {
  it('고를 수 있는 축을 전부 영문 코드로 나열한다', () => {
    const prompt = buildPersonaSystemPrompt();
    for (const band of TIME_BANDS) expect(prompt).toContain(band);
    for (const category of PERSONA_CATEGORIES) expect(prompt).toContain(category);
  });

  it('페르소나 이름을 짓지 말라고 못 박는다', () => {
    expect(buildPersonaSystemPrompt()).toContain('페르소나 이름을 짓지 마세요');
  });

  it('금액을 새로 계산하지 말라고 못 박는다', () => {
    expect(buildPersonaSystemPrompt()).toContain('금액을 새로 계산하지 마세요');
  });
});

describe('buildPersonaUserPrompt', () => {
  it('카테고리 비중과 시간대 비중을 함께 싣는다', () => {
    const prompt = buildPersonaUserPrompt(INPUT);
    expect(prompt).toContain('DELIVERY_FOOD');
    expect(prompt).toContain('18.9%');
    expect(prompt).toContain('EVENING');
    expect(prompt).toContain('41.0%');
  });

  it('지출이 0인 카테고리는 빼서 노이즈를 줄인다', () => {
    expect(buildPersonaUserPrompt(INPUT)).not.toContain('GAME_INAPP');
  });

  it('규칙 기반 결과를 참고값으로 주되 따를 의무가 없다고 명시한다', () => {
    const prompt = buildPersonaUserPrompt(INPUT);
    expect(prompt).toContain('EVENING × DELIVERY_FOOD');
    expect(prompt).toContain('동의하지 않으면 다르게 고르세요');
  });

  it('또래 대비 배수를 그대로 인용할 수 있게 넣는다', () => {
    expect(buildPersonaUserPrompt(INPUT)).toContain('1.48배');
  });

  it('대표 가맹점이 없으면 그 섹션 자체를 빼서 빈 목록을 보내지 않는다', () => {
    const prompt = buildPersonaUserPrompt({ ...INPUT, topMerchants: [] });
    expect(prompt).not.toContain('대표 가맹점');
  });
});

describe('validatePersonaDraft', () => {
  const good = {
    timeBand: 'NIGHT',
    category: 'DELIVERY_FOOD',
    reason: '배달음식이 18.9%로 가장 높습니다.',
    headline: '하루를 배달로 마무리하는 소비',
  };

  it('정상 응답을 통과시킨다', () => {
    const r = validatePersonaDraft(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.axes.timeBand).toBe('NIGHT');
      expect(r.axes.category).toBe('DELIVERY_FOOD');
    }
  });

  it('열거값 밖 시간대는 통째로 거부한다', () => {
    const r = validatePersonaDraft({ ...good, timeBand: 'DAWN' });
    expect(r).toEqual({ ok: false, reason: 'BAD_TIME_BAND' });
  });

  it('열거값 밖 카테고리는 통째로 거부한다', () => {
    const r = validatePersonaDraft({ ...good, category: 'CRYPTO' });
    expect(r).toEqual({ ok: false, reason: 'BAD_CATEGORY' });
  });

  it('축에 없는 카테고리(FIXED_BILLS)도 거부한다', () => {
    const r = validatePersonaDraft({ ...good, category: 'FIXED_BILLS' });
    expect(r).toEqual({ ok: false, reason: 'BAD_CATEGORY' });
  });

  it('응답이 없으면 EMPTY', () => {
    expect(validatePersonaDraft(null)).toEqual({ ok: false, reason: 'EMPTY' });
    expect(validatePersonaDraft(undefined)).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('문구가 비어도 축만 멀쩡하면 성립한다 — 카탈로그 문구가 화면을 채운다', () => {
    const r = validatePersonaDraft({ timeBand: 'NIGHT', category: 'SHOPPING' } as never);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.axes.reason).toBe('');
      expect(r.axes.headline).toBe('');
    }
  });

  it('지나치게 긴 문구는 잘라서 화면이 깨지지 않게 한다', () => {
    const r = validatePersonaDraft({ ...good, reason: '가'.repeat(500), headline: '나'.repeat(500) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.axes.reason).toHaveLength(300);
      expect(r.axes.headline).toHaveLength(100);
    }
  });
});
