// Lõi luật Fading Flow: thuần logic, không dính giao diện.

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Pos {
  x: number;
  y: number;
}

export interface Level {
  width: number;
  height: number;
  walls: Pos[];
  /** `axis`: thạch một trục: 'h' chỉ trượt ngang (trái/phải), 'v' chỉ trượt dọc (lên/xuống). Không khai báo = trượt bốn hướng. */
  /** `hidden`: thạch ẩn (chỉ giao diện): màu bị che tới lần vuốt đầu tiên; không đổi luật (màu suy ra được bằng loại trừ vì mỗi màu một thạch). */
  balls: { id: string; color: string; x: number; y: number; axis?: 'h' | 'v'; hidden?: boolean; /** Thạch đóng băng: không vuốt được tới khi một khối khác trượt tới dừng sát nó (làm vỡ băng). */ frozen?: boolean }[];
  /** Ô dính: thạch trượt vào là dừng ngay tại ô đó (như phanh cố định). */
  sticky?: Pos[];
  /** Ô mũi tên: thạch trượt vào bị bẻ sang hướng `dir` và tiếp tục trượt; nếu bị chặn ngay thì dừng trên ô mũi tên. */
  arrows?: { x: number; y: number; dir: Dir }[];
  /** Cổng dịch chuyển (cặp ô): vào ô này thì ra ô kia và tiếp tục cùng hướng; ô ra đang bị chặn thì dừng lại tại ô vào. */
  portals?: { a: Pos; b: Pos }[];
  /**
   * `lock`: cổng đóng băng: chỉ nhận khối sau khi đã có `lock` khối thoát (ở các cổng khác). `rhythm`: cổng theo nhịp: chỉ nhận khối ở lượt chẵn ('even') hoặc lẻ ('odd').
   */
  gates: { color: string; side: Dir; index: number; depth?: number; lock?: number; rhythm?: 'even' | 'odd' }[];
  /**
   * Hình dạng bàn: mỗi chuỗi là một hàng (độ dài `width`, đủ `height` hàng), '#' = ô chơi được, '.' = ngoài bàn. Không khai báo = hình chữ nhật đầy đủ.
   * Cửa luôn nằm trên một ô chơi được có láng giềng theo hướng `side` là ngoài bàn.
   */
  mask?: string[];
  maxMoves: number;
  trailLife: number;
  /**
   * Đồng hồ của vệt: 'turn' (mặc định) = mọi nước đi đều làm vệt già đi; 'owner' = vệt chỉ già đi khi chính khối đã tạo ra nó di chuyển
   * (vệt chặn cho tới khi khối chủ đã đi thêm `trailLife` lần).
   */
  trailClock?: TrailClock;
  /** Khối bị hút ra thì xoá luôn mọi vệt của nó. Mặc định bật; đặt false để vệt tự hết hạn như bình thường. */
  clearTrailsOnExit?: boolean;
}

export type TrailClock = 'turn' | 'owner';

/** Tham chiếu một cửa: cạnh bao (up/down/left/right), chỉ số dọc cạnh đó và độ sâu (số ô tính từ cạnh bao vào trong, mặc định 0). */
export interface GateRef {
  side: Dir;
  index: number;
  depth?: number;
}

/** Ô chơi được chứa cửa `g`. Với bàn chữ nhật (depth 0) đó là ô sát cạnh bao. */
export function gateCell(level: Level, g: GateRef): Pos {
  const d = g.depth ?? 0;
  switch (g.side) {
    case 'up':
      return { x: g.index, y: d };
    case 'down':
      return { x: g.index, y: level.height - 1 - d };
    case 'left':
      return { x: d, y: g.index };
    default:
      return { x: level.width - 1 - d, y: g.index };
  }
}

/** Khoá chuỗi của một cửa (dùng làm khoá map, so sánh). */
export const gateKey = (g: GateRef): string => `${g.side}${g.index}${g.depth ? `d${g.depth}` : ''}`;
export const sameGate = (a: GateRef, b: GateRef): boolean => gateKey(a) === gateKey(b);

