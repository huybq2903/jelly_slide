import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONTENT_HEIGHT, DEFAULT_TILT, FRAME_MARGIN, cellToWorld, fitView, pickBox, screenToCell, screenToGround, worldToScreen } from './view3d';

const viewport = { w: 500, h: 900 };
const rect = { x: 0, y: 140, w: 500, h: 600 };

/** 8 góc hộp bao nội dung (bàn + khung + giỏ, cao tới CONTENT_HEIGHT). */
function corners(bw: number, bh: number): Vector3[] {
  const hx = bw / 2 + FRAME_MARGIN;
  const hz = bh / 2 + FRAME_MARGIN;
  const out: Vector3[] = [];
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [0, CONTENT_HEIGHT]) out.push(new Vector3(x, y, z));
  return out;
}

describe('fitView', () => {
  it('mọi góc của hộp nội dung nằm trong vùng đích', () => {
    const v = fitView(5, 5, viewport, rect);
    for (const c of corners(5, 5)) {
      const p = worldToScreen(v, c);
      expect(p.x).toBeGreaterThanOrEqual(rect.x - 0.5);
      expect(p.x).toBeLessThanOrEqual(rect.x + rect.w + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(rect.y - 0.5);
      expect(p.y).toBeLessThanOrEqual(rect.y + rect.h + 0.5);
    }
  });

  it('vừa khít: chạm sát biên ít nhất một chiều', () => {
    const v = fitView(5, 5, viewport, rect);
    const ps = corners(5, 5).map((c) => worldToScreen(v, c));
    const minX = Math.min(...ps.map((p) => p.x));
    const maxX = Math.max(...ps.map((p) => p.x));
    const minY = Math.min(...ps.map((p) => p.y));
    const maxY = Math.max(...ps.map((p) => p.y));
    const touchX = Math.abs(minX - rect.x) < 1 && Math.abs(maxX - (rect.x + rect.w)) < 1;
    const touchY = Math.abs(minY - rect.y) < 1 && Math.abs(maxY - (rect.y + rect.h)) < 1;
    expect(touchX || touchY).toBe(true);
  });

  it('nội dung được căn giữa vùng đích', () => {
    const v = fitView(5, 5, viewport, rect);
    const ps = corners(5, 5).map((c) => worldToScreen(v, c));
    const cx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
    const cy = (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2;
    expect(cx).toBeCloseTo(rect.x + rect.w / 2, 0);
    expect(cy).toBeCloseTo(rect.y + rect.h / 2, 0);
  });

  it('bàn lớn trong vùng nhỏ vẫn vừa', () => {
    const small = { x: 20, y: 100, w: 300, h: 300 };
    const v = fitView(8, 6, viewport, small);
    for (const c of corners(8, 6)) {
      const p = worldToScreen(v, c);
      expect(p.x).toBeGreaterThanOrEqual(small.x - 0.5);
      expect(p.x).toBeLessThanOrEqual(small.x + small.w + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(small.y - 0.5);
      expect(p.y).toBeLessThanOrEqual(small.y + small.h + 0.5);
    }
  });
});

describe('hình học camera', () => {
  it('hàng trên của bàn nằm cao hơn trên màn hình (hàng 0 ở trên cùng)', () => {
    const v = fitView(5, 5, viewport, rect);
    const top = worldToScreen(v, cellToWorld(5, 5, 2, 0));
    const bottom = worldToScreen(v, cellToWorld(5, 5, 2, 4));
    expect(top.y).toBeLessThan(bottom.y);
  });

  it('cột trái nằm bên trái trên màn hình', () => {
    const v = fitView(5, 5, viewport, rect);
    const left = worldToScreen(v, cellToWorld(5, 5, 0, 2));
    const right = worldToScreen(v, cellToWorld(5, 5, 4, 2));
    expect(left.x).toBeLessThan(right.x);
  });

  it('chiều dọc bị co lại đúng cos(góc nghiêng) so với chiều ngang', () => {
    const tilt = 0.5;
    const v = fitView(5, 5, viewport, rect, tilt);
    const a = worldToScreen(v, cellToWorld(5, 5, 2, 2));
    const right = worldToScreen(v, cellToWorld(5, 5, 3, 2));
    const down = worldToScreen(v, cellToWorld(5, 5, 2, 3));
    const dx = Math.hypot(right.x - a.x, right.y - a.y);
    const dy = Math.hypot(down.x - a.x, down.y - a.y);
    expect(dy / dx).toBeCloseTo(Math.cos(tilt), 3);
  });
});

describe('chọn ô bằng toạ độ màn hình', () => {
  it('chiếu tâm mỗi ô lên màn hình rồi chọn lại ra đúng ô đó', () => {
    const v = fitView(5, 4, viewport, rect);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 5; x++) {
        const p = worldToScreen(v, cellToWorld(5, 4, x, y));
        expect(screenToCell(v, 5, 4, p.x, p.y)).toEqual({ x, y });
      }
    }
  });

  it('chọn ngoài bàn thì trả về null', () => {
    const v = fitView(5, 5, viewport, rect);
    expect(screenToCell(v, 5, 5, 2, 2)).toBeNull();
    expect(screenToCell(v, 5, 5, 250, 880)).toBeNull();
  });

  it('screenToGround là nghịch đảo của worldToScreen với điểm trên mặt bàn', () => {
    const v = fitView(5, 5, viewport, rect);
    const w = new Vector3(0.7, 0, -1.3);
    const p = worldToScreen(v, w);
    const g = screenToGround(v, p.x, p.y)!;
    expect(g.x).toBeCloseTo(w.x, 4);
    expect(g.z).toBeCloseTo(w.z, 4);
  });

  it('điểm sát mép ô vẫn chọn đúng ô chứa nó', () => {
    const v = fitView(5, 5, viewport, rect);
    const base = cellToWorld(5, 5, 1, 1);
    const inside = worldToScreen(v, new Vector3(base.x + 0.45, 0, base.z - 0.45));
    expect(screenToCell(v, 5, 5, inside.x, inside.y)).toEqual({ x: 1, y: 1 });
  });
});

describe('lề tuỳ chỉnh', () => {
  it('lề lệch: hộp bao bất đối xứng vẫn vừa khít và nằm trong vùng đích', () => {
    const margins = { left: 0.4, right: 0.9, top: 0.4, bottom: 0.9 };
    const v = fitView(5, 5, viewport, rect, undefined, margins);
    const ps: { x: number; y: number }[] = [];
    for (const x of [-(2.5 + margins.left), 2.5 + margins.right]) {
      for (const z of [-(2.5 + margins.top), 2.5 + margins.bottom]) {
        for (const y of [0, CONTENT_HEIGHT]) ps.push(worldToScreen(v, new Vector3(x, y, z)));
      }
    }
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(rect.x - 0.5);
      expect(p.x).toBeLessThanOrEqual(rect.x + rect.w + 0.5);
      expect(p.y).toBeGreaterThanOrEqual(rect.y - 0.5);
      expect(p.y).toBeLessThanOrEqual(rect.y + rect.h + 0.5);
    }
    const touchX = Math.abs(Math.min(...ps.map((p) => p.x)) - rect.x) < 1 && Math.abs(Math.max(...ps.map((p) => p.x)) - (rect.x + rect.w)) < 1;
    const touchY = Math.abs(Math.min(...ps.map((p) => p.y)) - rect.y) < 1 && Math.abs(Math.max(...ps.map((p) => p.y)) - (rect.y + rect.h)) < 1;
    expect(touchX || touchY).toBe(true);
  });
});

