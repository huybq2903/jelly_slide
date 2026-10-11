// Solver cho lõi luật: số lượt tối thiểu, một lời giải, số lần dùng vệt làm phanh, số lần hoàn tác và số booster đã dùng.
// Booster không tính lượt (chi phí 0): duyệt theo từng lớp "số lượt đã dùng", trong một lớp mở rộng hết các booster trước rồi mới sang lớp sau.

import {
  armWild,
  createState,
  isEmptyCell,
  magnetGate,
  placeBomb,
  placePin,
  slide,
  status,
  trailLeft,
  undo,
  useMagnet,
  type BoosterResult,
  type Dir,
  type Level,
  type MoveResult,
  type State,
} from './rules';

export type BoosterKey = 'pin' | 'bomb' | 'magnet' | 'basket';

export type Move =
  | { kind: 'slide'; id: string; dir: Dir }
  | { kind: 'undo'; id: string }
  | { kind: 'pin'; x: number; y: number }
  | { kind: 'bomb'; x: number; y: number }
  | { kind: 'magnet'; id: string }
  | { kind: 'basket'; side: Dir; index: number; depth?: number };

export interface Solution {
  /** Các hành động theo thứ tự, kể cả booster. */
  moves: Move[];
  /** Số lượt tốn (cú trượt và hoàn tác); booster không tính. */
  length: number;
  /** Số cú trượt trong lời giải dừng lại nhờ một vệt còn sống ("dùng vệt làm phanh"). */
  trailStops: number;
  undos: number;
  /** Số lần dùng từng booster trong lời giải. */
  boosters: Partial<Record<BoosterKey, number>>;
}

export interface SolveOptions {
  /** Cho phép dùng hoàn tác. Mặc định có. */
  undo?: boolean;
  /** Cấm mọi cú trượt dừng nhờ vệt còn sống. Dùng để biết một level có *cần* vệt làm phanh không. */
  noTrailStops?: boolean;
  /** Số booster mỗi loại được phép dùng trong cả level. Mặc định không có booster nào. */
  boosters?: Partial<Record<BoosterKey, number>>;
  /** Số nút tối đa được mở rộng; vượt thì ném SolverLimit (để bộ sinh bỏ ứng viên thay vì hết bộ nhớ). */
  maxNodes?: number;
}

/** Solver vượt giới hạn `maxNodes`: kết quả không xác định. */
export class SolverLimit extends Error {}

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const BOOSTER_KEYS: BoosterKey[] = ['pin', 'bomb', 'magnet', 'basket'];

/** Các ô đặc biệt mà một chuỗi nước đi thật sự dùng đến: dừng ở ô dính, đi qua cổng dịch chuyển, bị ô mũi tên đổi hướng. */
export function featuresUsed(level: Level, moves: Move[]): Set<'sticky' | 'arrows' | 'portals' | 'frozen'> {
  const used = new Set<'sticky' | 'arrows' | 'portals' | 'frozen'>();
  let st = createState(level);
  for (const m of moves) {
    const r = applyMove(st, m);
    if (!r.ok) break;
    if (m.kind === 'slide') {
      const mr = r as Extract<MoveResult, { ok: true }>;
      if (mr.stop === 'sticky') used.add('sticky');
      if (mr.thawed) used.add('frozen');
      if (mr.jumps?.length) used.add('portals');
      const path = mr.path;
      if (path && level.arrows?.length) {
        path.forEach((p, i) => {
          const a = level.arrows!.find((q) => q.x === p.x && q.y === p.y);
          if (!a || i === 0 || (mr.jumps ?? []).includes(i - 1)) return;
          const prev = path[i - 1];
          const travel = p.x > prev.x ? 'right' : p.x < prev.x ? 'left' : p.y > prev.y ? 'down' : 'up';
          if (a.dir !== travel) used.add('arrows'); // mũi tên cùng hướng đang đi thì không đổi gì
        });
      }
    }
    st = r.state;
  }
  return used;
}

export function applyMove(state: State, move: Move): MoveResult | BoosterResult {
  switch (move.kind) {
    case 'slide':
      return slide(state, move.id, move.dir);
    case 'undo':
      return undo(state, move.id);
    case 'pin':
      return placePin(state, move.x, move.y);
    case 'bomb':
      return placeBomb(state, move.x, move.y);
    case 'magnet':
      return useMagnet(state, move.id);
    default:
      return armWild(state, move.side, move.index, move.depth ?? 0);
  }
}

/**
 * Khoá của trạng thái, chuẩn hoá theo tuổi của vệt (không phụ thuộc số lượt tuyệt đối).
 * Chỉ giữ vệt và cú trượt còn sống ở nước đi kế tiếp, vì phần còn lại không ảnh hưởng gì nữa.
 */
function key(state: State, withUndo: boolean, rem: string): string {
  const maxAge = state.level.trailLife - 1;
  const age = (turn: number) => state.turn - turn;
  const balls = state.level.balls.map((b) => {
    const p = state.balls[b.id];
    return p ? `${p.x},${p.y}` : 'out';
  });
  const owner = state.level.trailClock === 'owner';
  const trails = state.trails
    .filter((t) => (owner ? trailLeft(state, t) > 0 : age(t.turn) <= maxAge))
    .map((t) => `${t.x},${t.y},${owner ? trailLeft(state, t) : age(t.turn)}`)
    .sort();
  let k = `${balls.join('|')}#${trails.join(';')}`;
  if (withUndo) {
    const hist = state.level.balls.map((b) =>
      (state.history[b.id] ?? [])
        .filter((r, i, arr) => (owner ? i === arr.length - 1 : age(r.turn) <= maxAge))
        .map((r) => `${r.from.x},${r.from.y},${owner ? 0 : age(r.turn)}`)
        .join(';'),
    );
    k += `#${hist.join('|')}`;
  }
  if (state.frozen?.length) k += `#z${[...state.frozen].sort().join('')}`;
  if (state.level.gates.some((g) => g.rhythm)) k += `#t${state.turn % 2}`;
  if ((state.pins ?? []).length || (state.wild ?? []).length || rem !== '0000') {
    k += `#p${state.pins.map((p) => `${p.x},${p.y}`).sort().join(';')}#w${state.wild.map((w) => `${w.side}${w.index}${w.depth ?? 0}`).sort().join(';')}#r${rem}`;
  }
  return k;
}

