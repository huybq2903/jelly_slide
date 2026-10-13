// Font chữ của game: Nunito Black (SIL OFL, xem src/assets/fonts/Nunito-OFL.txt), tròn và dày hợp phong cách thạch, có đủ dấu tiếng Việt.
// Nhúng thẳng vào file build qua import của Vite, chia ba bộ chữ (Latin, Latin mở rộng, Việt) và chọn theo unicode-range như CSS.

import latinUrl from './assets/fonts/nunito-latin-900-normal.woff2?url';
import latinExtUrl from './assets/fonts/nunito-latin-ext-900-normal.woff2?url';
import vietUrl from './assets/fonts/nunito-vietnamese-900-normal.woff2?url';

export const FONT_STACK = '"Nunito",system-ui,"Segoe UI",Roboto,sans-serif';

const FACES: { url: string; range: string }[] = [
  { url: vietUrl, range: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB' },
  { url: latinExtUrl, range: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
  { url: latinUrl, range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
];

/** Tải font vào trang. Không tải được thì chữ dùng font dự phòng trong FONT_STACK. */
export async function loadFonts(): Promise<void> {
  try {
    // khai báo weight 400 để canvas (ctx.font không ghi weight) chọn đúng bộ chữ này mà không giả in đậm
    const faces = await Promise.all(FACES.map((f) => new FontFace('Nunito', `url(${f.url}) format('woff2')`, { weight: '400', unicodeRange: f.range }).load()));
    for (const face of faces) document.fonts.add(face);
  } catch {
    /* dùng font dự phòng */
  }
}
