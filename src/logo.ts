// Logo "Jelly Slide": hai dòng chữ thạch (Jelly hồng, Slide xanh ngọc) viền kiểu sticker, bóng gloss cắt cứng ở nửa trên.
// Từng chữ rơi vào và nảy như thạch (squash/stretch), sau đó rung rinh nhẹ; cuối cùng cả logo thu nhỏ và mờ đi.

import { font } from './ui-kit';

type Ctx = CanvasRenderingContext2D;

const backOut = (t: number, k: number): number => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
const backIn = (t: number, k: number): number => (k + 1) * t * t * t - k * t * t;
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

interface Line {
  text: string;
  /** Màu gradient của mặt chữ: sáng (nửa trên), giữa, đậm (nửa dưới). */
  top: string;
  mid: string;
  bot: string;
  /** Độ nghiêng của dòng (radian) và thời điểm bắt đầu của chữ đầu tiên (ms). */
  tilt: number;
  start: number;
}

export const LOGO_LETTER_MS = 360;
export const LOGO_STAGGER_MS = 55;
/** "Slide" bắt đầu khi "Jelly" còn đang vào (chồng lên nhau) cho nhịp liền mạch. */
export const LOGO_SLIDE_START_MS = 250;
const LINES: Line[] = [
  { text: 'Jelly', top: '#ffb8c9', mid: '#ff4d7a', bot: '#d4184f', tilt: -0.05, start: 0 },
  { text: 'Slide', top: '#9af0ff', mid: '#1fc0e6', bot: '#0b88b4', tilt: 0.04, start: LOGO_SLIDE_START_MS },
];


/** Thời điểm mọi chữ đã vào xong (ms từ lúc bắt đầu). */
export const LOGO_IN_DONE_MS = LOGO_SLIDE_START_MS + 4 * LOGO_STAGGER_MS + LOGO_LETTER_MS;

// Nhịp "hiện chữ – phồng – chờ – đập": các chữ lần lượt hiện ở cỡ gốc; hiện đủ thì cả logo phồng ra, chờ một nhịp ngắn, rồi ĐẬP xuống (inback) về cỡ gốc
// và đứng yên. Pháo giấy dành cho lúc popup hiện.
/** Chữ cuối đã chạm đáy và nảy xong về mắt thường (~70% hoạt ảnh của nó): bắt đầu phồng. */
export const LOGO_LANDED_MS = LOGO_SLIDE_START_MS + 4 * LOGO_STAGGER_MS + 0.7 * LOGO_LETTER_MS;
const GROW_PEAK = 1.26; // cỡ lúc phồng
const PUFF_MS = 140; // phồng ra
const HOLD_MS = 140; // chờ một chút ở cỡ phồng
const SLAM_DOWN_MS = 110; // đập xuống với inback: hơi nhấc lên lấy đà rồi lao xuống nhanh dần
/** Thời điểm logo đập xuống (ms từ lúc bắt đầu). */
export const LOGO_IMPACT_MS = LOGO_LANDED_MS + PUFF_MS + HOLD_MS + SLAM_DOWN_MS;
export const LOGO_SLAM_DONE_MS = LOGO_IMPACT_MS;

/** Hệ số co giãn của cả logo (đều X và Y): 1 khi chữ hiện → phồng 1.26 → chờ → đập xuống về 1 (inback) và đứng yên. */
function slam(t: number): { sx: number; sy: number } {
  if (t < LOGO_LANDED_MS || t >= LOGO_SLAM_DONE_MS) return { sx: 1, sy: 1 };
  const u0 = t - LOGO_LANDED_MS;
  let k: number;
  if (u0 < PUFF_MS) {
    const u = u0 / PUFF_MS;
    k = 1 + (GROW_PEAK - 1) * (1 - Math.pow(1 - u, 3)); // phồng nhanh rồi chậm dần
  } else if (u0 < PUFF_MS + HOLD_MS) {
    k = GROW_PEAK;
  } else {
    const u = (u0 - PUFF_MS - HOLD_MS) / SLAM_DOWN_MS;
    k = GROW_PEAK - (GROW_PEAK - 1) * backIn(u, 2.5); // inback: hơi phồng thêm lấy đà rồi thu nhanh về 1
  }
  return { sx: k, sy: k };
}

/**
 * Vẽ logo có tâm (cx, cy), rộng khoảng `width` px. `t` là số ms kể từ lúc logo bắt đầu hiện; `exit` (0..1) là mức thu nhỏ/mờ đi lúc kết thúc.
 */