/** Ô (x,y) có thuộc bàn không (kể cả khi bàn có hình dạng riêng). */
export function inBoard(level: Level, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  return level.mask ? level.mask[y]?.[x] === '#' : true;
}

/** Các ô chơi được của bàn, theo hàng. */
export function boardCells(level: Level): Pos[] {
  const out: Pos[] = [];
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) if (inBoard(level, x, y)) out.push({ x, y });
  return out;
}

/** Vệt tạo ở lượt `turn`: chặn các lượt turn+1 .. turn+trailLife. Chế độ 'owner' còn ghi khối chủ và số thứ tự cú trượt của nó. */
export interface Trail extends Pos {
  turn: number;
  owner?: string;
  k?: number;
}

export interface State {
  level: Level;
  turn: number;
  /** Các khối còn trên bàn. Khối đã thoát bị bỏ khỏi đây. */
  balls: Record<string, Pos>;
  /** Id các khối đã thoát. */
  out: string[];
  /** Id các khối còn bị đóng băng. */
  frozen?: string[];
  trails: Trail[];
  /** Chồng cú trượt của từng khối, cú gần nhất ở cuối. Hoàn tác lấy từ đây. */
  history: Record<string, SlideRecord[]>;
  /** Khối đặt thêm (booster Pin): chặn VĨNH VIỄN như khối đá; `turn` là lượt lúc đặt (chỉ để phân biệt). */
  pins: Trail[];
  /** Số cú trượt đã thực hiện của từng khối (đồng hồ vệt ở chế độ 'owner'); hoàn tác giảm đi một. */
  moves: Record<string, number>;
  /** Giỏ đang là giỏ vạn năng (booster Chọn giỏ): nhận khối mọi màu một lần rồi về bình thường. */
  wild: GateRef[];
}

export interface SlideRecord {
  /** Lượt (nước đi số mấy) mà cú trượt này được thực hiện; cũng là `turn` của vệt nó tạo ra. */
  turn: number;
  from: Pos;
  /** Hướng phải kéo để quay lại theo đúng đường vừa đi (đi ngược ô liền trước trên đường đi). Có khi cú trượt qua ô mũi tên hoặc cổng dịch chuyển, lúc đó không phải hướng thẳng về ô xuất phát. */
  back?: Dir;
  /** Đường đi của cú trượt (chỉ có khi level có ô đặc biệt) và chỉ số các đoạn dịch chuyển: để hoàn tác đi ngược lại đúng đường đó. */
  path?: Pos[];
  jumps?: number[];
}

/** Vì sao một cú trượt dừng: mép bàn, khối đá, khối khác, hoặc vệt còn sống. */
export type StopReason = 'edge' | 'wall' | 'ball' | 'trail' | 'sticky';

/**
 * `stop`, `exit` và `to` (ô cuối khối dừng, kể cả khi bị hút ra) chỉ có ở kết quả của `slide`.
 * `exit` = cạnh bàn của cái giỏ đã hút khối ra (khối dừng ở ô sát giỏ cùng màu thì tự thoát).
 */
/** `path`/`jumps`: chỉ có khi level có ô đặc biệt (đường đi không còn thẳng): các ô khối đi qua theo thứ tự (kể cả ô xuất phát) và chỉ số các đoạn là dịch chuyển (path[i] → path[i+1]). */
export type MoveResult = { ok: true; state: State; stop?: StopReason; exit?: Dir; to?: Pos; path?: Pos[]; jumps?: number[]; /** Id khối bị đóng băng vừa được giải phóng (băng vỡ) nhờ cú trượt này. */ thawed?: string } | { ok: false; reason: string };

