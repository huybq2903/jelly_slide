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
    // sau nước đúng đầu tiên: một nước SAI dẫn vào ngõ cụt (khối không còn cú trượt nào, vệt của chính nó chặn đường về), rồi lùi lại
    const first = moves[0];
    if (first?.kind === 'slide') {
      const r1 = applyMove(createState(entry.level), first);
      if (!r1.ok) return null;
      const s1 = r1.state;
      const stuck = (st: typeof s1): boolean => (['up', 'down', 'left', 'right'] as Dir[]).every((d) => !applyMove(st, { kind: 'slide', id: first.id, dir: d }).ok);
      const wrong = (['up', 'down', 'left', 'right'] as Dir[])
        .map((d): Move => ({ kind: 'slide', id: first.id, dir: d }))
        .find((m) => {
          if (m.kind === 'slide' && moves[1]?.kind === 'slide' && m.dir === moves[1].dir) return false;
          const r = applyMove(s1, m);
          return r.ok && !(r as { exit?: Dir }).exit && stuck(r.state);
        });
      if (!wrong) return null;
      moves = [first, wrong, { kind: 'undo', id: first.id }, ...moves.slice(1)];
    }
  }
  let state = createState(entry.level);
  const steps: TutStep[] = [];
  let firstSlide = true;
  let afterUndo = false;
  let slideIdx = 0;
  let stepIdx = 0;
  const perStep = entry.tutorial.steps;
  for (const m of moves) {
    const override = perStep?.[stepIdx++];
    if (m.kind === 'undo') {
      afterUndo = true;
      const dir = undoDir(state, m.id);
      if (!dir) return null;
      steps.push({ kind: 'undo', id: m.id, dir, from: { ...state.balls[m.id] }, text: override ?? (entry.tutorial.undoDemo ? 'Đi nhầm rồi! Vòng sáng là điểm gốc: kéo thạch về đó để lùi lại (tốn 1 lượt)!' : 'Vòng sáng là điểm gốc: kéo thạch về đó để lùi lại (tốn 1 lượt)!') });
    } else if (m.kind === 'slide') {
      const r = applyMove(state, m);
      if (!r.ok) return null;
      const res = r as { exit?: Dir; stop?: string; to?: Pos };
      const custom = entry.tutorial.moves[slideIdx++] as string | undefined;
      const text = override ?? custom ?? (afterUndo ? 'Thử lại nào!' : firstSlide ? 'Vuốt thạch về phía cổng của nó!' : res.exit ? 'Trượt vào cổng!' : res.stop === 'trail' ? 'Vệt chặn bạn lại. Phanh đẹp!' : 'Vuốt để trượt!');
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
