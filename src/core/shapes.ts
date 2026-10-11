// Thư viện hình dạng bàn: mỗi hàm trả về mặt nạ (các hàng '#' = ô chơi được, '.' = ngoài bàn) cho `Level.mask`.

export type ShapeName = 'rect' | 'diamond' | 'triangle' | 'cross' | 'L' | 'ring' | 'hourglass' | 'hex' | 'stairs';

export interface ShapeDef {
  name: ShapeName;
  /** Kích thước khung bao. `n` là cỡ chính (bán kính, số hàng...) tuỳ hình; `h` cho hình chữ nhật. */
  n: number;
  h?: number;
}

const row = (w: number, f: (x: number) => boolean): string => Array.from({ length: w }, (_, x) => (f(x) ? '#' : '.')).join('');

/** Mặt nạ của hình `def`; chữ nhật trả về null (không cần mặt nạ). */
export function shapeMask(def: ShapeDef): { width: number; height: number; mask: string[] | null } {
  const n = def.n;
  switch (def.name) {
    case 'rect':
      return { width: n, height: def.h ?? n, mask: null };
    case 'diamond': {
      // bán kính n: khung (2n+1)x(2n+1)
      const w = 2 * n + 1;
      return { width: w, height: w, mask: Array.from({ length: w }, (_, y) => row(w, (x) => Math.abs(x - n) + Math.abs(y - n) <= n)) };
    }
    case 'triangle': {
      // kim tự tháp n hàng: hàng i có 2i+1 ô, canh giữa
      const w = 2 * n - 1;
      return { width: w, height: n, mask: Array.from({ length: n }, (_, y) => row(w, (x) => Math.abs(x - (n - 1)) <= y)) };
    }
    case 'cross': {
      // chữ thập n x n, cánh rộng 3 (n lẻ)
      const half = Math.floor(n / 2);
      return { width: n, height: n, mask: Array.from({ length: n }, (_, y) => row(n, (x) => Math.abs(x - half) <= 1 || Math.abs(y - half) <= 1)) };
    }
    case 'L': {
      // chữ L n x n, nét dày 2
      return { width: n, height: n, mask: Array.from({ length: n }, (_, y) => row(n, (x) => x < 2 || y >= n - 2)) };
    }
    case 'ring': {
      // vòng n x n, lỗ ở giữa rộng 2 (n chẵn) hoặc 1 (n lẻ)
      const hole = n % 2 === 0 ? 2 : 1;
      const lo = Math.floor((n - hole) / 2);
      return { width: n, height: n, mask: Array.from({ length: n }, (_, y) => row(n, (x) => !(x >= lo && x < lo + hole && y >= lo && y < lo + hole))) };
    }
    case 'hourglass': {
      // đồng hồ cát n x n (n lẻ): rộng ở hai đầu, thắt ở giữa
      const half = Math.floor(n / 2);
      return {
        width: n,
        height: n,
        mask: Array.from({ length: n }, (_, y) => {
          const d = Math.abs(y - half); // khoảng cách tới hàng giữa
          const w = Math.max(1, 1 + 2 * d);
          return row(n, (x) => Math.abs(x - half) <= (w - 1) / 2);
        }),
      };
    }
    case 'hex': {
      // lục giác: hình vuông n x n cắt bốn góc, mỗi góc cắt tam giác cạnh c = floor(n / 3)
      const c = Math.max(1, Math.floor(n / 3));
      return {
        width: n,
        height: n,
        mask: Array.from({ length: n }, (_, y) => row(n, (x) => x + y >= c && x + (n - 1 - y) >= c && n - 1 - x + y >= c && 2 * (n - 1) - x - y >= c)),
      };
    }
    case 'stairs': {
      // bậc thang n x n: hàng y có y+1 ô, dồn trái
      return { width: n, height: n, mask: Array.from({ length: n }, (_, y) => row(n, (x) => x <= y)) };
    }
  }
}

/** Số ô chơi được của một mặt nạ. */
export const cellCount = (mask: string[] | null, w: number, h: number): number => (mask ? mask.join('').split('#').length - 1 : w * h);