interface Node {
  state: State;
  parent: number;
  move: Move | null;
  trailStop: boolean;
  rem: Partial<Record<BoosterKey, number>>;
}

const remKey = (rem: Partial<Record<BoosterKey, number>>): string => BOOSTER_KEYS.map((k) => rem[k] ?? 0).join('');

/** Các hành động booster hợp lệ ở trạng thái `state` (chỉ những loại còn trong kho). */
function boosterMoves(state: State, rem: Partial<Record<BoosterKey, number>>): Move[] {
  const out: Move[] = [];
  const { width, height } = state.level;
  if ((rem.pin ?? 0) > 0) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (isEmptyCell(state, x, y)) out.push({ kind: 'pin', x, y });
  }
  if ((rem.bomb ?? 0) > 0) {
    const bp = Object.values(state.balls);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isEmptyCell(state, x, y)) continue;
        if (bp.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) === 1)) out.push({ kind: 'bomb', x, y });
      }
    }
  }
  if ((rem.magnet ?? 0) > 0) for (const id of Object.keys(state.balls)) if (magnetGate(state, id)) out.push({ kind: 'magnet', id });
  if ((rem.basket ?? 0) > 0) {
    for (const g of state.level.gates) {
      if (!(state.wild ?? []).some((w) => w.side === g.side && w.index === g.index && (w.depth ?? 0) === (g.depth ?? 0))) out.push({ kind: 'basket', side: g.side, index: g.index, depth: g.depth });
    }
  }
  return out;
}

/** Lời giải ít lượt nhất trong số lượt cho phép của level, hoặc null nếu không có. */
export function solve(level: Level, opts: SolveOptions = {}): Solution | null {
  const withUndo = opts.undo ?? true;
  const startRem = { ...(opts.boosters ?? {}) };
  const nodes: Node[] = [{ state: createState(level), parent: -1, move: null, trailStop: false, rem: startRem }];
  const seen = new Set<string>([key(nodes[0].state, withUndo, remKey(startRem))]);
  const hasBoosters = BOOSTER_KEYS.some((k) => (startRem[k] ?? 0) > 0);
  const cap = opts.maxNodes ?? Infinity;

  let layer: number[] = [0];
  while (layer.length) {
    // đóng lớp theo booster (chi phí 0)
    if (hasBoosters) {
      for (let q = 0; q < layer.length; q++) {
        const i = layer[q];
        const { state, rem } = nodes[i];
        if (status(state) !== 'playing') continue;
        for (const move of boosterMoves(state, rem)) {
          const r = applyMove(state, move) as BoosterResult;
          if (!r.ok) continue;
          if (move.kind === 'bomb' && r.moved.length === 0) continue;
          const nrem = { ...rem, [move.kind]: (rem[move.kind as BoosterKey] ?? 0) - 1 };
          const k = key(r.state, withUndo, remKey(nrem));
          if (seen.has(k)) continue;
          seen.add(k);
          if (nodes.length > cap) throw new SolverLimit();
          nodes.push({ state: r.state, parent: i, move, trailStop: false, rem: nrem });
          layer.push(nodes.length - 1);
          if (status(r.state) === 'won') return reconstruct(nodes, nodes.length - 1);
        }
      }
    }
    // sang lớp kế: mỗi cú trượt hoặc hoàn tác tốn một lượt
    const next: number[] = [];
    for (const i of layer) {
      const { state, rem } = nodes[i];
      if (status(state) !== 'playing') continue;
      const moves: Move[] = [];
      for (const id of Object.keys(state.balls)) {
        for (const dir of DIRS) moves.push({ kind: 'slide', id, dir });
        if (withUndo) moves.push({ kind: 'undo', id });
      }
      for (const move of moves) {
        const r = applyMove(state, move) as MoveResult;
        if (!r.ok) continue;
        if (opts.noTrailStops && r.stop === 'trail') continue;
        const k = key(r.state, withUndo, remKey(rem));
        if (seen.has(k)) continue;
        seen.add(k);
        if (nodes.length > cap) throw new SolverLimit();
        nodes.push({ state: r.state, parent: i, move, trailStop: r.stop === 'trail', rem });
        next.push(nodes.length - 1);
        if (status(r.state) === 'won') return reconstruct(nodes, nodes.length - 1);
      }
    }
    layer = next;
  }
  return null;
}

function reconstruct(nodes: Node[], last: number): Solution {
  const moves: Move[] = [];
  let trailStops = 0;
  for (let i = last; nodes[i].parent >= 0; i = nodes[i].parent) {
    moves.push(nodes[i].move!);
    if (nodes[i].trailStop) trailStops++;
  }
  moves.reverse();
  const boosters: Partial<Record<BoosterKey, number>> = {};
  for (const m of moves) if (m.kind === 'pin' || m.kind === 'bomb' || m.kind === 'magnet' || m.kind === 'basket') boosters[m.kind] = (boosters[m.kind] ?? 0) + 1;
  const length = moves.filter((m) => m.kind === 'slide' || m.kind === 'undo').length;
  return { moves, length, trailStops, undos: moves.filter((m) => m.kind === 'undo').length, boosters };
}
