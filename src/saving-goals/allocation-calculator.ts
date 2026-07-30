/**
 * 절약 목표 배분 계산 — 순수 함수. AI 를 쓰지 않는다.
 *
 * 목표액이 여행지에서 정해지므로(§12-2), 이제 절약 목표의 일은
 * "얼마를 모을지 정하는 것" 이 아니라 **"정해진 금액을 카테고리에 어떻게 나눌지"** 다.
 *
 * 화면 S12 의 [✨ 자동 배분] 버튼이 이 계산을 부른다.
 */
import { clamp } from '../common/utils/money';

export interface AllocationCandidate {
  category: string;
  /** 이 카테고리의 월평균 지출 = 배분 상한 (원) */
  monthlyAvgAmount: number;
}

export interface Allocation {
  category: string;
  targetAmount: number;
}

export interface AllocationResult {
  items: Allocation[];
  /** 실제로 배분된 합계 (원) */
  allocatedAmount: number;
  /**
   * 목표액에서 못 채운 금액 (원). 0 이면 정확히 채웠다.
   *
   * 상한 합계가 목표액보다 작으면 0 보다 커진다 — 이때 화면은
   * "이 목표는 지금 소비로는 달성이 어려워요" 를 보여줘야 한다.
   */
  shortfallAmount: number;
}

/**
 * 목표액을 카테고리에 비례 배분한다.
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────────
 *  1. 월평균이 큰 카테고리가 더 많이 부담한다 (비례 배분)
 *  2. 어떤 카테고리도 자기 월평균을 넘지 않는다 (상한 clamp)
 *  3. step 단위로 떨어진다 (슬라이더 눈금과 일치해야 하므로)
 *  4. **합계가 목표액과 정확히 일치한다** — 반올림 오차를 여유 있는 카테고리에 흘려보낸다
 *
 * 4번이 핵심이다. 비례 배분 후 step 반올림을 하면 합계가 목표액에서 몇 천 원씩 어긋나는데,
 * 화면에는 `266,000 / 280,000원` 처럼 합계가 그대로 찍히므로 어긋나면 바로 티가 난다.
 */
export function autoAllocate(
  targetAmount: number,
  candidates: readonly AllocationCandidate[],
  step: number,
): AllocationResult {
  const usable = candidates.filter((c) => c.monthlyAvgAmount > 0);

  if (targetAmount <= 0 || usable.length === 0) {
    return {
      items: candidates.map((c) => ({ category: c.category, targetAmount: 0 })),
      allocatedAmount: 0,
      shortfallAmount: Math.max(0, targetAmount),
    };
  }

  const capTotal = usable.reduce((s, c) => s + c.monthlyAvgAmount, 0);

  // 상한 합계로도 목표를 못 채우면 전부 상한까지 채우고 부족분을 알린다.
  // 조용히 목표를 낮추지 않는다 — 화면이 "달성 불가"를 말할 수 있어야 한다.
  if (capTotal <= targetAmount) {
    const items = candidates.map((c) => ({
      category: c.category,
      targetAmount: floorToStep(c.monthlyAvgAmount, step),
    }));
    const allocated = items.reduce((s, i) => s + i.targetAmount, 0);
    return { items, allocatedAmount: allocated, shortfallAmount: targetAmount - allocated };
  }

  // 1차: 비례 배분 후 step 단위로 내림 + 상한 clamp
  const draft = new Map<string, number>();
  for (const c of candidates) {
    const raw = c.monthlyAvgAmount > 0 ? (targetAmount * c.monthlyAvgAmount) / capTotal : 0;
    const capped = clamp(floorToStep(raw, step), 0, floorToStep(c.monthlyAvgAmount, step));
    draft.set(c.category, capped);
  }

  // 2차: 내림 때문에 생긴 잔액을 여유가 큰 순서로 step 씩 채운다.
  //      "여유가 큰 순서" 로 도는 이유는, 상한에 걸린 카테고리를 건너뛰기 위해서다.
  let remaining = targetAmount - sumMap(draft);
  const byHeadroom = [...candidates]
    .filter((c) => c.monthlyAvgAmount > 0)
    .sort((a, b) => b.monthlyAvgAmount - a.monthlyAvgAmount);

  // 한 바퀴로 안 채워질 수 있으니 잔액이 0 이 되거나 더 넣을 곳이 없을 때까지 돈다.
  let progressed = true;
  while (remaining >= step && progressed) {
    progressed = false;
    for (const c of byHeadroom) {
      if (remaining < step) break;
      const current = draft.get(c.category) ?? 0;
      const cap = floorToStep(c.monthlyAvgAmount, step);
      if (current + step <= cap) {
        draft.set(c.category, current + step);
        remaining -= step;
        progressed = true;
      }
    }
  }

  // 3차: step 으로 안 떨어지는 나머지(예: 목표 60,500원 / step 1,000원)를
  //      여유가 가장 큰 카테고리에 그대로 얹어 합계를 정확히 맞춘다.
  if (remaining > 0) {
    for (const c of byHeadroom) {
      const current = draft.get(c.category) ?? 0;
      if (current + remaining <= c.monthlyAvgAmount) {
        draft.set(c.category, current + remaining);
        remaining = 0;
        break;
      }
    }
  }

  const items = candidates.map((c) => ({
    category: c.category,
    targetAmount: draft.get(c.category) ?? 0,
  }));
  const allocated = items.reduce((s, i) => s + i.targetAmount, 0);

  return {
    items,
    allocatedAmount: allocated,
    shortfallAmount: Math.max(0, targetAmount - allocated),
  };
}

/**
 * 금액을 "몇 번치"로 환산한다 (화면 S12 의 `(배달 약 3.9끼)`).
 *
 * 단가는 **사용자의 실제 평균 결제액**(기간 총액 ÷ 건수)이다. 하드코딩하지 않는다 —
 * 배달을 2만원씩 시키는 사람과 5천원씩 시키는 사람의 "3.9끼"는 달라야 하기 때문이다.
 *
 * 건수가 0이면 단가를 알 수 없으므로 null 을 준다 (화면은 힌트를 숨긴다).
 */
export function toUnitCount(
  amount: number,
  totalAmount: number,
  txCount: number,
): number | null {
  if (txCount <= 0 || totalAmount <= 0 || amount <= 0) return null;
  const unitPrice = totalAmount / txCount;
  if (unitPrice <= 0) return null;
  return Math.round((amount / unitPrice) * 10) / 10;
}

/** 카테고리 1건당 평균 결제액 (원). 건수가 0이면 null. */
export function unitPriceOf(totalAmount: number, txCount: number): number | null {
  if (txCount <= 0) return null;
  return Math.round(totalAmount / txCount);
}

function floorToStep(amount: number, step: number): number {
  if (step <= 0) return Math.max(0, Math.floor(amount));
  return Math.max(0, Math.floor(amount / step) * step);
}

function sumMap(m: Map<string, number>): number {
  let total = 0;
  for (const v of m.values()) total += v;
  return total;
}
