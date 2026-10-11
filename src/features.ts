// Danh sách "tính năng mới" (mechanic và booster) theo level mở khoá, và phần tính thanh tiến trình tới tính năng kế tiếp ở popup thắng.
// Thuần logic (không đụng giao diện) để kiểm thử được; game.ts dựng danh sách và vẽ thanh.

export interface Feature {
  /** Level (đánh số từ 1) mà tính năng này bắt đầu xuất hiện/mở khoá. */
  level: number;
  kind: 'mechanic' | 'booster';
  /** Khoá để chọn hình minh hoạ (khoá booster, hoặc tên mechanic như 'axis'). */
  key: string;
  name: string;
}

export interface FeatureProgress {
  next: Feature;
  /** Level của tính năng trước đó (0 nếu chưa có). */
  from: number;
  /** Tiến độ 0..1 sau khi xong level này (100% khi level kế tiếp chính là level mở khoá). */
  pct: number;
  /** Tiến độ 0..1 trước khi xong level này, để thanh chạy từ đây lên `pct`. */
  pctBefore: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Tiến trình tới tính năng kế tiếp sau khi vừa xong level `levelDone` (1-based). Trả về null nếu không còn tính năng nào phía trước.
 * Ví dụ: tính năng trước ở level 8, kế tiếp ở level 11: xong level 8 → 33%, xong level 9 → 67%, xong level 10 → 100% (level 11 mở khoá).
 */
export function featureProgress(features: readonly Feature[], levelDone: number): FeatureProgress | null {
  const sorted = [...features].sort((a, b) => a.level - b.level);
  const next = sorted.find((f) => f.level > levelDone);
  if (!next) return null;
  const from = [...sorted].reverse().find((f) => f.level <= levelDone)?.level ?? 0;
  const span = next.level - from;
  return { next, from, pct: clamp01((levelDone + 1 - from) / span), pctBefore: clamp01((levelDone - from) / span) };
}