export function drawLogo(ctx: Ctx, cx: number, cy: number, width: number, t: number, exit = 0): void {
  ctx.save();
  ctx.translate(cx, cy);
  const ex = clamp01(exit);
  const sExit = 1 - 0.4 * backIn(ex, 0.8);
  const sl = slam(t);
  ctx.scale(sExit * sl.sx, sExit * sl.sy);
  // độ mờ khi kết thúc do chỗ gọi xử lý theo cả lớp (vẽ logo vào lớp phụ rồi làm mờ một lần) để các nét viền chồng nhau không lộ ra
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // cỡ chữ: dòng đầu rộng 0.92 width; dòng sau cùng cỡ chữ nhỏ hơn 8%
  const probe = 100;
  ctx.font = font(probe);
  const sizes = LINES.map((l, i) => {
    const wProbe = [...l.text].reduce((a, ch) => a + ctx.measureText(ch).width, 0);
    return ((width * 0.86) / (wProbe * 1.07)) * probe * (i === 0 ? 1 : 0.92);
  });
  const gap = sizes[0] * 0.2;
  const heights = sizes.map((s) => s * 0.8);
  const total = heights[0] + heights[1] + gap;
  let top = -total / 2;

  LINES.forEach((line, li) => {
    const size = sizes[li];
    ctx.font = font(size);
    // thêm khoảng hở giữa các chữ để viền sticker không đè lên chữ bên cạnh
    const space = size * 0.07;
    const widths = [...line.text].map((ch) => ctx.measureText(ch).width + space);
    const lineW = widths.reduce((a, b) => a + b, 0) - space;
    const baseY = top + heights[li]; // đường cơ sở của dòng
    ctx.save();
    ctx.translate(0, top + heights[li] / 2);
    ctx.rotate(line.tilt);
    ctx.translate(0, -(top + heights[li] / 2));
    let x = -lineW / 2;
    [...line.text].forEach((ch, i) => {
      const u = clamp01((t - line.start - i * LOGO_STAGGER_MS) / LOGO_LETTER_MS);
      const w = widths[i];
      if (u > 0) {
        const pop = backOut(u, 1.7);
        // rơi từ trên xuống; squash khi chạm đáy rồi nảy lại
        const drop = -Math.pow(1 - u, 2) * size * 1.1;
        const squash = u < 1 ? 0.2 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 2.4) * (1 - u) : 0;
        const idle = 0; // vào xong là đứng yên, không lắc lư
        const sy = Math.max(0.05, pop) * (1 + squash + idle);
        const sx = Math.max(0.05, pop) * (1 - squash * 0.8 - idle);
        ctx.save();
        ctx.globalAlpha *= Math.min(1, u * 4);
        const pivotX = x + (w - space) / 2;
        const pivotY = baseY - heights[li] * 0.1;
        ctx.translate(pivotX, pivotY + drop);
        ctx.scale(sx, sy);
        ctx.translate(-pivotX, -pivotY);
        ctx.font = font(size);
        // bóng đổ mềm phía dưới chữ
        ctx.fillStyle = 'rgba(8,20,60,.45)';
        ctx.fillText(ch, x, baseY + size * 0.07);
        // sticker: viền xanh đậm dày, rồi viền trắng mỏng bên trong
        ctx.strokeStyle = '#1b3a82';
        ctx.lineWidth = size * 0.3;
        ctx.strokeText(ch, x, baseY);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = size * 0.17;
        ctx.strokeText(ch, x, baseY);
        // mặt chữ: gradient có vạch gloss cắt cứng ở giữa
        const g = ctx.createLinearGradient(0, baseY - heights[li], 0, baseY);
        g.addColorStop(0, line.top);
        g.addColorStop(0.46, line.top);
        g.addColorStop(0.5, line.mid);
        g.addColorStop(1, line.bot);
        ctx.fillStyle = g;
        ctx.fillText(ch, x, baseY);
        ctx.restore();
      }
      x += w;
    });
    ctx.restore();
    top += heights[li] + gap;
  });
  ctx.restore();
}

const FLASH_MS = 150;
/** Độ chớp sáng trắng trên mặt chữ lúc chạm đáy (0..1): bật ngay tại cú đập rồi tắt nhanh. */
export function logoFlash(t: number): number {
  const u = (t - LOGO_IMPACT_MS) / FLASH_MS;
  return u < 0 || u >= 1 ? 0 : 0.85 * Math.pow(1 - u, 2);
}

/** Thời điểm (ms từ lúc logo bắt đầu) mỗi chữ chạm đáy, theo thứ tự đọc: dùng để phát một nốt cho từng chữ. */
export const LOGO_LETTER_HITS_MS: number[] = LINES.flatMap((l) => [...l.text].map((_, i) => l.start + i * LOGO_STAGGER_MS + 0.45 * LOGO_LETTER_MS));
