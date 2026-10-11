// Toán học hoạt ảnh của khối len: đường đi khi trượt, nhún trước khi phóng, bị ép (squash) rồi nảy lại khi va chạm.
// Chỉ có hàm thuần, không dính giao diện nên kiểm thử được. Toạ độ hướng đi (dx, dy) tính theo ô: x sang phải, y xuống dưới.

/** Tư thế của một khối so với trạng thái đứng yên: hệ số co giãn theo ba trục thế giới và độ lệch (đơn vị ô). */
export interface Pose {
  /** Co giãn theo trục x (cột), y (chiều cao) và z (hàng). */
  sx: number;
  sy: number;
  sz: number;
  /** Độ lệch vị trí theo cột và hàng. */
  ox: number;
  oy: number;
}

export const IDENTITY: Pose = { sx: 1, sy: 1, sz: 1, ox: 0, oy: 0 };

/** Nửa kích thước của khối theo chiều va chạm (ô): giữ mặt chạm đứng yên khi khối bị ép. */
const HALF = 0.48;

/**
 * Lò xo tắt dần: bắt đầu ở 1 (ép tối đa), dao động qua 0 sang âm (phình ngược) rồi tắt hẳn sau chừng nửa giây.
 * `tMs` là thời gian kể từ lúc va chạm.
 */
export function springK(tMs: number): number {
  const s = Math.max(0, tMs) / 1000;
  return Math.exp(-6.5 * s) * Math.cos(2 * Math.PI * 4 * s);
}

/** Đường đi khi trượt: xuất phát chậm rồi tăng tốc, tới đích với vận tốc lớn nhất (như bị đẩy đi rồi đập vào vật cản). */
export function slideEase(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return Math.pow(u, 1.7);
}

/**
 * Tư thế khi va chạm đang đi theo hướng (dx, dy): bị ép theo trục chuyển động, phình ra theo trục vuông góc và hơi vọt lên,
 * rồi dao động về nguyên trạng theo lò xo. `amp` (0..1) là độ mạnh của cú va.
 */
export function impactPose(dx: number, dy: number, tMs: number, amp: number): Pose {
  const k = springK(tMs) * amp;
  const axis = 1 - 0.34 * k;
  const perp = 1 + 0.2 * k;
  const horizontal = dx !== 0;
  return {
    sx: horizontal ? axis : perp,
    sz: horizontal ? perp : axis,
    sy: 1 + 0.14 * k,
    ox: dx * HALF * (1 - axis),
    oy: dy * HALF * (1 - axis),
  };
}

/**
 * Nhún trước khi phóng: lùi nhẹ ngược hướng sắp đi và dẹp lại một chút, `u` chạy 0..1. Đầu và cuối pha là nguyên trạng
 * để nối mượt vào chuyển động trượt.
 */
export function anticipationPose(dx: number, dy: number, u: number): Pose {
  const w = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  const axis = 1 - 0.1 * w;
  const horizontal = dx !== 0;
  return {
    sx: horizontal ? axis : 1 + 0.05 * w,
    sz: horizontal ? 1 + 0.05 * w : axis,
    sy: 1 + 0.04 * w,
    ox: -dx * 0.07 * w,
    oy: -dy * 0.07 * w,
  };
}
