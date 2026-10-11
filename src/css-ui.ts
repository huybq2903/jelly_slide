// Bản vẽ Canvas của popup trong file thiết kế `v2.html` (CSS), làm theo từng thông số: gradient, viền, box-shadow ngoài (đùn cứng và
// nhoè), box-shadow inset, bo góc elip theo %, chữ có -webkit-text-stroke + text-shadow. Mọi kích thước tính theo chiều rộng màn hình
// như `clamp(..vw..)` và % padding trong CSS (padding % tính theo bề rộng khối chứa).

import { FONT_STACK } from './fonts';

type Ctx = CanvasRenderingContext2D;

export const clamp = (lo: number, v: number, hi: number): number => Math.min(hi, Math.max(lo, v));

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Bán kính bo góc elip (px): ngang và dọc. */
  rx: number;
  ry: number;
}

/** Thêm đường bo góc elip của `b`, nở ra `grow` px mỗi phía và dịch (dx, dy), vào đường vẽ hiện tại. */
function addPath(ctx: Ctx, b: Rect, grow = 0, dx = 0, dy = 0): void {
  const rx = Math.max(0, Math.min(b.rx + grow, (b.w + 2 * grow) / 2));
  const ry = Math.max(0, Math.min(b.ry + grow, (b.h + 2 * grow) / 2));
  ctx.roundRect(b.x - grow + dx, b.y - grow + dy, b.w + 2 * grow, b.h + 2 * grow, [{ x: rx, y: ry }]);
}

function pathOf(ctx: Ctx, b: Rect, grow = 0, dx = 0, dy = 0): void {
  ctx.beginPath();
  addPath(ctx, b, grow, dx, dy);
}

export interface BoxSpec {
  /** Gradient dọc phủ hộp đệm: [vị trí 0..1, màu]. */
  stops: [number, string][];
  border?: { w: number; color: string };
  /** box-shadow ngoài theo thứ tự CSS (cái đầu nằm trên cùng). */
  outer?: { dy: number; spread: number; blur: number; color: string; dx?: number }[];
  /** box-shadow inset theo thứ tự CSS (cái đầu nằm trên cùng). */
  inset?: { dx?: number; dy: number; spread: number; color: string }[];
}

/** Vẽ một hộp CSS và trả về hộp đệm (padding box) để đặt nội dung bên trong. */
export function cssBox(ctx: Ctx, b: Rect, o: BoxSpec): Rect {
  const bw = o.border?.w ?? 0;
  const pb: Rect = { x: b.x + bw, y: b.y + bw, w: b.w - 2 * bw, h: b.h - 2 * bw, rx: Math.max(0, b.rx - bw), ry: Math.max(0, b.ry - bw) };
  const OFF = 10000;
  for (const s of [...(o.outer ?? [])].reverse()) {
    ctx.save();
    if (s.blur > 0) {
      // chỉ giữ phần bóng: vẽ hình ở xa ngoài khung và kéo bóng về bằng shadowOffset
      // shadowOffset/shadowBlur tính theo pixel thiết bị, không theo transform: bù theo hệ số co giãn hiện tại (popup đang nảy ra/thu vào)
      const m = ctx.getTransform();
      ctx.shadowColor = s.color;
      ctx.shadowBlur = s.blur * m.a;
      ctx.shadowOffsetX = OFF;
      ctx.shadowOffsetY = s.dy * m.d;
      ctx.fillStyle = '#000';
      pathOf(ctx, b, s.spread, -OFF / m.a + (s.dx ?? 0), 0);
    } else {
      ctx.fillStyle = s.color;
      pathOf(ctx, b, s.spread, s.dx ?? 0, s.dy);
    }
    ctx.fill();
    ctx.restore();
  }
  if (bw > 0) {
    ctx.fillStyle = o.border!.color;
    pathOf(ctx, b);
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, pb.y, 0, pb.y + pb.h);
  for (const [p, c] of o.stops) g.addColorStop(p, c);
  ctx.fillStyle = g;
  pathOf(ctx, pb);
  ctx.fill();
  if (o.inset?.length) {
    ctx.save();
    pathOf(ctx, pb);
    ctx.clip();
    for (const s of [...o.inset].reverse()) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.rect(pb.x - 50, pb.y - 50, pb.w + 100, pb.h + 100);
      addPath(ctx, pb, -s.spread, s.dx ?? 0, s.dy);
      ctx.fill('evenodd');
    }
    ctx.restore();
  }
  return pb;
}