const DELTA: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function createState(level: Level): State {
  const balls: Record<string, Pos> = {};
  for (const b of level.balls) balls[b.id] = { x: b.x, y: b.y };
  const frozen = level.balls.filter((b) => b.frozen).map((b) => b.id);
  return { level, turn: 0, balls, out: [], trails: [], history: {}, moves: {}, pins: [], wild: [], ...(frozen.length ? { frozen } : {}) };
}

/** Vệt còn chặn ở nước đi số `move` (1-based) không? */
function alive(createdTurn: number, move: number, life: number): boolean {
  return move - createdTurn <= life;
}

/** Vệt còn chặn bao nhiêu nước đi nữa (từ góc nhìn trạng thái `state`); > 0 là còn sống. */
export function trailLeft(state: State, t: Trail): number {
  const life = state.level.trailLife;
  if (state.level.trailClock === 'owner' && t.owner !== undefined) return life - ((state.moves?.[t.owner] ?? 0) - (t.k ?? 0));
  return life - (state.turn - t.turn);
}

function isOffBoard(level: Level, x: number, y: number): boolean {
  return !inBoard(level, x, y);
}

/** Cạnh bàn có giỏ cùng màu với khối `id` nằm sát ô (x,y), hoặc null. Giỏ chỉ hút khối ở ô chứa nó. */
export function adjacentGate(level: Level, id: string, x: number, y: number): Dir | null {
  const color = level.balls.find((b) => b.id === id)?.color;
  for (const g of level.gates) {
    if (g.color !== color) continue;
    const c = gateCell(level, g);
    if (c.x === x && c.y === y) return g.side;
  }
  return null;
}

/**
 * Giỏ sẽ hút khối `id` đang đứng ở ô (x,y): giỏ cùng màu, hoặc giỏ vạn năng nếu không có giỏ cùng màu.
 * `wild` = hút nhờ giỏ vạn năng (giỏ đó sẽ về bình thường sau lần này).
 */
/** Cổng `g` đang mở cho cú đi số `move` không: cổng đóng băng cần đủ số khối đã thoát, cổng theo nhịp cần đúng chẵn/lẻ của lượt. */
export function gateOpen(state: State, g: Level['gates'][number], move: number = state.turn + 1): boolean {
  if (g.lock && state.out.length < g.lock) return false;
  if (g.rhythm && (move % 2 === 0) !== (g.rhythm === 'even')) return false;
  return true;
}

export function matchGate(state: State, id: string, x: number, y: number, move: number = state.turn + 1): { side: Dir; index: number; depth?: number; wild: boolean } | null {
  const { level } = state;
  const color = level.balls.find((b) => b.id === id)?.color;
  let viaWild: { side: Dir; index: number; depth?: number; wild: boolean } | null = null;
  for (const g of level.gates) {
    const c = gateCell(level, g);
    if (c.x !== x || c.y !== y) continue;
    if (!gateOpen(state, g, move)) continue;
    if (g.color === color) return { side: g.side, index: g.index, depth: g.depth, wild: false };
    if (!viaWild && (state.wild ?? []).some((w) => sameGate(w, g))) viaWild = { side: g.side, index: g.index, depth: g.depth, wild: true };
  }
  return viaWild;
}

export type Status = 'playing' | 'won' | 'lost';

export function status(state: State): Status {
  if (state.out.length === state.level.balls.length) return 'won';
  return state.turn >= state.level.maxMoves ? 'lost' : 'playing';
}

/** Cái gì đang chặn ô (x,y) (trong bàn) với khối `self`; null nếu đi vào được. */
function blockerAt(state: State, self: string, x: number, y: number): 'wall' | 'trail' | 'ball' | null {
  const { level } = state;
  if (level.walls.some((w) => w.x === x && w.y === y)) return 'wall';
  const move = state.turn + 1;
  if ((state.pins ?? []).some((t) => t.x === x && t.y === y)) return 'wall';
  // thân khối đứng trên ô có vệt của nó: tính là bị KHỐI chặn, không phải phanh bằng vệt
  if (Object.entries(state.balls).some(([id, p]) => id !== self && p.x === x && p.y === y)) return 'ball';
  if (state.trails.some((t) => t.x === x && t.y === y && trailLeft(state, t) > 0)) return 'trail';
  return null;
}

