// Font chữ của game: Lilita One (SIL OFL, xem src/assets/fonts/LilitaOne-OFL.txt). Nhúng thẳng vào file build qua import của Vite.
// Game dùng tiếng Anh nên chỉ cần bộ chữ Latin.

import lilitaUrl from './assets/fonts/lilita-one-latin-400-normal.woff2?url';

export const FONT_STACK = '"Lilita One",system-ui,"Segoe UI",Roboto,sans-serif';

/** Tải font vào trang. Không tải được thì chữ dùng font dự phòng trong FONT_STACK. */
export async function loadFonts(): Promise<void> {
  try {
    document.fonts.add(await new FontFace('Lilita One', `url(${lilitaUrl}) format('woff2')`).load());
  } catch {
    /* dùng font dự phòng */
  }
}
