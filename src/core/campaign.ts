// Kịch bản 30 level đầu tiên: mỗi level một bài học, nhịp độ khó 5/15/25 khó và 10/20/30 siêu khó.
// Mỗi mục là thông số cho bộ sinh level (hình bàn, số khối, đá, yêu cầu bắt buộc đo bằng solver); level thật do `npm run gen:levels` sinh ra.

import type { LevelSpec } from './generator';
import type { BoosterKey } from './solver';
import type { Level } from './rules';

export type Tier = 'easy' | 'medium' | 'hard' | 'super';

export interface TutorialText {
  /** Dòng chữ hiện ở đầu màn hình khi thực hiện bước hướng dẫn. */
  text: string;
}

export interface CampaignEntry {
  /** Ý chính của level (để ghi chú, không hiện cho người chơi). */
  concept: string;
  tier: Tier;
  spec: LevelSpec;
  /** Seed gốc; sinh lỗi thì thử seed kế. */
  seed: number;
  /** Level vẽ tay (không sinh): dùng nguyên văn, chỉ giải để lấy lời giải. */
  fixed?: Level;
  /**
   * Hướng dẫn cưỡng bức: các bước lấy từ lời giải của solver. `moves` = lời chữ cho từng bước theo thứ tự hành động (cú vuốt, hoàn tác, booster);
   * thiếu thì dùng lời chữ mặc định của loại bước. Chỉ có ở level dạy thao tác hoặc booster.
   */
  tutorial?: {
    moves: string[];
    intro?: string;
    /** Dạy hoàn tác: sau cú vuốt đầu tiên, ép kéo ngược rồi vuốt lại. */
    undoDemo?: boolean;
    /** Lời cho TỪNG bước (cả bước hoàn tác), thay lời mặc định. */
    steps?: string[];
  };
  /** Booster được mở khoá (tặng 2 cái + popup) ở level này. */
  unlocks?: BoosterKey;
  /** Mechanic được giới thiệu ở level này bằng một popup (không ép nước đi). Khoá khớp `MECHANICS` trong game.ts. */
  introduces?: string;
}

const base = { trailLife: 2, trailClock: 'owner' as const };