/** Level có ô đặc biệt (dính, mũi tên, cổng dịch chuyển) không. */
export const hasSpecialCells = (level: Level): boolean => !!(level.sticky?.length || level.arrows?.length || level.portals?.length);

/** Ô đặc biệt tại (x, y), hoặc null. */
export function specialAt(level: Level, x: number, y: number): 'sticky' | 'arrow' | 'portal' | null {
  if (level.sticky?.some((q) => q.x === x && q.y === y)) return 'sticky';
  if (level.arrows?.some((q) => q.x === x && q.y === y)) return 'arrow';
  if (level.portals?.some((q) => (q.a.x === x && q.a.y === y) || (q.b.x === x && q.b.y === y))) return 'portal';
  return null;
}

/** Ô ra của cổng dịch chuyển nếu (x, y) là một đầu của cặp cổng, ngược lại null. */
function portalExit(level: Level, x: number, y: number): Pos | null {
  for (const q of level.portals ?? []) {
    if (q.a.x === x && q.a.y === y) return q.b;
    if (q.b.x === x && q.b.y === y) return q.a;
  }
  return null;
}

/** Khối `id` có được trượt theo hướng `dir` không (thạch một trục chỉ trượt dọc trục của nó). */
export function axisAllows(level: Level, id: string, dir: Dir): boolean {
  const axis = level.balls.find((b) => b.id === id)?.axis;
  if (!axis) return true;
  return axis === 'h' ? dir === 'left' || dir === 'right' : dir === 'up' || dir === 'down';
}

