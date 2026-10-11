// Hướng dẫn cưỡng bức: các bước lấy từ lời giải của solver. Mỗi bước chỉ cho đúng một thao tác (đúng khối + đúng hướng, hoặc đúng booster + đúng mục tiêu).
// Phần này thuần logic (không đụng giao diện) để kiểm thử được; game.ts vẽ bàn tay và làm tối phần còn lại.

import { createState, gateKey, undoDir, type Dir, type Pos } from './core/rules';
import { applyMove, type BoosterKey, type Move } from './core/solver';
import type { LevelEntry } from './levels';

export type TutStep =
  | { kind: 'slide'; id: string; dir: Dir; from: Pos; /** Khoá cửa nếu cú vuốt này đưa khối vào cửa. */ gate?: string; /** Cú vuốt này dừng nhờ một vệt còn sống ("phanh"). */ brake?: boolean; text: string }
  | { kind: 'undo'; id: string; /** Hướng phải kéo (quay lại theo vệt). */ dir: Dir; from: Pos; text: string }
  | { kind: 'booster'; key: BoosterKey; move: Move; text: string };

/** Dựng các bước hướng dẫn cho một level, hoặc null nếu level không có hướng dẫn / thiếu lời giải. */
export function buildTutorial(entry: LevelEntry): TutStep[] | null {
  if (!entry.tutorial) return null;
  if (!entry.solution?.length) return null;
  let moves: Move[] = entry.solution;
  if (entry.tutorial.undoDemo) {
    const first = moves[0];
    if (first?.kind === 'slide') moves = [first, { kind: 'undo', id: first.id }, ...moves];
  }
  let state = createState(entry.level);
  const steps: TutStep[] = [];
  let firstSlide = true;
  let afterUndo = false;
  let slideIdx = 0;
  for (const m of moves) {
    if (m.kind === 'undo') {
      afterUndo = true;
      const dir = undoDir(state, m.id);
      if (!dir) return null;
      steps.push({ kind: 'undo', id: m.id, dir, from: { ...state.balls[m.id] }, text: 'Stuck? Drag back along the trail to undo!' });
    } else if (m.kind === 'slide') {
      const r = applyMove(state, m);
      if (!r.ok) return null;
      const res = r as { exit?: Dir; stop?: string; to?: Pos };
      const custom = entry.tutorial.moves[slideIdx++] as string | undefined;
      const text = custom ?? (afterUndo ? 'Now try again!' : firstSlide ? 'Swipe the jelly toward its gate!' : res.exit ? 'Slide into the gate!' : res.stop === 'trail' ? 'The trail stops you. Nice brake!' : 'Swipe to slide!');
      firstSlide = false;
      afterUndo = false;
      const from = { ...state.balls[m.id] };
      steps.push({ kind: 'slide', id: m.id, dir: m.dir, from, gate: res.exit && res.to ? gateKey(gateRefAt(entry, res.exit, res.to)) : undefined, brake: res.stop === 'trail', text });
    } else {
      steps.push({ kind: 'booster', key: m.kind, move: m, text: '' });
    }
    const r = applyMove(state, m);
    if (!r.ok) return null;
    state = r.state;
  }
  // hướng dẫn booster dừng ngay sau bước dùng booster; phần còn lại người chơi tự làm
  // hướng dẫn booster dừng ngay sau bước dùng booster; phần còn lại người chơi tự làm
  const lastBooster = steps.findIndex((st) => st.kind === 'booster');
  if (lastBooster >= 0) return steps.slice(0, lastBooster + 1);
  return steps;
}

/** Cửa của level đứng ở ô `to` theo hướng `side`. */
function gateRefAt(entry: LevelEntry, side: Dir, to: Pos): { side: Dir; index: number; depth?: number } {
  const lv = entry.level;
  for (const g of lv.gates) {
    if (g.side !== side) continue;
    const d = g.depth ?? 0;
    const c = side === 'up' ? { x: g.index, y: d } : side === 'down' ? { x: g.index, y: lv.height - 1 - d } : side === 'left' ? { x: d, y: g.index } : { x: lv.width - 1 - d, y: g.index };
    if (c.x === to.x && c.y === to.y) return g;
  }
  return { side, index: 0 };
}
