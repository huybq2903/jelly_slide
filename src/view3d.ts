// Toán học camera cho bàn 3D: khung hình vừa khít một vùng trên màn hình và chọn ô bằng toạ độ chạm.
// Không dùng WebGL, chỉ dùng toán của Three.js, nên kiểm thử được bằng vitest.
//
// Hệ toạ độ thế giới: 1 ô = 1 đơn vị, x sang phải (cột), z xuống dưới (hàng), y hướng lên; bàn nằm trên mặt y = 0,
// tâm bàn ở gốc toạ độ. Camera trực giao nhìn chếch từ phía +z xuống, hàng 0 hiện ở trên cùng màn hình.

import { Box3, OrthographicCamera, Ray, Vector3 } from 'three';

/** Phần nhô ra ngoài mép bàn ở mỗi phía: chỉ là bề dày khung vàng, vì các cửa len được khảm ngay trong khung. */
export const FRAME_MARGIN = 0.5;
/** Chiều cao nội dung cao nhất (khối len, giỏ) tính từ mặt bàn, tính bằng ô. */
export const CONTENT_HEIGHT = 1.0;
/** Góc nghiêng mặc định (radian) tính từ phương thẳng đứng: 0 = nhìn thẳng xuống. Gần như nhìn thẳng xuống, nghiêng nhẹ. */
export const DEFAULT_TILT = 0.18;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface View {
  /** Kích thước vùng vẽ (px CSS). */
  viewport: { w: number; h: number };
  tilt: number;
  camera: OrthographicCamera;
}

/** Lề nhô ra ngoài mép bàn ở bốn phía, tính bằng ô. */
export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const SYMMETRIC: Margins = { left: FRAME_MARGIN, right: FRAME_MARGIN, top: FRAME_MARGIN, bottom: FRAME_MARGIN };

/** Tâm ô (cx, cy) trên mặt bàn. */
export function cellToWorld(boardW: number, boardH: number, cx: number, cy: number): Vector3 {
  return new Vector3(cx - (boardW - 1) / 2, 0, cy - (boardH - 1) / 2);
}

/**
 * Dựng camera sao cho hộp bao nội dung của bàn `boardW x boardH` vừa khít, căn giữa trong `rect` (px CSS) của vùng vẽ `viewport`.
 */
export function fitView(
  boardW: number,
  boardH: number,
  viewport: { w: number; h: number },
  rect: Rect,
  tilt = DEFAULT_TILT,
  margins: Margins = SYMMETRIC,
): View {
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const d = 40;
  cam.position.set(0, d * Math.cos(tilt), d * Math.sin(tilt));
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);

  const xs = [-(boardW / 2 + margins.left), boardW / 2 + margins.right];
  const zs = [-(boardH / 2 + margins.top), boardH / 2 + margins.bottom];
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const x of xs) {
    for (const z of zs) {
      for (const y of [0, CONTENT_HEIGHT]) {
        const c = new Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
        xmin = Math.min(xmin, c.x);
        xmax = Math.max(xmax, c.x);
        ymin = Math.min(ymin, c.y);
        ymax = Math.max(ymax, c.y);
      }
    }
  }
  // Tỉ lệ px trên đơn vị thế giới: chọn chiều chật hơn để vừa khít.
  const s = Math.min(rect.w / (xmax - xmin), rect.h / (ymax - ymin));
  const ccx = (xmin + xmax) / 2;
  const ccy = (ymin + ymax) / 2;
  cam.left = ccx - (rect.x + rect.w / 2) / s;
  cam.right = cam.left + viewport.w / s;
  cam.top = ccy + (rect.y + rect.h / 2) / s;
  cam.bottom = cam.top - viewport.h / s;
  cam.updateProjectionMatrix();
  return { viewport, tilt, camera: cam };
}

/** Chiếu một điểm thế giới lên toạ độ màn hình (px CSS, gốc ở góc trên trái). */
export function worldToScreen(view: View, p: Vector3): { x: number; y: number } {
  const n = p.clone().project(view.camera);
  return { x: ((n.x + 1) / 2) * view.viewport.w, y: ((1 - n.y) / 2) * view.viewport.h };
}

/** Điểm trên mặt bàn (y = 0) mà toạ độ màn hình (px, py) đang nhìn vào, hoặc null nếu tia song song mặt bàn. */
export function screenToGround(view: View, px: number, py: number): Vector3 | null {
  const nx = (px / view.viewport.w) * 2 - 1;
  const ny = 1 - (py / view.viewport.h) * 2;
  const origin = new Vector3(nx, ny, -1).unproject(view.camera);
  const dir = new Vector3();
  view.camera.getWorldDirection(dir);
  if (Math.abs(dir.y) < 1e-6) return null;
  const t = -origin.y / dir.y;
  return origin.addScaledVector(dir, t);
}

/** Ô của bàn mà toạ độ màn hình chạm vào, hoặc null nếu ngoài bàn. */
export function screenToCell(view: View, boardW: number, boardH: number, px: number, py: number): { x: number; y: number } | null {
  const g = screenToGround(view, px, py);
  if (!g) return null;
  const x = Math.floor(g.x + boardW / 2);
  const y = Math.floor(g.z + boardH / 2);
  return x >= 0 && x < boardW && y >= 0 && y < boardH ? { x, y } : null;
}

/** Tia nhìn xuyên qua điểm màn hình (px, py), đi từ camera vào cảnh. */
export function rayAt(view: View, px: number, py: number): Ray {
  const nx = (px / view.viewport.w) * 2 - 1;
  const ny = 1 - (py / view.viewport.h) * 2;
  const origin = new Vector3(nx, ny, -1).unproject(view.camera);
  const dir = new Vector3();
  view.camera.getWorldDirection(dir);
  return new Ray(origin, dir);
}

/**
 * Chọn khối bằng tia nhìn: trả về id của hộp bao gần camera nhất mà điểm chạm (px, py) rơi vào, hoặc null.
 * Cần thiết vì khối cao nên điểm chạm vào đỉnh khối, khi chiếu xuống mặt bàn, sẽ rơi vào ô phía sau nó.
 */
export function pickBox(view: View, px: number, py: number, boxes: readonly { id: string; min: Vector3; max: Vector3 }[]): string | null {
  const ray = rayAt(view, px, py);
  let best: string | null = null;
  let bestT = Infinity;
  const hit = new Vector3();
  for (const b of boxes) {
    if (ray.intersectBox(new Box3(b.min, b.max), hit)) {
      const t = hit.distanceTo(ray.origin);
      if (t < bestT) {
        bestT = t;
        best = b.id;
      }
    }
  }
  return best;
}