export function slide(state: State, id: string, dir: Dir): MoveResult {
  const d = DELTA[dir];
  const from = state.balls[id];
  if (status(state) !== 'playing' || !from) return { ok: false, reason: 'not-playing' };
  if (!axisAllows(state.level, id, dir)) return { ok: false, reason: 'axis' };
  if (state.frozen?.includes(id)) return { ok: false, reason: 'frozen' };
  const move = state.turn + 1;
  const k = (state.moves?.[id] ?? 0) + 1;
  const made: Trail[] = [{ x: from.x, y: from.y, turn: move, owner: id, k }];
  let { x, y } = from;
  let stop: StopReason;
  let blockedAt: Pos | null = null; // ô thực sự đã chặn cú trượt (ô kế tiếp, hoặc ô ra của cổng dịch chuyển)
  const special = hasSpecialCells(state.level);
  let dd = d;
  const path: Pos[] = [{ x, y }];
  const jumps: number[] = [];
  const seen = new Set<string>();
  while (true) {
    const nx = x + dd.x;
    const ny = y + dd.y;
    if (isOffBoard(state.level, nx, ny)) {
      stop = 'edge';
      break;
    }
    const blocker = blockerAt(state, id, nx, ny);
    if (blocker) {
      stop = blocker;
      blockedAt = { x: nx, y: ny };
      break;
    }
    x = nx;
    y = ny;
    made.push({ x, y, turn: move, owner: id, k });
    if (!special) continue;
    path.push({ x, y });
    // vòng lặp (mũi tên/cổng quay về chính đường đi): dừng lại thay vì chạy mãi
    const sk = `${x},${y},${dd.x},${dd.y}`;
    if (seen.has(sk)) {
      stop = 'wall';
      break;
    }
    seen.add(sk);
    const portal = portalExit(state.level, x, y);
    if (portal) {
      const jb = blockerAt(state, id, portal.x, portal.y);
      if (jb) {
        stop = jb; // ô ra đang bị chặn: dừng lại tại ô vào
        blockedAt = { x: portal.x, y: portal.y };
        break;
      }
      jumps.push(path.length - 1);
      x = portal.x;
      y = portal.y;
      made.push({ x, y, turn: move, owner: id, k });
      path.push({ x, y });
    }
    const arrow = state.level.arrows?.find((q) => q.x === x && q.y === y);
    if (arrow) {
      // mũi tên ngược chiều đang đi: bị chặn ngay, thạch dừng trên ô mũi tên
      if (DELTA[arrow.dir].x === -dd.x && DELTA[arrow.dir].y === -dd.y) {
        stop = 'wall';
        break;
      }
      dd = DELTA[arrow.dir];
    }
    if (state.level.sticky?.some((q) => q.x === x && q.y === y)) {
      stop = 'sticky';
      break;
    }
  }
  if (made.length === 1) return { ok: false, reason: 'blocked' };
  // Dừng lại sát giỏ cùng màu thì bị hút ra luôn, không cần kéo thêm.
  const gate = matchGate(state, id, x, y, move);
  const exit = gate?.side ?? null;
  // dừng sát một khối đang đóng băng: băng vỡ
  let thawed: string | undefined;
  if (stop === 'ball' && !exit) {
    const bx = blockedAt ? blockedAt.x : x + dd.x;
    const by = blockedAt ? blockedAt.y : y + dd.y;
    thawed = Object.entries(state.balls).find(([bid, q]) => bid !== id && q.x === bx && q.y === by && state.frozen?.includes(bid))?.[0];
  }
  const own = new Set([move, ...(state.history[id] ?? []).map((r) => r.turn)]);
  const clear = exit && state.level.clearTrailsOnExit !== false;
  const moves = { ...(state.moves ?? {}), [id]: k };
  const after: State = { ...state, turn: move, moves };
  const trails = [
    ...state.trails.filter((t) => trailLeft(after, t) > 0 && !(clear && own.has(t.turn))),
    ...(clear ? [] : made),
  ];
  const balls = { ...state.balls };
  const out = [...state.out];
  if (exit) {
    delete balls[id];
    out.push(id);
  } else {
    balls[id] = { x, y };
  }
  // hướng kéo ngược theo đường vừa đi: mặc định ngược hướng trượt; nếu đường có mũi tên / cổng dịch chuyển thì quay về ô liền trước ngay sát ô cuối
  const opp: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  let back: Dir = opp[dir];
  if (special && path.length >= 2) {
    const pa = path[path.length - 2];
    const pb = path[path.length - 1];
    if (Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) === 1) back = pa.x < pb.x ? 'left' : pa.x > pb.x ? 'right' : pa.y < pb.y ? 'up' : 'down';
    else back = opp[dd === DELTA.up ? 'up' : dd === DELTA.down ? 'down' : dd === DELTA.left ? 'left' : 'right']; // ô liền trước cách xa (vừa qua cổng dịch chuyển): ngược hướng đang đi
  }
  const history = { ...state.history, [id]: [...(state.history[id] ?? []), { turn: move, from: { ...from }, back, ...(special ? { path: path.map((p) => ({ ...p })), jumps: [...jumps] } : {}) }] };
  const pins = state.pins ?? [];
  const wild = gate?.wild ? state.wild.filter((w) => !sameGate(w, gate)) : (state.wild ?? []);
  const frozen = thawed ? (state.frozen ?? []).filter((q) => q !== thawed) : state.frozen;
  return { ok: true, state: { ...state, turn: move, balls, out, trails, history, moves, pins, wild, ...(frozen ? { frozen } : {}) }, stop, exit: exit ?? undefined, to: { x, y }, ...(special ? { path, jumps } : {}), ...(thawed ? { thawed } : {}) };
}

/**
 * Cú trượt gần nhất `last` của khối `id` có hoàn tác được không. Đồng hồ 'turn': chỉ khi vệt của nó còn sống. Đồng hồ 'owner': vệt của cú
 * trượt gần nhất của chính khối đó thường còn sống; được khi vệt đó còn (chưa bị xoá khi hết hạn) và ô xuất phát chưa có khối khác đứng vào.
 */
