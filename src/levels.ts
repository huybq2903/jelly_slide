import type { Level } from './core/rules';
import type { BoosterKey, Move } from './core/solver';
import data from './levels.json';

export interface LevelEntry {
  /** Số lượt tối thiểu theo solver, lúc sinh. */
  minMoves: number;
  level: Level;
  tier?: 'easy' | 'medium' | 'hard' | 'super';
  concept?: string;
  needs?: { brake: boolean; undo: boolean };
  /** Booster giúp ngắn hơn ở level này (level luôn giải được không cần booster). */
  helps?: BoosterKey;
  /** Lời giải của solver (kể cả booster), nguồn cho các bước hướng dẫn. */
  solution?: Move[];
  tutorial?: { moves: string[]; intro?: string; undoDemo?: boolean; steps?: string[] };
  unlocks?: BoosterKey;
  /** Mechanic được giới thiệu ở level này bằng một popup. */
  introduces?: string;
}

/** Bộ level sinh sẵn bởi `npm run gen:levels` từ kịch bản. Mọi level dùng đồng hồ vệt 'owner' (vệt chỉ già đi khi khối tạo ra nó di chuyển). */
export const LEVELS = data as unknown as LevelEntry[];
