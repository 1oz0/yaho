/**
 * 여행지 사진 블러 정책 — 순수 함수 (§6-5).
 *
 * 진척률이 오를수록 사진이 하나씩 열린다. 절약이 곧 "예고편이 본편이 되는" 연출이다.
 *
 *   공개 장수 = ceil(progressRate × 전체 장수)
 *   revealOrder 가 앞선 것부터 공개한다.
 *
 * ⚠️ 이미지 URL 은 **항상** 내려준다. 블러는 `blurred` 플래그로 프론트가 처리한다.
 *    서버가 URL 을 숨기면 진척률이 바뀔 때마다 이미지를 새로 받아야 해서 전환이 끊긴다.
 */
import { clamp } from '../common/utils/money';

export interface BlurablePhoto {
  id: string;
  imageUrl: string;
  caption: string;
  revealOrder: number;
}

export interface PhotoView extends BlurablePhoto {
  /** true 면 프론트가 블러 처리한다 */
  blurred: boolean;
}

export interface BlurResult {
  photos: PhotoView[];
  revealedCount: number;
  totalCount: number;
}

/**
 * @param photos revealOrder 순서와 무관하게 넘겨도 된다 (내부에서 정렬한다)
 * @param progressRate 0.0~1.0. 1.0 이상이면 전부 공개.
 */
export function applyBlur(photos: readonly BlurablePhoto[], progressRate: number): BlurResult {
  const sorted = [...photos].sort((a, b) => a.revealOrder - b.revealOrder);
  const totalCount = sorted.length;

  const rate = clamp(progressRate, 0, 1);
  // 1.0 이면 부동소수 오차와 무관하게 전부 공개한다
  const revealedCount = rate >= 1 ? totalCount : Math.ceil(rate * totalCount);

  return {
    photos: sorted.map((photo, index) => ({ ...photo, blurred: index >= revealedCount })),
    revealedCount,
    totalCount,
  };
}