export const CAMPAIGN: CampaignEntry[] = [
  // ---- 1–4: một khối ----
  { concept: 'Vuốt để trượt, dừng sát cửa thì bị hút', tier: 'easy', seed: 101, tutorial: { moves: ['Vuốt để trượt!'] },
    spec: { ...base, shape: { name: 'rect', n: 4 }, width: 4, height: 4, balls: 1, walls: [0, 1], minMoves: 1, maxMinMoves: 1, maxMoves: 4, slack: 3, forbid: { brake: true, undo: true } } },
  { concept: 'Vệt biến mất sau 2 lượt đi của khối tạo ra nó', tier: 'easy', seed: 102, tutorial: { moves: ['Trượt đi! Thạch để lại một vệt phía sau.', 'Vệt sẽ vỡ sau 2 lần đi nữa của thạch. Cứ trượt tiếp!', 'Trượt tiếp và xem vệt đầu tiên vỡ!', 'Vệt đã biến mất! Trượt tới cổng!'] },
    spec: { ...base, shape: { name: 'rect', n: 5, h: 4 }, width: 5, height: 4, balls: 1, walls: [1, 2], minMoves: 4, maxMinMoves: 4, maxMoves: 7, slack: 3, forbid: { brake: true, undo: true } } },
  { concept: 'Dùng mép bàn và tường để chỉnh vị trí', tier: 'easy', seed: 103,
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 1, walls: [2, 3], minMoves: 3, maxMinMoves: 3, maxMoves: 6, slack: 3, forbid: { brake: true, undo: true } } },
  // Level vẽ tay: vuốt lên (đúng) → vuốt phải (SAI: vào ngõ cụt, vệt của chính nó chặn đường về) → lùi lại (vệt cũ cũng tan) → vuốt trái vào cổng.
  { concept: 'Lùi lại: màn dạy riêng (một nước sai vào ngõ cụt buộc phải lùi; lùi cũng tính lượt nên vệt cũ tan)', tier: 'easy', seed: 107,
    tutorial: { undoDemo: true, moves: [], steps: [
      'Vuốt thạch lên trên!',
      'Giờ thử vuốt sang phải xem sao!',
      'Tắc đường rồi! Kéo thạch về điểm gốc có vòng sáng để lùi lại (tốn 1 lượt)!',
      'Lùi lại cũng tính là một lần đi, nên vệt cũ đã vỡ. Giờ vuốt sang trái vào cổng!',
    ] },
    fixed: { width: 5, height: 5, walls: [{ x: 2, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }], balls: [{ id: 'A', color: 'pink', x: 2, y: 4 }], gates: [{ color: 'pink', side: 'left', index: 2 }], maxMoves: 5, trailLife: 2, trailClock: 'owner' },
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 1, walls: [1, 3], minMoves: 2, maxMinMoves: 3, maxMoves: 5, slack: 3 } },
  { concept: 'KHÓ: hai khối đầu tiên, lời giải tối ưu phanh nhờ vệt của khối KHÁC, dư 2 lượt', tier: 'hard', seed: 105,
    tutorial: { moves: [], steps: ["Vuốt thạch xanh xuống. Nó để lại một vệt phía sau!", "Vệt là phanh! Vuốt thạch hồng sang trái: nó dừng sát vệt xanh, dù chỗ đó không có thạch.", "Vuốt thạch hồng xuống: nó dừng sát tường.", "Vuốt thạch hồng sang phải vào cổng hồng!", "Cuối cùng vuốt thạch xanh sang trái vào cổng xanh!"] },
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 2, walls: [2, 3], minMoves: 4, maxMinMoves: 6, maxMoves: 8, slack: 3, require: { brake: true, otherBrake: true }, forbid: { undo: true } } },
  // ---- 5–15: hai khối ----
  { concept: 'Thạch một trục: giới thiệu sớm (một khối chỉ trượt dọc theo mũi tên)', tier: 'easy', seed: 108, introduces: 'axis',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 2, walls: [1, 3], minMoves: 3, maxMinMoves: 5, maxMoves: 8, slack: 3, oneAxis: 1, require: { axisMatters: true }, forbid: { brake: true, undo: true } } },
  { concept: 'Vệt của khối này chặn khối kia, một khối chỉ đi một trục', tier: 'medium', seed: 104,
    spec: { ...base, shape: { name: 'L', n: 6 }, width: 6, height: 6, balls: 2, walls: [1, 3], minMoves: 4, maxMinMoves: 6, maxMoves: 8, slack: 3, oneAxis: 1, require: { trailMatters: true, axisMatters: true }, forbid: { brake: true, undo: true } } },
  { concept: 'Mở khoá Block: đặt khối vĩnh viễn', tier: 'medium', seed: 112, unlocks: 'pin', tutorial: { moves: [], intro: 'Vật phẩm mới: Khối chặn!' },
    spec: { ...base, shape: { name: 'hex', n: 6 }, width: 6, height: 6, balls: 2, walls: [1, 1], minMoves: 3, maxMinMoves: 4, maxMoves: 5, slack: 4, require: { boosterHelps: 'pin' }, forbid: { brake: true, undo: true } } },
  { concept: 'Vệt làm phanh: dừng nhờ vệt của khối kia', tier: 'medium', seed: 109,
    spec: { ...base, shape: { name: 'cross', n: 7 }, width: 7, height: 7, balls: 2, walls: [1, 2], minMoves: 3, maxMinMoves: 4, maxMoves: 5, slack: 3, require: { brake: true }, forbid: { undo: true } } },
  { concept: 'SIÊU KHÓ: vệt khối này chặn khối kia, phanh bắt buộc, chỉ dư 1 lượt', tier: 'super', seed: 110,
    spec: { ...base, shape: { name: 'diamond', n: 3 }, width: 7, height: 7, balls: 2, walls: [3, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 9, slack: 2, require: { brake: true, undo: true } } },
  { concept: 'Mở khoá Rainbow Gate', tier: 'medium', seed: 114, unlocks: 'basket', tutorial: { moves: [], intro: 'Vật phẩm mới: Cổng cầu vồng!' },
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 2, walls: [2, 3], minMoves: 3, maxMinMoves: 4, maxMoves: 5, slack: 3, require: { boosterHelps: 'basket' }, forbid: { brake: true, undo: true } } },
  { concept: 'Bàn bậc thang: hai khối, thứ tự đi quan trọng', tier: 'medium', seed: 111,
    spec: { ...base, shape: { name: 'stairs', n: 6 }, width: 6, height: 6, balls: 2, walls: [2, 2], minMoves: 3, maxMinMoves: 4, maxMoves: 8, slack: 3, forbid: { brake: true, undo: true } } },
  { concept: 'Thạch một trục: luyện lại sau khi học ở L6 (không hướng dẫn)', tier: 'easy', seed: 133,
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 2, walls: [1, 3], minMoves: 4, maxMinMoves: 5, maxMoves: 8, slack: 3, oneAxis: 1, require: { axisMatters: true }, forbid: { undo: true } } },
  { concept: 'Một trục cộng vệt chặn khối kia', tier: 'medium', seed: 134,
    spec: { ...base, shape: { name: 'L', n: 6 }, width: 6, height: 6, balls: 2, walls: [1, 2], minMoves: 3, maxMinMoves: 4, maxMoves: 7, slack: 3, oneAxis: 1, require: { axisMatters: true }, forbid: { undo: true } } },
  { concept: 'KHÓ: hai khối, một khối chỉ đi một trục, phanh bắt buộc, dư 1 lượt', tier: 'hard', seed: 135,
    spec: { ...base, shape: { name: 'ring', n: 6 }, width: 6, height: 6, balls: 2, walls: [2, 3], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 2, oneAxis: 1, require: { axisMatters: true, brake: true } } },
  // ---- 16–25: ba khối ----
  // Level vẽ tay để dạy nam châm: thạch vàng bị tường và thạch hồng chắn giữa nó và cổng; nam châm hút xuyên qua hết (2 nước thay vì 5).
  { concept: 'Mở khoá Magnet: thạch vàng thẳng hàng với cổng nhưng bị tường và thạch hồng chắn, nam châm hút xuyên qua', tier: 'easy', seed: 118, unlocks: 'magnet', tutorial: { moves: [], intro: 'Vật phẩm mới: Nam châm!' },
    fixed: { width: 6, height: 5, walls: [{ x: 2, y: 2 }, { x: 0, y: 3 }], balls: [{ id: 'A', color: 'pink', x: 3, y: 2 }, { id: 'B', color: 'teal', x: 1, y: 3 }, { id: 'C', color: 'gold', x: 5, y: 2 }], gates: [{ color: 'pink', side: 'down', index: 3 }, { color: 'teal', side: 'up', index: 1 }, { color: 'gold', side: 'left', index: 2 }], maxMoves: 7, trailLife: 2, trailClock: 'owner' },
    spec: { ...base, shape: { name: 'hex', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 6, maxMoves: 7, slack: 3, require: { boosterHelps: 'magnet' }, forbid: { brake: true, undo: true } } },
  { concept: 'Magnet trên bàn đồng hồ cát', tier: 'medium', seed: 119,
    spec: { ...base, shape: { name: 'hourglass', n: 7 }, width: 7, height: 7, balls: 3, walls: [2, 2], minMoves: 4, maxMinMoves: 6, maxMoves: 6, slack: 3, require: { boosterHelps: 'magnet' }, forbid: { brake: true, undo: true } } },
  { concept: 'Chuỗi vệt giữa ba khối trên bàn bậc thang', tier: 'easy', seed: 126,
    spec: { ...base, shape: { name: 'stairs', n: 6 }, width: 6, height: 6, balls: 3, colors: 2, walls: [2, 3], minMoves: 5, maxMinMoves: 7, maxMoves: 8, slack: 3, forbid: { brake: true, undo: true } } },
  { concept: 'Chữ L lớn, ba khối, cần phanh', tier: 'medium', seed: 124,
    spec: { ...base, shape: { name: 'L', n: 7 }, width: 7, height: 7, balls: 3, walls: [2, 3], minMoves: 5, maxMinMoves: 7, maxMoves: 7, slack: 3, require: { brake: true } } },
  { concept: 'SIÊU KHÓ: ba khối, phanh bắt buộc, chỉ dư 1 lượt', tier: 'super', seed: 120,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, colors: 2, walls: [3, 4], minMoves: 7, maxMinMoves: 9, maxMoves: 8, slack: 2, require: { brake: true } } },
  { concept: 'Mở khoá Jelly Bomb: tách khối dính nhau', tier: 'easy', seed: 121, unlocks: 'bomb', tutorial: { moves: [], intro: 'Vật phẩm mới: Bom thạch!' },
    spec: { ...base, shape: { name: 'cross', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 6, maxMoves: 6, slack: 2, require: { boosterHelps: 'bomb' }, forbid: { undo: true } } },
  // L22
  { concept: 'Thạch ẩn: giới thiệu (màu suy ra bằng loại trừ)', tier: 'easy', seed: 201, introduces: 'hidden',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 7, slack: 3, hidden: 1, colors: 2, forbid: { brake: true, undo: true } } },
  // L23
  { concept: 'Thạch ẩn trên bàn chữ nhật', tier: 'medium', seed: 202,
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 6, slack: 3, hidden: 1, colors: 2, forbid: { undo: true } } },
  // L24
  { concept: 'Thạch ẩn, vòng có lỗ, cần phanh', tier: 'medium', seed: 203,
    spec: { ...base, shape: { name: 'ring', n: 6 }, width: 6, height: 6, balls: 3, walls: [2, 3], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, hidden: 1, colors: 2, require: { brake: true } } },
  // L25
  { concept: 'KHÓ: thạch ẩn, bàn lục giác, phanh bắt buộc', tier: 'hard', seed: 204,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 8, slack: 2, hidden: 1, colors: 2, require: { brake: true } } },
  // L26
  { concept: 'Ô mũi tên: giới thiệu', tier: 'easy', seed: 205, introduces: 'arrows',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 7, slack: 3, arrows: 1, require: { featureHelps: 'arrows' }, forbid: { brake: true, undo: true } } },
  // L27
  { concept: 'Hai ô mũi tên trên bàn lục giác', tier: 'medium', seed: 206,
    spec: { ...base, shape: { name: 'hex', n: 6 }, width: 6, height: 6, balls: 3, colors: 2, walls: [1, 1], minMoves: 4, maxMinMoves: 5, maxMoves: 6, slack: 3, arrows: 2, require: { featureHelps: 'arrows' }, forbid: { brake: true, undo: true } } },
  // L28
  { concept: 'Ô mũi tên trên bàn chữ L', tier: 'medium', seed: 207,
    spec: { ...base, shape: { name: 'L', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 2], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, arrows: 2, require: { featureHelps: 'arrows' }, forbid: { undo: true } } },
  // L29
  { concept: 'Mũi tên cộng thạch một trục', tier: 'medium', seed: 208,
    spec: { ...base, shape: { name: 'stairs', n: 6 }, width: 6, height: 6, balls: 3, colors: 2, walls: [2, 2], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, arrows: 1, oneAxis: 1, require: { featureHelps: 'arrows' }, forbid: { brake: true, undo: true } } },
  // L30
  { concept: 'SIÊU KHÓ: hai ô mũi tên, phanh bắt buộc', tier: 'super', seed: 209,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 8, slack: 2, arrows: 2, require: { brake: true } } },
  // L31
  { concept: 'Cổng dịch chuyển: giới thiệu', tier: 'easy', seed: 210, introduces: 'portals',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 7, slack: 3, portals: 1, require: { featureHelps: 'portals' }, forbid: { brake: true, undo: true } } },
  // L32
  { concept: 'Cổng dịch chuyển trên bàn chữ nhật', tier: 'medium', seed: 211,
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 3, colors: 2, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 6, slack: 3, portals: 1, require: { featureHelps: 'portals' }, forbid: { undo: true } } },
  // L33
  { concept: 'Cổng dịch chuyển cộng phanh', tier: 'medium', seed: 212,
    spec: { ...base, shape: { name: 'L', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 2], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, portals: 1, require: { brake: true } } },
  // L34
  { concept: 'Cổng dịch chuyển cộng thạch ẩn', tier: 'medium', seed: 213,
    spec: { ...base, shape: { name: 'hourglass', n: 7 }, width: 7, height: 7, balls: 3, walls: [2, 2], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, portals: 1, hidden: 1, colors: 2, forbid: { undo: true } } },
  // L35
  { concept: 'KHÓ: cổng dịch chuyển cộng mũi tên, phanh bắt buộc', tier: 'hard', seed: 214,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, colors: 2, walls: [3, 4], minMoves: 6, maxMinMoves: 7, maxMoves: 7, slack: 2, portals: 1, arrows: 1, require: { brake: true } } },
  // L36
  { concept: 'Ô dính: giới thiệu', tier: 'easy', seed: 215, introduces: 'sticky',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 7, slack: 3, sticky: 1, require: { featureHelps: 'sticky' }, forbid: { brake: true, undo: true } } },
  // L37
  { concept: 'Hai ô dính trên bàn tam giác', tier: 'medium', seed: 216,
    spec: { ...base, shape: { name: 'triangle', n: 4 }, width: 7, height: 4, balls: 3, colors: 2, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 6, slack: 3, sticky: 2, require: { featureHelps: 'sticky' }, forbid: { undo: true } } },
  // L38
  { concept: 'Ô dính cộng cổng dịch chuyển', tier: 'medium', seed: 217,
    spec: { ...base, shape: { name: 'ring', n: 6 }, width: 6, height: 6, balls: 3, walls: [2, 3], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, sticky: 1, portals: 1, forbid: { undo: true } } },
  // L39
  { concept: 'Ô dính cộng mũi tên', tier: 'medium', seed: 218,
    spec: { ...base, shape: { name: 'hex', n: 6 }, width: 6, height: 6, balls: 3, colors: 2, walls: [1, 1], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, sticky: 1, arrows: 1, forbid: { undo: true } } },
  // L40
  { concept: 'SIÊU KHÓ: ô dính, cổng dịch chuyển, phanh bắt buộc', tier: 'super', seed: 219,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 8, slack: 2, sticky: 1, portals: 1, require: { brake: true } } },
  // L41
  { concept: 'Hồi sức: bàn chữ nhật, một ô dính', tier: 'easy', seed: 220,
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 3, colors: 2, walls: [1, 2], minMoves: 5, maxMinMoves: 5, maxMoves: 8, slack: 3, sticky: 1, forbid: { brake: true, undo: true } } },
  // L42
  { concept: 'Một trục cộng mũi tên', tier: 'medium', seed: 221,
    spec: { ...base, shape: { name: 'diamond', n: 3 }, width: 7, height: 7, balls: 3, walls: [2, 3], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, oneAxis: 1, arrows: 1, forbid: { undo: true } } },
  // L43
  { concept: 'Thạch ẩn cộng cổng dịch chuyển', tier: 'medium', seed: 222,
    spec: { ...base, shape: { name: 'stairs', n: 6 }, width: 6, height: 6, balls: 3, walls: [2, 2], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 3, hidden: 1, colors: 2, portals: 1, forbid: { undo: true } } },
  // L44
  { concept: 'Ô dính cộng mũi tên trên bàn đồng hồ cát', tier: 'medium', seed: 223,
    spec: { ...base, shape: { name: 'hourglass', n: 7 }, width: 7, height: 7, balls: 3, colors: 2, walls: [2, 2], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 3, sticky: 1, arrows: 1, forbid: { undo: true } } },
  // L45
  { concept: 'KHÓ: dịch chuyển, mũi tên và ô dính, phanh bắt buộc', tier: 'hard', seed: 224,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 8, slack: 2, portals: 1, arrows: 1, sticky: 1, require: { brake: true } } },
  // L46
  { concept: 'Một trục, cổng dịch chuyển, thạch ẩn', tier: 'medium', seed: 225,
    spec: { ...base, shape: { name: 'L', n: 7 }, width: 7, height: 7, balls: 3, walls: [2, 3], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 3, oneAxis: 1, portals: 1, hidden: 1, colors: 2, forbid: { undo: true } } },
  // L47
  { concept: 'Mũi tên cộng ô dính, bàn vòng', tier: 'medium', seed: 226,
    spec: { ...base, shape: { name: 'ring', n: 6 }, width: 6, height: 6, balls: 3, colors: 2, walls: [2, 3], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 3, arrows: 1, sticky: 1, forbid: { undo: true } } },
  // L48
  { concept: 'Mũi tên và cổng dịch chuyển trên bàn chữ thập', tier: 'medium', seed: 227,
    spec: { ...base, shape: { name: 'cross', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 4], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 3, arrows: 1, portals: 1, forbid: { undo: true } } },
  // L49
  { concept: 'Hồi sức: thạch ẩn trên bàn vuông', tier: 'easy', seed: 228,
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 5, maxMinMoves: 5, maxMoves: 8, slack: 3, hidden: 1, colors: 2, forbid: { brake: true, undo: true } } },
  // L50
  { concept: 'SIÊU KHÓ — BOSS: mọi mechanic, phanh bắt buộc', tier: 'super', seed: 229,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 4], minMoves: 8, maxMinMoves: 9, maxMoves: 9, slack: 2, oneAxis: 1, hidden: 1, colors: 2, arrows: 1, portals: 1, sticky: 1, require: { brake: true } } },
];