function canUndoRecord(state: State, id: string, last: SlideRecord): boolean {
  if (state.level.trailClock === 'owner') {
    // vệt của cú trượt đó phải còn sống: vệt đã hết hạn thì không còn đường để kéo ngược (kéo dọc theo đó là một cú trượt thường)
    if (!state.trails.some((t) => t.turn === last.turn && trailLeft(state, t) > 0)) return false;
    return !Object.entries(state.balls).some(([bid, p]) => bid !== id && p.x === last.from.x && p.y === last.from.y);
  }
  return alive(last.turn, state.turn + 1, state.level.trailLife);
}

/**
 * Hoàn tác cú trượt gần nhất của khối `id`: tốn 1 lượt, khối về ô xuất phát, vệt của cú đó tan ngay.
 * Chỉ được khi vệt của cú đó còn sống. Không hoàn tác được cú làm khối thoát.
 */
export function undo(state: State, id: string): MoveResult {
  const stack = state.history[id] ?? [];
  const last = stack[stack.length - 1];
  const pos = state.balls[id];
  if (status(state) !== 'playing' || !last || !pos) return { ok: false, reason: 'nothing-to-undo' };
  const move = state.turn + 1;
  if (!canUndoRecord(state, id, last)) return { ok: false, reason: 'trail-expired' };
  // Hoàn tác cũng là một lượt đi của khối: các vệt khác (ngoài vệt của cú bị huỷ) già đi như sau mọi cú trượt, vệt hết hạn thì tan.
  const moves = { ...(state.moves ?? {}), [id]: (state.moves?.[id] ?? 0) + 1 };
  const after: State = { ...state, turn: move, moves };
  return {
    ok: true,
    state: {
      ...state,
      turn: move,
      balls: { ...state.balls, [id]: { ...last.from } },
      trails: state.trails.filter((t) => t.turn !== last.turn && trailLeft(after, t) > 0),
      history: { ...state.history, [id]: stack.slice(0, -1) },
      moves,
    },
  };
}

/**
 * Hướng người chơi phải kéo khối `id` để hoàn tác (quay lại theo vệt vừa đi), hoặc null nếu không hoàn tác được.
 * Hướng này luôn bị vệt phía sau chặn nên không trùng với một cú trượt thường.
 */
export function undoDir(state: State, id: string): Dir | null {
  if (status(state) !== 'playing') return null;
  const stack = state.history[id] ?? [];
  const last = stack[stack.length - 1];
  const pos = state.balls[id];
  if (!last || !pos || !canUndoRecord(state, id, last)) return null;
  if (last.back) return last.back;
  if (last.from.x !== pos.x) return last.from.x > pos.x ? 'right' : 'left';
  if (last.from.y !== pos.y) return last.from.y > pos.y ? 'down' : 'up';
  return null;
}

// ---------- Booster ----------
// Booster không tính lượt và không làm vệt cũ già đi (`turn` giữ nguyên). Không booster nào để lại vệt.

/** Một khối bị booster di chuyển: `to` là ô cuối (với nam châm là ô sát giỏ), `exit` có nghĩa là khối thoát qua giỏ ở cạnh đó. */
export interface BoosterMove {
  id: string;
  from: Pos;
  to: Pos;
  exit?: Dir;
}

export type BoosterResult = { ok: true; state: State; moved: BoosterMove[] } | { ok: false; reason: string };

/** Ô trống thật sự: trong bàn, không đá, không khối, không vệt hay ghim còn chặn. */
export function isEmptyCell(state: State, x: number, y: number): boolean {
  const { level } = state;
  if (isOffBoard(level, x, y)) return false;
  if (level.walls.some((w) => w.x === x && w.y === y)) return false;
  if (specialAt(level, x, y)) return false;
  if (Object.values(state.balls).some((p) => p.x === x && p.y === y)) return false;
  const move = state.turn + 1;
  if (state.trails.some((t) => t.x === x && t.y === y && trailLeft(state, t) > 0)) return false;
  if ((state.pins ?? []).some((t) => t.x === x && t.y === y)) return false;
  return true;
}

