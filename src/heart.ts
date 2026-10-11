// Trái tim vỡ cho popup thua: hai nửa tách ra theo một vết nứt zigzag, hơi xoay lệch quanh mũi tim, vài mảnh vụn rơi xuống.

type Ctx = CanvasRenderingContext2D;

/** Đường viền trái tim, nửa rộng `s`, tâm ở gốc (đỉnh khuyết ở y = -0.3s, mũi ở y = +1.0s). */
function heartPath(c: Ctx, s: number): void {
  c.beginPath();
  c.moveTo(0, -0.3 * s);
  c.bezierCurveTo(0.2 * s, -0.95 * s, 1.15 * s, -0.8 * s, 1.0 * s, -0.05 * s);
  c.bezierCurveTo(0.9 * s, 0.45 * s, 0.35 * s, 0.7 * s, 0, 1.0 * s);
  c.bezierCurveTo(-0.35 * s, 0.7 * s, -0.9 * s, 0.45 * s, -1.0 * s, -0.05 * s);
  c.bezierCurveTo(-1.15 * s, -0.8 * s, -0.2 * s, -0.95 * s, 0, -0.3 * s);
  c.closePath();
}

/** Vết nứt từ đỉnh khuyết xuống mũi tim (đơn vị s). */
const CRACK: [number, number][] = [[0, -0.3], [0.16, 0.05], [-0.12, 0.32], [0.12, 0.62], [0, 1.0]];

/** Vẽ trái tim vỡ có tâm hình bao ở (cx, cy), chiều rộng khoảng `size`. */
export function drawBrokenHeart(c: Ctx, cx: number, cy: number, size: number): void {
  const s = size / 2.3;
  // hình tim cao ~1.95s, tâm hình bao nằm ở y = +0.35s so với gốc của đường vẽ
  c.save();
  c.translate(cx, cy - 0.33 * s);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const half = (side: -1 | 1): void => {
    c.save();
    c.translate(side * 0.12 * s, 1.0 * s + 0.03 * s);
    c.rotate(side * 0.13);
    c.translate(0, -1.0 * s);
    // vùng cắt của nửa tim: đi dọc vết nứt rồi vòng ra phía `side`
    c.beginPath();
    CRACK.forEach(([x, y], i) => (i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s)));
    c.lineTo(side * 3 * s, 3 * s);
    c.lineTo(side * 3 * s, -3 * s);
    c.closePath();
    c.clip();
    const g = c.createLinearGradient(0, -0.9 * s, 0, 1.0 * s);
    g.addColorStop(0, '#ff7f90');
    g.addColorStop(0.5, '#e6304a');
    g.addColorStop(1, '#a8102a');
    heartPath(c, s);
    c.fillStyle = g;
    c.fill();
    // vệt sáng ở thuỳ tim phía trên
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.beginPath();
    c.ellipse(-0.55 * s, -0.45 * s, 0.3 * s, 0.17 * s, -0.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#6b0f1d';
    c.lineWidth = 0.13 * s;
    heartPath(c, s);
    c.stroke();
    // mép vỡ
    c.beginPath();
    CRACK.forEach(([x, y], i) => (i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s)));
    c.stroke();
    c.restore();
  };
  half(-1);
  half(1);
  // mảnh vụn rơi từ chỗ nứt
  c.fillStyle = '#d02a44';
  c.strokeStyle = '#6b0f1d';
  c.lineWidth = 0.06 * s;
  for (const [x, y, r] of [[-0.05, 1.2, 0.09], [0.22, 1.32, 0.07], [-0.28, 1.34, 0.06]] as const) {
    c.beginPath();
    c.moveTo(x * s, (y - r) * s);
    c.lineTo((x + r) * s, (y + r * 0.6) * s);
    c.lineTo((x - r) * s, (y + r * 0.7) * s);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.restore();
}