/**
 * Giai đoạn 2 (L51–75: thạch đóng băng, cổng đóng băng, cổng theo nhịp): kịch bản ĐÃ VIẾT NHƯNG CHƯA SINH/ĐƯA VÀO GAME (tạm dừng vì sinh level chậm).
 * Luật, bộ giải, hiển thị và popup của ba mechanic đã xong. Khi tiếp tục: nối mảng này vào CAMPAIGN, sinh level (xem scripts/gen-levels.ts) và bật lại
 * ba dòng level 51/56/61 trong FEATURES (game.ts).
 */
export const CAMPAIGN_PHASE2: CampaignEntry[] = [
  // L51
  { concept: 'Thạch đóng băng: giới thiệu', tier: 'easy', seed: 301, introduces: 'frozen',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 7, slack: 3, frozen: 1, forbid: { brake: true, undo: true } } },
  // L52
  { concept: 'Thạch đóng băng trên bàn chữ nhật', tier: 'medium', seed: 302,
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 3, walls: [1, 3], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 2, frozen: 1, forbid: { undo: true } } },
  // L53
  { concept: 'Thạch đóng băng, chỉ 2 màu', tier: 'medium', seed: 303,
    spec: { ...base, shape: { name: 'L', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 3], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 2, frozen: 1, colors: 2, forbid: { undo: true } } },
  // L54
  { concept: 'Thạch đóng băng cộng ô mũi tên', tier: 'medium', seed: 304,
    spec: { ...base, shape: { name: 'hex', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 2], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 2, frozen: 1, arrows: 1, forbid: { undo: true } } },
  // L55
  { concept: 'KHÓ: thạch đóng băng, phanh bắt buộc', tier: 'hard', seed: 305,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 5], minMoves: 9, maxMinMoves: 10, maxMoves: 10, slack: 1, frozen: 1, require: { brake: true } } },
  // L56
  { concept: 'Cổng đóng băng: giới thiệu', tier: 'easy', seed: 306, introduces: 'lock',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 7, slack: 3, locks: 1, require: { gateMatters: true }, forbid: { brake: true, undo: true } } },
  // L57
  { concept: 'Cổng đóng băng, chỉ 2 màu', tier: 'medium', seed: 307,
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 3, walls: [1, 3], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 2, locks: 1, colors: 2, forbid: { undo: true } } },
  // L58
  { concept: 'Cổng đóng băng cộng ô dính', tier: 'medium', seed: 308,
    spec: { ...base, shape: { name: 'hourglass', n: 7 }, width: 7, height: 7, balls: 3, walls: [2, 3], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 2, locks: 1, sticky: 1, forbid: { undo: true } } },
  // L59
  { concept: 'Cổng đóng băng cộng thạch đóng băng', tier: 'medium', seed: 309,
    spec: { ...base, shape: { name: 'L', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 3], minMoves: 7, maxMinMoves: 8, maxMoves: 9, slack: 2, locks: 1, frozen: 1, forbid: { undo: true } } },
  // L60
  { concept: 'SIÊU KHÓ: cổng đóng băng, phanh bắt buộc', tier: 'super', seed: 310,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 5], minMoves: 9, maxMinMoves: 10, maxMoves: 10, slack: 1, locks: 1, require: { brake: true } } },
  // L61
  { concept: 'Cổng theo nhịp: giới thiệu', tier: 'easy', seed: 311, introduces: 'rhythm',
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 4, maxMinMoves: 5, maxMoves: 7, slack: 3, rhythm: 1, require: { gateMatters: true }, forbid: { brake: true, undo: true } } },
  // L62
  { concept: 'Cổng theo nhịp, chỉ 2 màu', tier: 'medium', seed: 312,
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 3, walls: [1, 3], minMoves: 5, maxMinMoves: 6, maxMoves: 7, slack: 2, rhythm: 1, colors: 2, forbid: { undo: true } } },
  // L63
  { concept: 'Cổng theo nhịp cộng cổng dịch chuyển', tier: 'medium', seed: 313,
    spec: { ...base, shape: { name: 'ring', n: 6 }, width: 6, height: 6, balls: 3, walls: [2, 4], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 2, rhythm: 1, portals: 1, forbid: { undo: true } } },
  // L64
  { concept: 'Cổng theo nhịp cộng ô mũi tên', tier: 'medium', seed: 314,
    spec: { ...base, shape: { name: 'stairs', n: 6 }, width: 6, height: 6, balls: 3, walls: [2, 3], minMoves: 6, maxMinMoves: 7, maxMoves: 8, slack: 2, rhythm: 1, arrows: 1, forbid: { undo: true } } },
  // L65
  { concept: 'KHÓ: cổng theo nhịp cộng cổng đóng băng, phanh bắt buộc', tier: 'hard', seed: 315,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 5], minMoves: 8, maxMinMoves: 9, maxMoves: 9, slack: 1, rhythm: 1, locks: 1, require: { brake: true } } },
  // L66
  { concept: 'Hồi sức: bàn chữ nhật', tier: 'easy', seed: 316,
    spec: { ...base, shape: { name: 'rect', n: 6, h: 5 }, width: 6, height: 5, balls: 3, walls: [1, 2], minMoves: 5, maxMinMoves: 5, maxMoves: 8, slack: 3, forbid: { brake: true, undo: true } } },
  // L67
  { concept: 'Thạch đóng băng cộng cổng theo nhịp', tier: 'medium', seed: 317,
    spec: { ...base, shape: { name: 'diamond', n: 3 }, width: 7, height: 7, balls: 3, walls: [2, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 9, slack: 2, frozen: 1, rhythm: 1, forbid: { undo: true } } },
  // L68
  { concept: 'Cổng đóng băng cộng ô mũi tên', tier: 'medium', seed: 318,
    spec: { ...base, shape: { name: 'ring', n: 6 }, width: 6, height: 6, balls: 3, walls: [2, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 9, slack: 2, locks: 1, arrows: 1, forbid: { undo: true } } },
  // L69
  { concept: 'Thạch đóng băng cộng cổng dịch chuyển', tier: 'medium', seed: 319,
    spec: { ...base, shape: { name: 'hex', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 2], minMoves: 7, maxMinMoves: 8, maxMoves: 9, slack: 2, frozen: 1, portals: 1, forbid: { undo: true } } },
  // L70
  { concept: 'SIÊU KHÓ: đóng băng, khoá cổng và nhịp, phanh bắt buộc', tier: 'super', seed: 320,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 5], minMoves: 9, maxMinMoves: 10, maxMoves: 10, slack: 1, frozen: 1, locks: 1, rhythm: 1, require: { brake: true } } },
  // L71
  { concept: 'Ô dính cộng cổng theo nhịp', tier: 'medium', seed: 321,
    spec: { ...base, shape: { name: 'L', n: 7 }, width: 7, height: 7, balls: 3, walls: [2, 4], minMoves: 7, maxMinMoves: 8, maxMoves: 9, slack: 2, sticky: 1, rhythm: 1, forbid: { undo: true } } },
  // L72
  { concept: 'Thạch đóng băng cộng ô dính', tier: 'medium', seed: 322,
    spec: { ...base, shape: { name: 'stairs', n: 6 }, width: 6, height: 6, balls: 3, walls: [2, 3], minMoves: 7, maxMinMoves: 8, maxMoves: 9, slack: 2, frozen: 1, sticky: 1, forbid: { undo: true } } },
  // L73
  { concept: 'Khoá cổng, cổng dịch chuyển và ô mũi tên', tier: 'medium', seed: 323,
    spec: { ...base, shape: { name: 'hex', n: 6 }, width: 6, height: 6, balls: 3, walls: [1, 2], minMoves: 8, maxMinMoves: 8, maxMoves: 10, slack: 2, locks: 1, portals: 1, arrows: 1, forbid: { undo: true } } },
  // L74
  { concept: 'Hồi sức: bàn vuông', tier: 'easy', seed: 324,
    spec: { ...base, shape: { name: 'rect', n: 5 }, width: 5, height: 5, balls: 3, walls: [1, 2], minMoves: 5, maxMinMoves: 5, maxMoves: 8, slack: 3, forbid: { brake: true, undo: true } } },
  // L75
  { concept: 'KHÓ — CUỐI GĐ2: đóng băng, khoá cổng, nhịp, dịch chuyển, phanh bắt buộc', tier: 'hard', seed: 325,
    spec: { ...base, shape: { name: 'hex', n: 7 }, width: 7, height: 7, balls: 3, walls: [3, 5], minMoves: 10, maxMinMoves: 11, maxMoves: 11, slack: 1, frozen: 1, locks: 1, rhythm: 1, portals: 1, require: { brake: true } } },
];