/** Cho khối `id` thoát: bỏ khỏi bàn, xoá vệt của nó nếu luật bật (như khi bị giỏ hút ra). */
function eject(state: State, id: string): State {
  const own = new Set((state.history[id] ?? []).map((r) => r.turn));
  const clear = state.level.clearTrailsOnExit !== false;
  const balls = { ...state.balls };
  delete balls[id];
  return { ...state, balls, out: [...state.out, id], trails: clear ? state.trails.filter((t) => !own.has(t.turn)) : state.trails };
}

/** Ô đặt pin được: ô trống và không phải ô của cổng (pin đặt lên ô cổng sẽ khoá cổng đó vĩnh viễn). */
export function isPinnable(state: State, x: number, y: number): boolean {
  if (!isEmptyCell(state, x, y)) return false;
  return !state.level.gates.some((g) => {
    const c = gateCell(state.level, g);
    return c.x === x && c.y === y;
  });
}

/** Pin: đặt một khối vĩnh viễn lên một ô trống (chặn như khối đá cho tới hết level). */
export function placePin(state: State, x: number, y: number): BoosterResult {
  if (status(state) !== 'playing') return { ok: false, reason: 'not-playing' };
  if (!isPinnable(state, x, y)) return { ok: false, reason: 'not-empty' };
  return { ok: true, state: { ...state, pins: [...(state.pins ?? []), { x, y, turn: state.turn }] }, moved: [] };
}

/**
 * Bom bông: đặt lên một ô trống, nổ ngay, đẩy khối ở bốn ô cạnh ra xa một ô. Khối đứng yên nếu ô đích ngoài bàn,
 * là đá, khối khác, vệt hay ghim còn chặn. Khối bị đẩy tới ô sát giỏ nhận được nó thì bị hút ra như khi vuốt tới.
 * Khối bị đẩy không hoàn tác được nữa (lịch sử cú trượt của nó bị xoá).
 */
export function placeBomb(state: State, x: number, y: number): BoosterResult {
  if (status(state) !== 'playing') return { ok: false, reason: 'not-playing' };
  if (!isEmptyCell(state, x, y)) return { ok: false, reason: 'not-empty' };
  let next = state;
  const moved: BoosterMove[] = [];
  const taken = new Set<string>();
  for (const dir of ['up', 'right', 'down', 'left'] as Dir[]) {
    const d = DELTA[dir];
    const at = { x: x + d.x, y: y + d.y };
    const id = Object.entries(state.balls).find(([, p]) => p.x === at.x && p.y === at.y)?.[0];
    if (!id || state.frozen?.includes(id)) continue;
    const to = { x: at.x + d.x, y: at.y + d.y };
    if (!isEmptyCell(state, to.x, to.y) || taken.has(`${to.x},${to.y}`)) continue;
    taken.add(`${to.x},${to.y}`);
    const from = { ...at };
    const gate = matchGate({ ...next, balls: { ...next.balls, [id]: to } }, id, to.x, to.y);
    next = { ...next, balls: { ...next.balls, [id]: to } };
    if (gate) {
      next = eject(next, id);
      if (gate.wild) next = { ...next, wild: next.wild.filter((w) => !sameGate(w, gate)) };
    }
    next = { ...next, history: { ...next.history, [id]: [] } };
    moved.push({ id, from, to, exit: gate?.side });
  }
  return { ok: true, state: next, moved };
}

/** Giỏ cùng màu mà khối `id` đang thẳng hàng hoặc thẳng cột (nam châm chỉ chọn được khối như vậy), hoặc null. */
export function magnetGate(state: State, id: string): GateRef | null {
  const p = state.balls[id];
  const color = state.level.balls.find((b) => b.id === id)?.color;
  if (!p || status(state) !== 'playing' || state.frozen?.includes(id)) return null;
  for (const g of state.level.gates) {
    if (g.color !== color || !gateOpen(state, g)) continue;
    const aligned = g.side === 'up' || g.side === 'down' ? g.index === p.x : g.index === p.y;
    if (aligned) return { side: g.side, index: g.index, depth: g.depth };
  }
  return null;
}