describe('chọn khối cao bằng tia', () => {
  const H = 0.84;
  const boxAt = (id: string, cx: number, cy: number) => {
    const c = cellToWorld(5, 5, cx, cy);
    return { id, min: new Vector3(c.x - 0.45, 0.04, c.z - 0.45), max: new Vector3(c.x + 0.45, 0.04 + H, c.z + 0.45) };
  };

  it('chạm vào đỉnh khối cao thì chọn khối đó, dù trên mặt bàn điểm đó rơi vào ô phía sau', () => {
    const v = fitView(5, 5, viewport, rect, 0.8);
    const c = cellToWorld(5, 5, 2, 2);
    const top = worldToScreen(v, new Vector3(c.x, 0.04 + H, c.z));
    expect(screenToCell(v, 5, 5, top.x, top.y)).not.toEqual({ x: 2, y: 2 }); // lý do phải chọn theo hộp khối
    expect(pickBox(v, top.x, top.y, [boxAt('A', 2, 2)])).toBe('A');
  });

  it('chạm vào mặt trước thân khối cũng chọn được', () => {
    const v = fitView(5, 5, viewport, rect, 0.8);
    const c = cellToWorld(5, 5, 2, 2);
    const front = worldToScreen(v, new Vector3(c.x, 0.4, c.z + 0.45));
    expect(pickBox(v, front.x, front.y, [boxAt('A', 2, 2)])).toBe('A');
  });

  it('chạm ra ngoài mọi khối thì null', () => {
    const v = fitView(5, 5, viewport, rect, 0.8);
    const far = worldToScreen(v, cellToWorld(5, 5, 0, 4));
    expect(pickBox(v, far.x, far.y, [boxAt('A', 2, 2)])).toBeNull();
  });

  it('hai khối chồng nhau trên màn hình thì chọn khối gần camera hơn', () => {
    const v = fitView(5, 5, viewport, rect, 0.8);
    const front = boxAt('front', 2, 3); // hàng dưới = gần camera hơn
    const back = boxAt('back', 2, 2);
    const c = cellToWorld(5, 5, 2, 3);
    const p = worldToScreen(v, new Vector3(c.x, 0.04 + H, c.z - 0.2)); // đỉnh khối trước, che một phần khối sau
    expect(pickBox(v, p.x, p.y, [back, front])).toBe('front');
  });

  it('góc nghiêng mặc định gần như nhìn thẳng xuống (nhỏ nhưng vẫn còn nghiêng nhẹ)', () => {
    expect(DEFAULT_TILT).toBeGreaterThan(0.15);
    expect(DEFAULT_TILT).toBeLessThan(0.45);
  });

  it('cửa khảm trong viền khung: lề mặc định chỉ là bề dày khung, không chừa thêm chỗ cho giỏ', () => {
    expect(FRAME_MARGIN).toBeLessThan(0.8);
  });
});