/** Chữ như CSS: `paint-order: stroke fill` với -webkit-text-stroke (nét giữa, `stroke.w` px) và text-shadow (0, dy) cùng hình có viền. */
export function cssText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  stroke?: { w: number; color: string },
  shadow?: { dy: number; color: string },
  align: CanvasTextAlign = 'center',
  /** Canh giữa theo chiều cao thật của nét chữ (không theo hộp em của font): tâm chữ trùng chính xác với y. */
  optical = false,
): void {
  ctx.save();
  ctx.font = `${size}px ${FONT_STACK}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (optical) {
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    y += (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  }
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (shadow) {
    if (stroke) {
      ctx.strokeStyle = shadow.color;
      ctx.lineWidth = stroke.w;
      ctx.strokeText(text, x, y + shadow.dy);
    }
    ctx.fillStyle = shadow.color;
    ctx.fillText(text, x, y + shadow.dy);
  }
  if (stroke) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.w;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function measure(ctx: Ctx, text: string, size: number): number {
  ctx.save();
  ctx.font = `${size}px ${FONT_STACK}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

export interface CssPopupSpec {
  title: string;
  panelTitle: string;
  /** Vẽ nội dung trong panel tại (x, y) rộng w và trả về chiều cao; `draw` false = chỉ đo. Có thể là biểu tượng trong ô xanh, hình, chữ. */
  content: (c: Ctx, x: number, y: number, w: number, draw: boolean) => number;
  button: { label: string; press: number };
  close?: { press: number };
  /** Popup gọn: nút Play nhỏ hơn và đệm dưới thấp hơn để thẻ gần vuông. */
  compact?: boolean;
  /** Tiêu đề panel to hơn (popup mua booster: tên booster). */
  bigPanelTitle?: boolean;
}

export interface CssPopupRects {
  popup: { x: number; y: number; w: number; h: number };
  play: { x: number; y: number; w: number; h: number };
  close?: { x: number; y: number; w: number; h: number };
}

/** Một ô vuông xanh (`.slot`) tại (x, y) cạnh `s`; trả về tâm và nửa-biểu-tượng `u` để vẽ icon bên trong (icon rộng 58% lòng ô). */
export function cssSlot(ctx: Ctx, x: number, y: number, s: number): { cx: number; cy: number; u: number } {
  const pb = cssBox(
    ctx,
    { x, y, w: s, h: s, rx: s * 0.26, ry: s * 0.26 },
    {
      stops: [[0, '#8cf05a'], [0.6, '#44c424'], [1, '#2a9a1c']],
      border: { w: 4, color: '#14601a' },
      outer: [{ dy: 5, spread: 0, blur: 0, color: '#0c4a16' }],
      inset: [{ dy: 4, spread: 0, color: 'rgba(255,255,255,.45)' }],
    },
  );
  return { cx: pb.x + pb.w / 2, cy: pb.y + pb.h / 2, u: 0.36 * pb.w };
}

/**
 * Vẽ popup của v2.html với tâm hộp popup ở gốc toạ độ hiện tại. `W` là bề rộng màn hình (đơn vị `vw`). Thứ tự vẽ theo CSS: popup, panel,
 * rồi các phần tử định vị (tiêu đề, nút X, nút Play). Trả về các hình chữ nhật (toạ độ so với tâm popup) để bắt chạm.
 */
export function drawCssPopup(ctx: Ctx, W: number, spec: CssPopupSpec): CssPopupRects {
  const vw = W / 100;
  const popW = Math.min(W * 0.86, 460);
  const bw = 5;
  const padX = 0.06 * W;
  const padB = (spec.compact ? 0.09 : 0.12) * W; // chừa chỗ dưới nút Play (gờ đùn + bóng) để nút không sát đáy
  const padT = clamp(48, 9 * vw, 64);
  const innerW = popW - 2 * bw - 2 * padX;

  // ----- đo panel -----
  const pbw = 4;
  const pPadT = 0.05 * innerW;
  const pPadX = 0.04 * innerW;
  const pPadB = 0.06 * innerW;
  const pw = innerW - 2 * pbw - 2 * pPadX;
  const h3 = clamp(16, 5 * vw, 22) * (spec.bigPanelTitle ? 1.55 : 1);
  // không có tiêu đề panel (chuỗi rỗng): bỏ luôn chỗ của tiêu đề
  const hasPanelTitle = spec.panelTitle.length > 0;
  const h3H = hasPanelTitle ? h3 * 1.17 : 0;
  const h3Mb = hasPanelTitle ? 0.04 * pw : 0;
  const contentH = spec.content(ctx, 0, 0, pw, false);
  const panelH = 2 * pbw + pPadT + h3H + h3Mb + contentH + pPadB;

  // ----- đo nút Play -----
  const fs = clamp(36, 11 * vw, 56) * (spec.compact ? 0.72 : 1);
  const playW = 0.82 * innerW;
  const playH = fs * (0.8 + 1.17) + 10;
  const playMt = (spec.compact ? 0.06 : 0.09) * innerW;

  const padH = padT + panelH + playMt + playH + padB;
  const popH = padH + 2 * bw;
  const px = -popW / 2;
  const py = -popH / 2;
  const popup: Rect = { x: px, y: py, w: popW, h: popH, rx: 0.11 * popW, ry: 0.11 * popW };

  // ----- popup -----
  const pb = cssBox(ctx, popup, {
    stops: [[0, '#5c97f0'], [0.55, '#3f80d8'], [1, '#306cc0']],
    border: { w: bw, color: '#204f8f' },
    outer: [
      { dy: 14, spread: 0, blur: 0, color: '#163c70' },
      { dy: 28, spread: 0, blur: 40, color: 'rgba(0,0,0,.55)' },
    ],
    inset: [
      { dy: 0, spread: 4, color: '#78b4ff' },
      { dy: -10, spread: 0, color: '#265799' },
    ],
  });
  // .popup:before — vệt sáng bo tròn
  {
    const gx = pb.x + pb.w * 0.06;
    const gw = pb.w * 0.88;
    const gy = pb.y + pb.h * 0.02;
    const gh = pb.h * 0.09;
    const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
    g.addColorStop(0, 'rgba(255,255,255,.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, gh / 2);
    ctx.fill();
  }

  // ----- panel -----
  const panelBox: Rect = { x: pb.x + padX, y: pb.y + padT, w: innerW, h: panelH, rx: 0.1 * innerW, ry: 0.1 * innerW };
  const ppb = cssBox(ctx, panelBox, {
    stops: [[0, '#92c0ff'], [1, '#76aef5']],
    border: { w: pbw, color: '#3068b8' },
    outer: [{ dy: 5, spread: 0, blur: 0, color: '#265799' }],
    inset: [{ dy: 4, spread: 0, color: 'rgba(255,255,255,.3)' }],
  });
  const cxp = ppb.x + ppb.w / 2;
  let yy = ppb.y + pPadT;
  if (hasPanelTitle) cssText(ctx, spec.panelTitle, cxp, yy + h3H / 2, h3, '#265799', undefined, { dy: 1, color: 'rgba(255,255,255,.35)' });
  yy += h3H + h3Mb;
  spec.content(ctx, ppb.x + pPadX, yy, pw, true);

  // ----- nút Play (position: relative → vẽ sau panel) -----
  // Khung cố định (viền + đế + bóng, không co) và mặt nút bên trong đồng tâm với khung, cách đều BTN_GAP mỗi phía; bấm thì chỉ mặt nút (cùng nhãn) co lại quanh tâm khung.
  const playBox: Rect = { x: pb.x + padX + (innerW - playW) / 2, y: panelBox.y + panelH + playMt, w: playW, h: playH, rx: 30, ry: 30 };
  const frame = cssBox(ctx, playBox, {
    // khung chỉ là một tấm phẳng một màu tím: không viền, không chuyển màu
    stops: [[0, '#6a3fb8'], [1, '#6a3fb8']],
    // chỉ bóng mờ (không đế cứng lệch xuống) để khung đối xứng, mặt nút nằm chính giữa
    outer: [{ dy: 6, spread: 0, blur: 12, color: 'rgba(0,0,0,.4)' }],
  });
  const BTN_GAP = 2;
  const faceBox: Rect = { x: frame.x + BTN_GAP, y: frame.y + BTN_GAP, w: frame.w - 2 * BTN_GAP, h: frame.h - 2 * BTN_GAP, rx: Math.max(0, frame.rx - BTN_GAP), ry: Math.max(0, frame.ry - BTN_GAP) };
  const fcx = frame.x + frame.w / 2;
  const fcy = frame.y + frame.h / 2;
  const ps = 1 - 0.1 * clamp(0, spec.button.press, 1);
  ctx.save();
  ctx.translate(fcx, fcy);
  ctx.scale(ps, ps);
  ctx.translate(-fcx, -fcy);
  const face = cssBox(ctx, faceBox, {
    stops: [[0, '#7af050'], [0.55, '#32c42e'], [1, '#22a822']],
    border: { w: 3, color: '#0f5a1a' },
  });
  // chữ: nhãn thu nhỏ nếu dài hơn lòng nút
  let lfs = Math.min(fs, face.h * 0.62);
  const maxTw = face.w - 24;
  const tw = measure(ctx, spec.button.label, lfs);
  if (tw > maxTw) lfs = (lfs * maxTw) / tw;
  cssText(ctx, spec.button.label, fcx, fcy, lfs, '#ffffff', { w: (5 / 56) * lfs, color: '#0f5a1a' }, { dy: 3, color: '#0f5a1a' }, 'center', true);
  ctx.restore();

  // ----- tiêu đề -----
  const tfs = clamp(34, 11 * vw, 54);
  const tH = tfs * 1.17 + tfs * 0.3 + 8;
  // bề rộng tấm tiêu đề cố định cho mọi popup; chữ dài thì thu nhỏ vừa lòng tấm
  const tW = popW * 0.68;
  const textMax = tW - 8 - tfs * 1.2;
  const tw0 = measure(ctx, spec.title, tfs);
  const tfsUse = tw0 > textMax ? (tfs * textMax) / tw0 : tfs;
  const tCx = px + popW / 2;
  const tTop = py - 0.48 * tH;
  const tBox: Rect = { x: tCx - tW / 2, y: tTop, w: tW, h: tH, rx: 22, ry: 22 };
  const tpb = cssBox(ctx, tBox, {
    stops: [[0, '#6da4ff'], [1, '#4688f0']],
    border: { w: 4, color: '#204f8f' },
    outer: [
      { dy: 6, spread: 0, blur: 0, color: '#163c70' },
      { dy: 10, spread: 0, blur: 14, color: 'rgba(0,0,0,.4)' },
    ],
  });
  cssText(ctx, spec.title, tCx, tpb.y + tfs * 0.1 + (tfs * 1.17) / 2, tfsUse, '#ffffff', { w: (6 / 54) * tfsUse, color: '#2c67c0' }, { dy: 4, color: '#204f8f' });

  // ----- nút X -----
  let closeRect: CssPopupRects['close'];
  if (spec.close) {
    const d = clamp(40, 12 * vw, 54);
    const ccx = pb.x + pb.w + 0.03 * pb.w - d / 2;
    const ccy = pb.y - 0.03 * pb.h + d / 2;
    const cs = 1 - 0.14 * clamp(0, spec.close.press, 1);
    const cb: Rect = { x: ccx - d / 2, y: ccy - d / 2, w: d, h: d, rx: d / 2, ry: d / 2 };
    // nền radial-gradient(circle at 35% 30%, ...) nên không dùng gradient dọc của cssBox: vẽ từng lớp tay
    const ring = (dy: number, spread: number, color: string, blur = 0): void => {
      ctx.save();
      if (blur) {
        const m = ctx.getTransform();
        ctx.shadowColor = color;
        ctx.shadowBlur = blur * m.a;
        ctx.shadowOffsetX = 10000;
        ctx.shadowOffsetY = dy * m.d;
        ctx.fillStyle = '#000';
        pathOf(ctx, cb, spread, -10000 / m.a, 0);
      } else {
        ctx.fillStyle = color;
        pathOf(ctx, cb, spread, 0, dy);
      }
      ctx.fill();
      ctx.restore();
    };
    ring(8, 0, 'rgba(0,0,0,.4)', 10);
    ring(0, 3, '#8a1010');
    ctx.fillStyle = '#ffffff';
    pathOf(ctx, cb);
    ctx.fill();
    // khung (vòng trắng + đế đỏ) đứng yên; đĩa đỏ và dấu X bên trong, đồng tâm với khung, co lại quanh tâm khi bấm
    ctx.save();
    ctx.translate(ccx, ccy);
    ctx.scale(cs, cs);
    ctx.translate(-ccx, -ccy);
    const inner = d - 8;
    const rg = ctx.createRadialGradient(ccx - inner / 2 + inner * 0.35, ccy - inner / 2 + inner * 0.3, 0, ccx - inner / 2 + inner * 0.35, ccy - inner / 2 + inner * 0.3, inner * 0.955);
    rg.addColorStop(0, '#ff7a7a');
    rg.addColorStop(0.6, '#e02828');
    rg.addColorStop(1, '#a81414');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(ccx, ccy, inner / 2, 0, Math.PI * 2);
    ctx.fill();
    const k = (0.55 * inner) / 24;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ccx + (5 - 12) * k, ccy + (5 - 12) * k);
    ctx.lineTo(ccx + (19 - 12) * k, ccy + (19 - 12) * k);
    ctx.moveTo(ccx + (19 - 12) * k, ccy + (5 - 12) * k);
    ctx.lineTo(ccx + (5 - 12) * k, ccy + (19 - 12) * k);
    ctx.stroke();
    ctx.restore();
    closeRect = { x: ccx - d / 2 - 6, y: ccy - d / 2 - 6, w: d + 12, h: d + 12 };
  }

  return {
    popup: { x: px, y: py, w: popW, h: popH },
    play: { x: playBox.x - 1, y: playBox.y - 1, w: playBox.w + 2, h: playBox.h + 10 },
    close: closeRect,
  };
}