/** Nam châm: hút khối `id` thẳng tới giỏ cùng màu của nó, xuyên mọi vật cản, rồi thoát. Không để lại vệt. */
export function useMagnet(state: State, id: string): BoosterResult {
  const g = magnetGate(state, id);
  const from = state.balls[id];
  if (!g || !from) return { ok: false, reason: 'not-aligned' };
  const to = gateCell(state.level, g);
  return { ok: true, state: eject(state, id), moved: [{ id, from: { ...from }, to, exit: g.side }] };
}

/** Chọn giỏ: giỏ `ref` nhận khối mọi màu một lần. */
export function armWild(state: State, side: Dir, index: number, depth = 0): BoosterResult {
  if (status(state) !== 'playing') return { ok: false, reason: 'not-playing' };
  const ref: GateRef = { side, index, depth: depth || undefined };
  if (!state.level.gates.some((g) => sameGate(g, ref))) return { ok: false, reason: 'no-gate' };
  if ((state.wild ?? []).some((w) => sameGate(w, ref))) return { ok: false, reason: 'already' };
  return { ok: true, state: { ...state, wild: [...(state.wild ?? []), ref] }, moved: [] };
}

/**
 * Kiểm tra level hợp lệ: mặt nạ đủ kích thước, mọi ô đặt khối/đá/cửa nằm trong bàn và không trùng nhau, mỗi cửa nằm ở ô có láng giềng
 * theo hướng cửa là ngoài bàn. Trả về danh sách lỗi (rỗng = hợp lệ).
 */
export function validateLevel(level: Level): string[] {
  const errs: string[] = [];
  if (level.mask) {
    if (level.mask.length !== level.height) errs.push('mask sai số hàng');
    for (const row of level.mask) if (row.length !== level.width) errs.push('mask sai độ rộng hàng');
  }
  const used = new Set<string>();
  const place = (what: string, x: number, y: number): void => {
    if (!inBoard(level, x, y)) errs.push(`${what} ngoài bàn (${x},${y})`);
    const k = `${x},${y}`;
    if (used.has(k)) errs.push(`${what} trùng ô (${x},${y})`);
    used.add(k);
  };
  for (const w of level.walls) place('đá', w.x, w.y);
  for (const b of level.balls) place(`khối ${b.id}`, b.x, b.y);
  const special = new Set<string>();
  const sp = (what: string, q: Pos): void => {
    if (!inBoard(level, q.x, q.y)) errs.push(`${what} ngoài bàn (${q.x},${q.y})`);
    const k = `${q.x},${q.y}`;
    if (used.has(k) || special.has(k)) errs.push(`${what} trùng ô (${q.x},${q.y})`);
    special.add(k);
  };
  for (const q of level.sticky ?? []) sp('ô dính', q);
  for (const q of level.arrows ?? []) sp('ô mũi tên', q);
  for (const q of level.portals ?? []) {
    sp('cổng dịch chuyển', q.a);
    sp('cổng dịch chuyển', q.b);
  }
  const DELTAS: Record<Dir, Pos> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const seen = new Set<string>();
  for (const g of level.gates) {
    const c = gateCell(level, g);
    if (!inBoard(level, c.x, c.y)) errs.push(`cửa ${gateKey(g)} ngoài bàn`);
    else if (inBoard(level, c.x + DELTAS[g.side].x, c.y + DELTAS[g.side].y)) errs.push(`cửa ${gateKey(g)} không ở mép bàn`);
    if (seen.has(gateKey(g))) errs.push(`cửa trùng ${gateKey(g)}`);
    seen.add(gateKey(g));
  }
  return errs;
}
